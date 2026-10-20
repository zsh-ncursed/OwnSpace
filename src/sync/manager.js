/**
 * Sync manager — glues transport, pairing state and payload application.
 *
 * One instance lives per open OwnSpace tab (see setupSync in ui module). It
 * owns a single RTCPeerConnection and, once the channel is up:
 *
 *   - SLAVE: waits for the master's STATE_PUSH, decrypts it with the pairing
 *     code, merges it into local storage, and confirms with PAIR_ACCEPT.
 *   - MASTER: shows an approval dialog (handled by the UI layer via
 *     onRequest), then on approval builds an encrypted full export and pushes.
 *
 * Roles are set at pairing time by who sent the first request (see state.js).
 * Already-paired slaves reconnect automatically: the offer/answer step is
 * repeated, and the master pushes again on every reconnect — "sync on every
 * connection" rather than once at pairing.
 */

import {
  createOffer,
  acceptOffer,
  acceptAnswer,
  encodeSyncMessage,
  decodeSyncMessage,
  MSG,
} from './transport.js';
import { encryptJson, decryptJson } from '../crypto.js';
import { exportData } from '../export-import.js';
import {
  ROLES,
  getDeviceId,
  getDeviceName,
  loadPairings,
  addPairing,
  removePairing,
} from './state.js';
import { sanitizePayload, mergeWorkspaces, mergeSettings } from './merge.js';
import {
  getWorkspaces,
  saveWorkspaces,
  getSettings,
  saveSettings,
} from '../storage.js';
import { t } from '../i18n/index.js';

/**
 * @param {object} opts
 * @param {function} opts.onRequest  master hook: called with {peerName} when a
 *        pairing request arrives; must resolve to true/false (approve/reject).
 * @param {function} opts.onStatus  status callback: ('idle'|'pending'|'paired'|'syncing'|'error', detail)
 * @param {function} opts.onCode    called with a blob code to copy on the other side.
 */
export function createSyncManager(opts = {}) {
  const { onRequest, onStatus, onCode } = opts;
  const status = (s, detail) => onStatus?.(s, detail);

  let pc = null;
  let channel = null;
  let pendingPairingCode = null; // pairing code typed on this side
  let remoteDeviceId = null;
  let localDeviceName = '';
  // The slave's name, extracted from its offer blob on the master side.
  let peerName = '';
  let role = null;

  function close() {
    try {
      channel?.close();
      pc?.close();
    } catch { /* closing twice is fine */ }
    channel = null;
    pc = null;
    remoteDeviceId = null;
  }

  // ── SLAVE side: start pairing (generate offer) ──────────────────────────
  async function startPairing({ name, code }) {
    if (!code) throw new Error(t('sync.error_no_code'));
    pendingPairingCode = code;
    localDeviceName = name || '';
    role = ROLES.SLAVE;
    status('pending', t('sync.status_creating_offer'));
    close();
    // The name rides inside the offer blob — the master reads it back out and
    // labels the pairing, so no separate step is needed.
    const res = await createOffer(localDeviceName);
    pc = res.pc;
    watchConnection(pc);
    // The slave created the data channel itself, so grab it right away.
    channel = pc['ownspace-dc'];
    wireChannel(channel);
    onCode?.(res.blob, 'offer');
    return res;
  }

  async function applyAnswer(blob) {
    if (!pc) throw new Error(t('sync.error_no_offer'));
    status('pending', t('sync.status_connecting'));
    await acceptAnswer(blob, pc);
  }

  // ── MASTER side: accept a pasted offer, ask for approval, push state ─────
  async function receiveOffer({ blob, code, name }) {
    if (!code) throw new Error(t('sync.error_no_code'));
    pendingPairingCode = code;
    localDeviceName = name || '';
    role = ROLES.MASTER;
    status('pending', t('sync.status_reading_offer'));
    close();
    // The slave's device name travels inside the blob — that is the whole
    // "who is asking" answer, so no extra pairing round-trip is needed.
    const res = await acceptOffer(blob);
    peerName = res.name || '';
    pc = res.pc;
    watchConnection(pc);
    pc.addEventListener('datachannel', (e) => {
      channel = e.channel;
      wireChannel(channel);
    });
    return res;
  }

  async function onChannelOpen() {
    status('paired', role === ROLES.MASTER ? t('sync.role_master') : t('sync.role_slave'));
    if (role === ROLES.MASTER) {
      // The connection itself is the pairing request: the slave deliberately
      // pasted the master's own code, so this is the moment to ask.
      const approved = await onRequest?.({ peerName: peerName || t('sync.unnamed_device') });
      if (!approved) {
        send(MSG.PAIR_REJECT);
        status('idle', t('sync.rejected'));
        return;
      }
      await pushState();
      return;
    }
    // SLAVE: nothing to send; waits for STATE_PUSH in onChannelMessage.
  }

  async function pushState() {
    status('syncing', t('sync.status_sending'));
    const json = await exportData(false, null);
    const payload = JSON.parse(json);
    // CalDAV credentials are deliberately left out of the sync payload.
    // They are encrypted with the *master password*, not with the pairing
    // code, so the other device could not open them anyway — shipping them
    // would only leak the server URL and the ciphertext of a secret the
    // other side has no key for. The link is about widgets, not credentials.
    delete payload.caldav;
    const encrypted = await encryptJson(payload, pendingPairingCode);
    const deviceId = await getDeviceId();
    // The name travels with the push: the slave has no other way to learn
    // what to call its master, and the master needs the slave's id to keep
    // the pairing record on its own side.
    const name = (await getDeviceName()) || localDeviceName || '';
    send(MSG.STATE_PUSH, { enc: encrypted, from: deviceId, name });
    status('idle', t('sync.sent'));
  }

  async function onChannelMessage(str) {
    const msg = decodeSyncMessage(str);
    if (!msg) return;
    switch (msg.type) {
      case MSG.STATE_PUSH: {
        status('syncing', t('sync.status_receiving'));
        remoteDeviceId = msg.payload?.from || remoteDeviceId;
        const masterName =
          (typeof msg.payload?.name === 'string' && msg.payload.name.trim()) ||
          t('sync.unnamed_device');
        try {
          const data = await decryptJson(msg.payload?.enc, pendingPairingCode);
          await applyMergedState(data);
          // The master announced itself: remember it, so the device list shows
          // a real name and a later reconnect knows whom to talk to.
          if (remoteDeviceId) {
            await addPairing({
              id: remoteDeviceId,
              name: masterName,
              role: ROLES.SLAVE,
            }).catch(() => { /* already paired — fine */ });
          }
          // The confirmation carries *our* name — the master stores it as the
          // slave's label.
          const selfName = localDeviceName || (await getDeviceName()) || '';
          send(MSG.PAIR_ACCEPT, { from: await getDeviceId(), name: selfName });
          status('idle', t('sync.received'));
        } catch {
          status('error', t('sync.error_decrypt'));
        }
        break;
      }
      case MSG.PAIR_REJECT:
        status('idle', t('sync.rejected'));
        break;
      case MSG.PAIR_ACCEPT:
        // The slave confirmed: remember it as our peer, labeled with the name
        // it announced. Without this the master has no pairing record at all,
        // and a later reconnect has nobody to talk to.
        if (role === ROLES.MASTER && msg.payload?.from) {
          remoteDeviceId = msg.payload.from;
          const slaveName =
            (typeof msg.payload.name === 'string' && msg.payload.name.trim()) ||
            peerName ||
            t('sync.unnamed_device');
          await addPairing({
            id: remoteDeviceId,
            name: slaveName,
            role: ROLES.MASTER,
          }).catch(() => { /* already paired — fine */ });
        }
        status('idle', t('sync.confirmed'));
        break;
      default:
        break;
    }
  }

  async function applyMergedState(data) {
    const payload = sanitizePayload(data);
    if (!payload) throw new Error(t('sync.error_payload'));

    const localWorkspaces = await getWorkspaces();
    const merged = mergeWorkspaces(payload.workspaces, localWorkspaces);
    await saveWorkspaces(merged);

    const localSettings = await getSettings();
    await saveSettings(mergeSettings(payload.settings, localSettings));

    // CalDAV credentials are never taken from a peer: they belong to this
    // device and are encrypted with its own master password.
  }

  function send(type, payload) {
    if (channel && channel.readyState === 'open') {
      channel.send(encodeSyncMessage(type, payload));
    }
  }

  function wireChannel(dc) {
    if (!dc) return;
    channel = dc;
    dc.addEventListener('open', () => onChannelOpen());
    dc.addEventListener('message', (e) => onChannelMessage(e.data));
    dc.addEventListener('close', () => status('idle', t('sync.disconnected')));
    dc.addEventListener('error', () => status('error', t('sync.error_channel')));
  }

  // ── reconnect (variant A: within a live session) ──────────────────────────
  //
  // The pairing handshake (offer/answer) cannot be repeated automatically once
  // the tab is gone: a WebExtension cannot listen on a socket, so there is no
  // way for the two devices to find each other again without a signaling
  // server, and the SDP has to travel by hand.
  //
  // What IS possible — and what users actually hit — is a short network
  // blip: the Wi-Fi drops for a second and the data channel dies. WebRTC
  // recovers from that on its own: ICE consent freshness makes the peer
  // re-check reachability, the candidates are re-checked, and the channel
  // reopens — as long as the peer connection itself is still alive.
  //
  // So the job here is only to notice that the link is down and to push the
  // state again once it comes back. A dead peer connection ("failed") cannot
  // be revived: the user has to pair again.
  const ICE_DISCONNECT_GRACE_MS = 5000;

  function watchConnection(pc) {
    pc.addEventListener('iceconnectionstatechange', () => {
      const s = pc.iceConnectionState;
      if (s === 'disconnected') {
        // Transient — the network blinked. ICE will renegotiate on its own.
        status('pending', t('sync.status_reconnecting'));
        setTimeout(() => {
          if (pc.iceConnectionState !== 'connected') return;
          if (channel?.readyState !== 'open') return;
          if (role !== ROLES.MASTER) return;
          // The channel is back — send the state again, since the slave may
          // have missed the first push while the link was down.
          pushState().catch(() => {});
        }, ICE_DISCONNECT_GRACE_MS);
      } else if (s === 'failed') {
        status('error', t('sync.error_connection_failed'));
      }
    });
  }

  return {
    startPairing,
    applyAnswer,
    receiveOffer,
    pushState,
    applyMergedState,
    close,
    get isOpen() {
      return !!channel && channel.readyState === 'open';
    },
    get role() {
      return role;
    },
  };
}

export { ROLES, loadPairings, addPairing, removePairing, getDeviceId };
