import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createSyncManager } from '../src/sync/manager.js';
import { loadPairings, resetDeviceIdCache } from '../src/sync/state.js';

// ── WebRTC test double ──────────────────────────────────────────────────────
// The real transport needs a full ICE agent; the manager tests only care about
// the message flow over the data channel, so the peer connection is stubbed.

class FakeDataChannel {
  constructor(label = 'ownspace-sync') {
    this.label = label;
    this.readyState = 'connecting';
    this.sent = [];
    this._listeners = {};
  }
  addEventListener(type, fn) {
    (this._listeners[type] ||= []).push(fn);
  }
  _emit(type, arg) {
    for (const fn of this._listeners[type] || []) fn(arg);
  }
  open() {
    this.readyState = 'open';
    this._emit('open');
  }
  close() {
    this.readyState = 'closed';
    this._emit('close');
  }
  send(data) {
    this.sent.push(data);
  }
  deliver(msg) {
    this._emit('message', { data: JSON.stringify(msg) });
  }
}

class FakePeerConnection {
  constructor() {
    this.iceConnectionState = 'new';
    this.iceGatheringState = 'complete';
    this._listeners = {};
    this._dc = null;
  }
  addEventListener(type, fn) {
    (this._listeners[type] ||= []).push(fn);
  }
  _emit(type, arg) {
    for (const fn of this._listeners[type] || []) fn(arg);
  }
  createDataChannel(label) {
    this._dc = new FakeDataChannel(label);
    return this._dc;
  }
  async createOffer() {
    return { type: 'offer', sdp: OFFER_SDP };
  }
  async createAnswer() {
    return { type: 'answer', sdp: ANSWER_SDP };
  }
  async setLocalDescription(d) {
    this.localDescription = d;
    this.iceGatheringState = 'complete';
    this.iceConnectionState = 'complete';
  }
  async setRemoteDescription(d) {
    this.remoteDescription = d;
  }
  close() {
    this.iceConnectionState = 'closed';
  }
  /** The other side accepts: the master learns a channel opened. */
  acceptChannel() {
    const dc = new FakeDataChannel();
    this._emit('datachannel', { channel: dc });
    return dc;
  }
}

// The blob codec is exercised for real here (it is what carries the handshake),
// so the fake SDP has to be valid input for it.
const OFFER_SDP = [
  'v=0',
  'o=- 4611731400430059396 2 IN IP4 127.0.0.1',
  's=-',
  't=0 0',
  'm=application 9 UDP/DTLS/SCTP webrtc-datachannel',
  'a=ice-ufrag:AbCdEfGh',
  'a=ice-pwd:abcdefghijklmnopqrstuvwxyz0123456789',
  ...Array.from(
    { length: 8 },
    (_, i) =>
      `a=candidate:1 ${i + 1} udp 2130706431 192.168.1.${10 + i} ${50000 + i} typ host generation 0`,
  ),
  'a=end-of-candidates',
  '',
].join('\r\n');

const ANSWER_SDP = [
  'v=0',
  'o=- 4611731400430059397 2 IN IP4 127.0.0.1',
  's=-',
  't=0 0',
  'm=application 9 UDP/DTLS/SCTP webrtc-datachannel',
  'a=ice-ufrag:ZyXwVuTs',
  'a=ice-pwd:0123456789abcdefghijklmnopqrstuv',
  'a=end-of-candidates',
  '',
].join('\r\n');

let lastPc = null;

/** A real offer blob — the codec is what actually carries the handshake. */
async function makeOfferBlob(name = '') {
  const { encodeSdpBlob } = await import('../src/sync/transport.js');
  return encodeSdpBlob(OFFER_SDP, 'offer', name);
}

beforeEach(() => {
  resetDeviceIdCache();
  lastPc = null;
  globalThis.RTCPeerConnection = class extends FakePeerConnection {
    constructor() {
      super();
      lastPc = this;
    }
  };
  // CompressionStream/DecompressionStream exist in Node 22+, but the blob codec
  // is not what these tests exercise — keep the stub honest anyway.
  globalThis.compress = undefined;
});

describe('sync manager — roles', () => {
  it('startPairing puts the initiator in the slave role', async () => {
    const mgr = createSyncManager();
    await mgr.startPairing({ name: 'Laptop', code: '7291' });
    expect(mgr.role).toBe('slave');
  });

  it('receiveOffer puts the accepter in the master role', async () => {
    const mgr = createSyncManager();
    await mgr.receiveOffer({ blob: await makeOfferBlob('Laptop'), code: '7291' });
    expect(mgr.role).toBe('master');
  });

  it('refuses to start pairing without a code', async () => {
    const mgr = createSyncManager();
    await expect(mgr.startPairing({ name: 'X', code: '' })).rejects.toThrow();
  });
});

describe('sync manager — master pushes, slave receives', () => {
  it('master asks for approval before pushing anything', async () => {
    const onRequest = vi.fn(async () => false);
    const mgr = createSyncManager({ onRequest });
    await mgr.receiveOffer({ blob: await makeOfferBlob('Laptop'), code: '7291' });
    const dc = lastPc.acceptChannel();
    dc.open();
    expect(onRequest).toHaveBeenCalled();
    // Rejected: nothing was sent.
    expect(dc.sent).toHaveLength(0);
  });

  it('master pushes the state after approval', async () => {
    const mgr = createSyncManager({ onRequest: async () => true });
    await mgr.receiveOffer({ blob: await makeOfferBlob('Laptop'), code: '7291' });
    const dc = lastPc.acceptChannel();
    dc.open();
    // The push is async (export + encrypt), give it a tick.
    await vi.waitFor(() => expect(dc.sent.length).toBeGreaterThan(0));
    const msg = JSON.parse(dc.sent[0]);
    expect(msg.type).toBe('state-push');
  });

  it('the pushed payload carries no CalDAV credentials', async () => {
    const mgr = createSyncManager({ onRequest: async () => true });
    await mgr.receiveOffer({ blob: await makeOfferBlob('Laptop'), code: '7291' });
    const dc = lastPc.acceptChannel();
    dc.open();
    await vi.waitFor(() => expect(dc.sent.length).toBeGreaterThan(0));
    const msg = JSON.parse(dc.sent[0]);
    // The payload is encrypted, so the check is on the plaintext: decrypt with
    // the same pairing code and make sure no credentials came along.
    const { decryptJson } = await import('../src/crypto.js');
    const plain = await decryptJson(msg.payload.enc, '7291');
    expect(plain.caldav).toBeUndefined();
  });
});

describe('sync manager — pairing records', () => {
  it('the master records the slave when it confirms', async () => {
    const mgr = createSyncManager({ onRequest: async () => true });
    await mgr.receiveOffer({ blob: await makeOfferBlob('Laptop'), code: '7291' });
    const dc = lastPc.acceptChannel();
    dc.open();
    await vi.waitFor(() => expect(dc.sent.length).toBeGreaterThan(0));
    // The slave answers with PAIR_ACCEPT, carrying its own id and name.
    dc.deliver({ type: 'pair-accept', payload: { from: 'dev-slave-1', name: 'Laptop' } });
    await vi.waitFor(async () => {
      const { pairings } = await loadPairings();
      expect(pairings).toHaveLength(1);
    });
    const { pairings } = await loadPairings();
    expect(pairings[0].id).toBe('dev-slave-1');
    expect(pairings[0].name).toBe('Laptop');
    // The master remembers itself as the master of that link.
    expect(pairings[0].role).toBe('master');
  });

  it('the slave records the master from the push it receives', async () => {
    const mgr = createSyncManager();
    await mgr.startPairing({ name: 'Laptop', code: '7291' });
    const dc = lastPc._dc;
    // A master pushes an encrypted state. Build it the same way the master
    // would, so the slave can decrypt it.
    const { encryptJson } = await import('../src/crypto.js');
    const enc = await encryptJson({ workspaces: [], settings: {} }, '7291');
    dc.open();
    dc.deliver({
      type: 'state-push',
      payload: { enc, from: 'dev-master-1', name: 'Desktop' },
    });
    await vi.waitFor(async () => {
      const { pairings } = await loadPairings();
      expect(pairings).toHaveLength(1);
    });
    const { pairings } = await loadPairings();
    expect(pairings[0].id).toBe('dev-master-1');
    expect(pairings[0].name).toBe('Desktop');
    expect(pairings[0].role).toBe('slave');
  });

  it('the slave answers the push with a confirmation carrying its name', async () => {
    const mgr = createSyncManager();
    await mgr.startPairing({ name: 'Laptop', code: '7291' });
    const dc = lastPc._dc;
    const { encryptJson } = await import('../src/crypto.js');
    const enc = await encryptJson({ workspaces: [], settings: {} }, '7291');
    dc.open();
    dc.deliver({
      type: 'state-push',
      payload: { enc, from: 'dev-master-1', name: 'Desktop' },
    });
    await vi.waitFor(() => expect(dc.sent.length).toBeGreaterThan(0));
    const msg = JSON.parse(dc.sent[0]);
    expect(msg.type).toBe('pair-accept');
    expect(msg.payload.name).toBe('Laptop');
  });
});

describe('sync manager — error handling', () => {
  it('reports a decrypt failure instead of applying garbage', async () => {
    const onStatus = vi.fn();
    const mgr = createSyncManager({ onStatus });
    await mgr.startPairing({ name: 'Laptop', code: '7291' });
    const dc = lastPc._dc;
    const { encryptJson } = await import('../src/crypto.js');
    // Encrypted with a different code — the slave cannot read it.
    const enc = await encryptJson({ workspaces: [] }, 'wrong-code');
    dc.open();
    dc.deliver({ type: 'state-push', payload: { enc, from: 'dev-x' } });
    await vi.waitFor(() => {
      const called = onStatus.mock.calls.map((c) => c[0]);
      expect(called).toContain('error');
    });
  });

  it('ignores messages that are not valid sync frames', async () => {
    const onStatus = vi.fn();
    const mgr = createSyncManager({ onStatus });
    await mgr.startPairing({ name: 'Laptop', code: '7291' });
    const dc = lastPc._dc;
    dc.open();
    dc._emit('message', { data: 'not json' });
    dc._emit('message', { data: '{"type":123}' });
    expect(onStatus).not.toHaveBeenCalledWith('error', expect.anything());
  });
});
