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
  saveCalDAVCredentials,
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
    const res = await createOffer();
    pc = res.pc;
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
  async function receiveOffer({ blob, code, name: _name }) {
    if (!code) throw new Error(t('sync.error_no_code'));
    pendingPairingCode = code;
    role = ROLES.MASTER;
    status('pending', t('sync.status_reading_offer'));
    close();
    const res = await acceptOffer(blob);
    pc = res.pc;
    pc.addEventListener('datachannel', (e) => {
      channel = e.channel;
      wireChannel(channel);
    });
    return res;
  }

  /**
   * The slave announces itself as soon as the channel opens — this is the
   * "pairing request" the master approves. Sending it on open (rather than as
   * part of the SDP) keeps the exchange symmetric for both first-time pairing
   * and reconnects.
   */
  async function announceSelf() {
    const deviceId = await getDeviceId();
    send(MSG.PAIR_REQUEST, {
      deviceId,
      name: localDeviceName || t('sync.unnamed_device'),
    });
  }

  async function onChannelOpen() {
    status('paired', role === ROLES.MASTER ? t('sync.role_master') : t('sync.role_slave'));
    if (role === ROLES.SLAVE) {
      await announceSelf();
      return;
    }
    // MASTER: waits for the slave's PAIR_REQUEST, then asks the user.
  }

  async function pushState() {
    status('syncing', t('sync.status_sending'));
    const json = await exportData(false, null);
    const payload = JSON.parse(json);
    const encrypted = await encryptJson(payload, pendingPairingCode);
    const deviceId = await getDeviceId();
    send(MSG.STATE_PUSH, { enc: encrypted, from: deviceId });
    status('idle', t('sync.sent'));
  }

  async function onChannelMessage(str) {
    const msg = decodeSyncMessage(str);
    if (!msg) return;
    switch (msg.type) {
      case MSG.PAIR_REQUEST: {
        const ok = await onRequest?.({ peerName: msg.payload?.name });
        send(ok ? MSG.PAIR_ACCEPT : MSG.PAIR_REJECT);
        if (ok) {
          await addPairing({
            id: msg.payload?.deviceId || remoteDeviceId || makeFallbackId(),
            name: msg.payload?.name,
            role: ROLES.MASTER,
          });
          await pushState();
        } else {
          status('idle', t('sync.rejected'));
        }
        break;
      }
      case MSG.STATE_PUSH: {
        status('syncing', t('sync.status_receiving'));
        remoteDeviceId = msg.payload?.from || remoteDeviceId;
        try {
          const data = await decryptJson(msg.payload?.enc, pendingPairingCode);
          await applyMergedState(data);
          send(MSG.PAIR_ACCEPT, { from: await getDeviceId() });
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
        // The master accepted: remember it as our source device.
        if (role === ROLES.SLAVE && msg.payload?.from) {
          remoteDeviceId = msg.payload.from;
          await addPairing({
            id: remoteDeviceId,
            name: localDeviceName || t('sync.unnamed_device'),
            role: ROLES.SLAVE,
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

    if (payload.caldav) {
      await saveCalDAVCredentials(payload.caldav);
    }
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

  function makeFallbackId() {
    return `dev-${Math.random().toString(36).slice(2, 10)}`;
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
