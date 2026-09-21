import { describe, it, expect } from 'vitest';
import {
  encodeSdpBlob,
  decodeSdpBlob,
  encodeSyncMessage,
  decodeSyncMessage,
  MSG,
} from '../src/sync/transport.js';

const SAMPLE_OFFER =
  'v=0\r\no=- 1 1 IN IP4 0.0.0.0\r\ns=-\r\nt=0 0\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\na=ice-ufrag:abcd\r\n';

// A realistic offer is ~2-3 kB of mostly redundant boilerplate — what the blob
// codec exists to shrink. Tiny samples don't compress at all (deflate overhead
// beats the savings), so this one mirrors the real thing: repetitive
// fingerprint/ICE lines over many candidates.
const REALISTIC_OFFER = [
  'v=0',
  'o=- 4611731400430059396 2 IN IP4 127.0.0.1',
  's=-',
  't=0 0',
  'a=group:BUNDLE 0',
  'a=extmap-allow-mixed',
  'a=msid-semantic: WMS',
  'm=application 9 UDP/DTLS/SCTP webrtc-datachannel',
  'c=IN IP4 0.0.0.0',
  'a=ice-ufrag:AbCdEfGh',
  'a=ice-pwd:abcdefghijklmnopqrstuvwxyz0123456789',
  'a=ice-options:trickle',
  'a=fingerprint:sha-256 11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11',
  'a=setup:actpass',
  'a=mid:0',
  'a=sctp-port:5000',
  'a=max-message-size:262144',
  ...Array.from(
    { length: 24 },
    (_, i) =>
      `a=candidate:1 ${i + 1} udp 2130706431 192.168.1.${10 + i} ${50000 + i} typ host generation 0 network-cost 999`,
  ),
  ...Array.from(
    { length: 12 },
    (_, i) =>
      `a=candidate:2 ${i + 1} tcp 1518280447 192.168.1.${10 + i} ${60000 + i} typ host tcptype passive generation 0 network-cost 999`,
  ),
  'a=end-of-candidates',
].join('\r\n') + '\r\n';

describe('sync transport: SDP blob codec', () => {
  it('round-trips an offer', async () => {
    const blob = await encodeSdpBlob(SAMPLE_OFFER, 'offer');
    const decoded = await decodeSdpBlob(blob);
    expect(decoded.type).toBe('offer');
    expect(decoded.sdp).toBe(SAMPLE_OFFER);
  });

  it('round-trips an answer', async () => {
    const blob = await encodeSdpBlob(SAMPLE_OFFER, 'answer');
    const decoded = await decodeSdpBlob(blob);
    expect(decoded.type).toBe('answer');
    expect(decoded.sdp).toBe(SAMPLE_OFFER);
  });

  it('distinguishes offer and answer in the same codec', async () => {
    const a = await decodeSdpBlob(await encodeSdpBlob(SAMPLE_OFFER, 'offer'));
    const b = await decodeSdpBlob(await encodeSdpBlob(SAMPLE_OFFER, 'answer'));
    expect(a.type).toBe('offer');
    expect(b.type).toBe('answer');
  });

  it('produces copy-paste-sized blobs for a realistic SDP', async () => {
    const blob = await encodeSdpBlob(REALISTIC_OFFER, 'offer');
    // Real SDP is ~2-3 kB and compresses several-fold; the blob must stay
    // comfortably inside a textarea-paste budget (a few hundred chars).
    expect(blob.length).toBeLessThan(REALISTIC_OFFER.length / 2);
  });

  it('round-trips unicode payloads (device names can be non-ascii)', async () => {
    const sdp = 'a=label:Ноутбук\r\n';
    const decoded = await decodeSdpBlob(await encodeSdpBlob(sdp, 'offer'));
    expect(decoded.sdp).toBe(sdp);
  });

  it('rejects a corrupted blob instead of silently yielding garbage', async () => {
    await expect(decodeSdpBlob('not-a-valid-blob!!!')).rejects.toThrow();
  });

  it('carries the device name so the master needs no second field', async () => {
    const blob = await encodeSdpBlob(SAMPLE_OFFER, 'offer', 'Ноутбук');
    const decoded = await decodeSdpBlob(blob);
    expect(decoded.name).toBe('Ноутбук');
  });

  it('clamps an over-long device name instead of rejecting it', async () => {
    const long = 'L'.repeat(64);
    const decoded = await decodeSdpBlob(await encodeSdpBlob(SAMPLE_OFFER, 'offer', long));
    expect(decoded.name).toHaveLength(32);
  });

  it('still decodes a legacy blob that has no name field', async () => {
    // A blob from a build predating the name field: decoding must not break,
    // the name just comes back empty.
    const json = JSON.stringify({ t: 0, s: SAMPLE_OFFER });
    const bytes = await new Response(
      new ReadableStream({
        start(c) {
          c.enqueue(new TextEncoder().encode(json));
          c.close();
        },
      }).pipeThrough(new CompressionStream('deflate-raw')),
    ).arrayBuffer();
    const blob = btoa(String.fromCharCode(...new Uint8Array(bytes)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    const decoded = await decodeSdpBlob(blob);
    expect(decoded.type).toBe('offer');
    expect(decoded.sdp).toBe(SAMPLE_OFFER);
    expect(decoded.name).toBe('');
  });
});

describe('sync transport: sync messages', () => {
  it('encodes and decodes a message with payload', () => {
    const str = encodeSyncMessage(MSG.STATE_PUSH, { enc: { salt: [1, 2, 3] } });
    const m = decodeSyncMessage(str);
    expect(m).not.toBeNull();
    expect(m.type).toBe(MSG.STATE_PUSH);
    expect(m.payload).toEqual({ enc: { salt: [1, 2, 3] } });
    expect(m.v).toBe(1);
  });

  it('decodes a payload-less message', () => {
    const str = encodeSyncMessage(MSG.PAIR_REJECT);
    const m = decodeSyncMessage(str);
    expect(m.type).toBe(MSG.PAIR_REJECT);
    expect(m.payload).toBeNull();
  });

  it('returns null for malformed input', () => {
    expect(decodeSyncMessage('{not json')).toBeNull();
    expect(decodeSyncMessage(JSON.stringify({ no_type: true }))).toBeNull();
    expect(decodeSyncMessage(JSON.stringify({ type: 123 }))).toBeNull();
  });
});
