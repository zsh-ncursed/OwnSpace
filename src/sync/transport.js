/**
 * LAN device sync — transport layer.
 *
 * Two OwnSpace instances in the same network link over WebRTC data channels.
 * WebRTC needs an SDP (offer/answer) exchange before a channel exists; since
 * WebExtensions cannot listen on ports, there is no signaling server — the SDP
 * is exchanged by hand: the slave copies a blob code (compressed offer), pastes
 * it on the master, and the master answers with a second blob code.
 *
 * A short pairing code typed on both sides doubles as the AES-GCM password for
 * the sync payload — the same PBKDF2 scheme as encrypted exports, so nothing
 * new has to be trusted.
 *
 * Roles are decided by who initiates: the side that creates the offer is the
 * slave (it only ever receives state); the side that answers is the master (it
 * only ever sends state).
 *
 * Blob codes are SDP wrapped in JSON, deflated (CompressionStream — supported
 * in Firefox 113+ / Chrome 80+, well under the manifest's strict_min_version)
 * and base64url-encoded. SDP is mostly redundant boilerplate, so it compresses
 * to a few hundred bytes — copy/paste sized, never typed by hand.
 */

const ICE_GATHER_TIMEOUT = 5000;
const CHANNEL_LABEL = 'ownspace-sync';

/**
 * Create an offer for the slave side: returns { blob, pc }.
 * The blob is pasted on the master. ICE candidates are gathered eagerly so the
 * offer is self-contained (trickle would require a third exchange step).
 */
export async function createOffer() {
  const pc = createPeerConnection();
  // Receiver-only on the slave side; the master will fill the channel.
  pc['ownspace-dc'] = pc.createDataChannel(CHANNEL_LABEL, { ordered: true });
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  await waitForIceGathering(pc);
  const blob = await encodeSdpBlob(pc.localDescription.sdp, 'offer');
  return { blob, pc };
}

/**
 * Accept an offer on the master side: takes the slave's blob, returns
 * { blob, pc } with the answer to paste back on the slave.
 */
export async function acceptOffer(blob) {
  const { sdp } = await decodeSdpBlob(blob);
  const pc = createPeerConnection();
  await pc.setRemoteDescription({ type: 'offer', sdp });
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  await waitForIceGathering(pc);
  const answerBlob = await encodeSdpBlob(pc.localDescription.sdp, 'answer');
  return { blob: answerBlob, pc };
}

/**
 * Apply the master's answer on the slave side.
 */
export async function acceptAnswer(blob, pc) {
  const { sdp } = await decodeSdpBlob(blob);
  await pc.setRemoteDescription({ type: 'answer', sdp });
}

function createPeerConnection() {
  return new RTCPeerConnection({
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
  });
}

function waitForIceGathering(pc) {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  let timer;
  // First connection: wait for completion, but cap it — mDNS/STUN can stall.
  const timeout = new Promise((resolve) => {
    timer = setTimeout(resolve, ICE_GATHER_TIMEOUT);
  });
  const complete = new Promise((resolve) => {
    const check = () => {
      if (pc.iceGatheringState === 'complete') {
        pc.removeEventListener('icegatheringstatechange', check);
        clearTimeout(timer);
        resolve();
      }
    };
    pc.addEventListener('icegatheringstatechange', check);
  });
  return Promise.race([complete, timeout]);
}

// ── blob codec (pure, exported for tests) ──────────────────────────────────

export async function encodeSdpBlob(sdp, type) {
  const json = JSON.stringify({ t: type === 'answer' ? 1 : 0, s: sdp });
  const bytes = await compress(json);
  return base64UrlEncode(bytes);
}

export async function decodeSdpBlob(blob) {
  const bytes = base64UrlDecode(blob);
  const json = await decompress(bytes);
  const parsed = JSON.parse(json);
  return { type: parsed.t === 1 ? 'answer' : 'offer', sdp: parsed.s };
}

async function compress(str) {
  const input = new TextEncoder().encode(str);
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(input);
      controller.close();
    },
  }).pipeThrough(new CompressionStream('deflate-raw'));
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}

async function decompress(bytes) {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  }).pipeThrough(new DecompressionStream('deflate-raw'));
  return await new Response(stream).text();
}

function base64UrlEncode(bytes) {
  let s = btoa(String.fromCharCode(...bytes));
  return s.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(str) {
  const s = str.replace(/-/g, '+').replace(/_/g, '/');
  const padded = s + '='.repeat((4 - (s.length % 4)) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// ── sync messages over the data channel ─────────────────────────────────────

export const MSG = {
  PAIR_REQUEST: 'pair-request',
  PAIR_ACCEPT: 'pair-accept',
  PAIR_REJECT: 'pair-reject',
  STATE_PUSH: 'state-push',
};

export function encodeSyncMessage(type, payload) {
  return JSON.stringify({ type, payload, v: 1 });
}

export function decodeSyncMessage(str) {
  try {
    const m = JSON.parse(str);
    if (typeof m !== 'object' || !m || typeof m.type !== 'string') return null;
    return { type: m.type, payload: m.payload ?? null, v: m.v ?? 0 };
  } catch {
    return null;
  }
}
