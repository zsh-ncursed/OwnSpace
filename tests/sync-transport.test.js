import { describe, it, expect } from 'vitest';
import {
  encodeSdpBlob,
  decodeSdpBlob,
  encodeSyncMessage,
  decodeSyncMessage,
  sanitizeBlobInput,
  createOffer,
  acceptOffer,
  acceptAnswer,
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

// ── paste hygiene and handshake guards ─────────────────────────────────────
// The blob travels through messengers that wrap lines and inject invisible
// characters, and the wizards have two paste fields users mix up. These tests
// pin the defenses around that.

describe('sync transport: paste hygiene and handshake guards', () => {
  it('strips everything outside the base64url alphabet', () => {
    expect(sanitizeBlobInput(' ab-1\r\n\tde ')).toBe('ab-1de');
    expect(sanitizeBlobInput('a\u00A0b\u200Bc\u200Dd')).toBe('abcd');
    expect(sanitizeBlobInput('"abc"`')).toBe('abc');
    expect(sanitizeBlobInput(undefined)).toBe('');
  });

  it('decodes a blob that was wrapped or polluted on the way', async () => {
    const blob = await encodeSdpBlob(SAMPLE_OFFER, 'offer');
    const polluted = ` \n${blob.slice(0, 20)}\u00A0${blob.slice(20)}\u200B\n `;
    const decoded = await decodeSdpBlob(polluted);
    expect(decoded.type).toBe('offer');
    expect(decoded.sdp).toBe(SAMPLE_OFFER);
  });

  it('rejects a pasted answer in the offer field and vice versa', async () => {
    const offerBlob = await encodeSdpBlob(SAMPLE_OFFER, 'offer');
    const answerBlob = await encodeSdpBlob(SAMPLE_OFFER, 'answer');
    // The type check fires before any peer connection is created.
    await expect(acceptOffer(answerBlob)).rejects.toMatchObject({
      code: 'wrong_blob_type',
    });
    await expect(acceptAnswer(offerBlob, {})).rejects.toMatchObject({
      code: 'wrong_blob_type',
    });
  });

  it('refuses to hand out a blob with no candidates', async () => {
    // SAMPLE_OFFER carries no a=candidate lines — what a stalled gatherer
    // produces when the 5 s cap in waitForIceGathering runs out.
    globalThis.RTCPeerConnection = class {
      constructor() {
        this.iceGatheringState = 'complete';
        this.iceConnectionState = 'new';
      }
      createDataChannel() {
        return {};
      }
      async createOffer() {
        return { type: 'offer', sdp: SAMPLE_OFFER };
      }
      async createAnswer() {
        return { type: 'answer', sdp: SAMPLE_OFFER };
      }
      async setLocalDescription(d) {
        this.localDescription = d;
      }
      async setRemoteDescription() {}
      addEventListener() {}
    };
    try {
      await expect(createOffer('X')).rejects.toMatchObject({
        code: 'no_candidates',
      });
      const offerBlob = await encodeSdpBlob(SAMPLE_OFFER, 'offer');
      await expect(acceptOffer(offerBlob)).rejects.toMatchObject({
        code: 'no_candidates',
      });
    } finally {
      delete globalThis.RTCPeerConnection;
    }
  });

  it('accepts a real offer and answers with a decodable blob', async () => {
    globalThis.RTCPeerConnection = class {
      constructor() {
        this.iceGatheringState = 'complete';
        this.iceConnectionState = 'new';
      }
      createDataChannel() {
        return {};
      }
      async setRemoteDescription() {}
      async createAnswer() {
        return { type: 'answer', sdp: REALISTIC_OFFER };
      }
      async setLocalDescription(d) {
        this.localDescription = d;
      }
      addEventListener() {}
    };
    try {
      const offerBlob = await encodeSdpBlob(REALISTIC_OFFER, 'offer');
      const res = await acceptOffer(offerBlob);
      const decoded = await decodeSdpBlob(res.blob);
      expect(decoded.type).toBe('answer');
      expect(decoded.sdp).toBe(REALISTIC_OFFER);
    } finally {
      delete globalThis.RTCPeerConnection;
    }
  });
});
