/**
 * Pairing records — which devices this browser is linked to, and in which role.
 *
 * Role semantics (the whole feature hinges on this):
 *   - The side that sent the *first* pairing request is the SLAVE: it only
 *     ever receives state.
 *   - The side that approved that request is the MASTER: it only ever sends.
 *
 * A device is identified by a stable id generated once and stored locally. A
 * pairing record is { id, name, role, createdAt }. Stored under
 * STORAGE_KEYS.SYNC_PAIRINGS.
 */

import { STORAGE_KEYS } from '../utils/constants.js';
import { t } from '../i18n/index.js';

const DEVICE_ID_KEY = 'syncDeviceId';

const ROLE_SLAVE = 'slave';
const ROLE_MASTER = 'master';

export const ROLES = { SLAVE: ROLE_SLAVE, MASTER: ROLE_MASTER };

let _deviceId = null;

/**
 * Stable per-device id. Generated once, cached in memory afterwards.
 * The cache is only a shortcut: if storage was cleared elsewhere, the next
 * call re-reads and, when needed, re-persists — the id never silently goes
 * missing from storage while the process keeps using it.
 */
export async function getDeviceId() {
  if (_deviceId) return _deviceId;
  const store = await getStorage();
  const got = await store.getItem(DEVICE_ID_KEY);
  if (typeof got === 'string' && got.length) {
    _deviceId = got;
    return _deviceId;
  }
  _deviceId = makeDeviceId();
  await store.setItem(DEVICE_ID_KEY, _deviceId);
  return _deviceId;
}

/** Drop the in-memory cache (tests). */
export function resetDeviceIdCache() {
  _deviceId = null;
}

/**
 * Pairing records from storage: { pairings: [...], byId: {id->record} }.
 */
export async function loadPairings() {
  const store = await getStorage();
  const raw = await store.getItem(STORAGE_KEYS.SYNC_PAIRINGS);
  const list = Array.isArray(raw) ? raw : [];
  const byId = new Map();
  for (const p of list) {
    if (!p || !p.id) continue;
    byId.set(p.id, p);
  }
  return { pairings: [...byId.values()], byId };
}

/**
 * Remember a pairing. role must be ROLE_SLAVE or ROLE_MASTER.
 */
export async function addPairing(record) {
  if (!record?.id) throw new TypeError('addPairing: id is required');
  if (record.role !== ROLE_SLAVE && record.role !== ROLE_MASTER) {
    throw new TypeError(`addPairing: invalid role ${record.role}`);
  }
  const { byId } = await loadPairings();
  byId.set(record.id, {
    id: record.id,
    name: record.name || t('sync.unnamed_device'),
    role: record.role,
    createdAt: record.createdAt ?? Date.now(),
  });
  await persistPairings(byId);
  return byId.get(record.id);
}

export async function removePairing(deviceId) {
  const { byId } = await loadPairings();
  const had = byId.delete(deviceId);
  if (had) await persistPairings(byId);
  return had;
}

async function persistPairings(byId) {
  const store = await getStorage();
  await store.setItem(STORAGE_KEYS.SYNC_PAIRINGS, [...byId.values()]);
}

/**
 * Own role toward a specific device, or null if unpaired.
 */
export async function getRoleFor(deviceId) {
  const { byId } = await loadPairings();
  return byId.get(deviceId)?.role ?? null;
}

export function makeDeviceId() {
  return `dev-${crypto.randomUUID()}`;
}

// storage.local when running as an extension, localStorage in tests. Mirrors
// src/storage.js so unit tests can use the same in-memory mock.
async function getStorage() {
  if (typeof browser !== 'undefined' && browser?.storage?.local) {
    return {
      getItem: async (k) => (await browser.storage.local.get(k))[k] ?? null,
      setItem: async (k, v) => {
        await browser.storage.local.set({ [k]: v });
      },
    };
  }
  return localStorageShim();
}

function localStorageShim() {
  return {
    getItem: async (k) => {
      const v = localStorage.getItem(k);
      return v ? JSON.parse(v) : null;
    },
    setItem: async (k, v) => localStorage.setItem(k, JSON.stringify(v)),
  };
}
