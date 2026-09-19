import { describe, it, expect, beforeEach } from 'vitest';
import { storage } from '../src/storage.js';
import { STORAGE_KEYS } from '../src/utils/constants.js';
import {
  getDeviceId,
  resetDeviceIdCache,
  loadPairings,
  addPairing,
  removePairing,
  getRoleFor,
  ROLES,
} from '../src/sync/state.js';

const PAIR_KEY = STORAGE_KEYS.SYNC_PAIRINGS;

describe('sync state: device id', () => {
  beforeEach(() => {
    localStorage.clear();
    resetDeviceIdCache();
  });

  it('generates a stable id once and reuses it', async () => {
    const a = await getDeviceId();
    const b = await getDeviceId();
    expect(a).toBeTruthy();
    expect(a).toBe(b);
    expect(a).toMatch(/^dev-/);
  });

  it('persists the id to storage on first generation', async () => {
    // First generation writes through to storage; subsequent calls hit the
    // in-memory cache (the id is a per-process singleton by design).
    const id = await getDeviceId();
    const stored = await storage.local.getItem('syncDeviceId');
    expect(stored).toBe(id);
  });
});

describe('sync state: pairings', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('starts empty', async () => {
    const { pairings } = await loadPairings();
    expect(pairings).toEqual([]);
  });

  it('stores a slave pairing and reads it back', async () => {
    await addPairing({ id: 'dev-1', name: 'Laptop', role: ROLES.SLAVE });
    const { pairings } = await loadPairings();
    expect(pairings).toHaveLength(1);
    expect(pairings[0]).toMatchObject({
      id: 'dev-1',
      name: 'Laptop',
      role: ROLES.SLAVE,
    });
    expect(typeof pairings[0].createdAt).toBe('number');
  });

  it('stores a master pairing (role is what decides direction)', async () => {
    await addPairing({ id: 'dev-2', name: 'Desktop', role: ROLES.MASTER });
    expect(await getRoleFor('dev-2')).toBe(ROLES.MASTER);
    expect(await getRoleFor('dev-1')).toBeNull();
  });

  it('upserts by device id instead of appending duplicates', async () => {
    await addPairing({ id: 'dev-3', name: 'Laptop', role: ROLES.SLAVE });
    await addPairing({ id: 'dev-3', name: 'Renamed', role: ROLES.MASTER });
    const { pairings } = await loadPairings();
    expect(pairings).toHaveLength(1);
    expect(pairings[0].name).toBe('Renamed');
    expect(pairings[0].role).toBe(ROLES.MASTER);
  });

  it('rejects an invalid role', async () => {
    await expect(
      addPairing({ id: 'dev-4', name: 'X', role: 'unknown' }),
    ).rejects.toThrow();
  });

  it('persists to storage so pairings survive a reload', async () => {
    await addPairing({ id: 'dev-5', name: 'Laptop', role: ROLES.SLAVE });
    const stored = await storage.local.getItem(PAIR_KEY);
    expect(stored).toHaveLength(1);
    expect(stored[0].id).toBe('dev-5');
  });

  it('unlinks a device', async () => {
    await addPairing({ id: 'dev-6', name: 'Laptop', role: ROLES.SLAVE });
    expect(await removePairing('dev-6')).toBe(true);
    expect(await getRoleFor('dev-6')).toBeNull();
  });

  it('unlinking an unknown device is a no-op', async () => {
    expect(await removePairing('nope')).toBe(false);
  });

  it('drops malformed stored pairings instead of crashing', async () => {
    await storage.local.setItem(PAIR_KEY, [
      { id: 'ok', name: 'Laptop', role: ROLES.SLAVE },
      { noId: true },
      null,
    ]);
    const { pairings } = await loadPairings();
    expect(pairings.map((p) => p.id)).toEqual(['ok']);
  });
});
