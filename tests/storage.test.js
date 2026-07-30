import { describe, it, expect, beforeEach } from 'vitest';
import {
  storage,
  getWorkspaces,
  saveWorkspaces,
  getSettings,
  saveSettings,
  saveCalDAVCredentials,
  getCalDAVCredentials,
  saveActiveWorkspaceId,
  getActiveWorkspaceId,
} from '../src/storage.js';

// @vitest-environment jsdom

beforeEach(() => {
  localStorage.clear();
});

describe('storage.local', () => {
  it('setItem and getItem roundtrip', async () => {
    await storage.local.setItem('foo', { bar: 1 });
    const value = await storage.local.getItem('foo');
    expect(value).toEqual({ bar: 1 });
  });

  it('getItem returns null for missing key', async () => {
    const value = await storage.local.getItem('nonexistent');
    expect(value).toBeNull();
  });

  it('removeItem removes key', async () => {
    await storage.local.setItem('tmp', 'val');
    await storage.local.removeItem('tmp');
    const value = await storage.local.getItem('tmp');
    expect(value).toBeNull();
  });
});

describe('workspace storage', () => {
  it('getWorkspaces returns empty array when nothing stored', async () => {
    const ws = await getWorkspaces();
    expect(ws).toEqual([]);
  });

  it('saveWorkspaces and getWorkspaces roundtrip', async () => {
    const data = [{ id: '1', name: 'Test' }];
    await saveWorkspaces(data);
    const ws = await getWorkspaces();
    expect(ws).toEqual(data);
  });
});

describe('settings storage', () => {
  it('getSettings returns defaults when empty', async () => {
    const s = await getSettings();
    expect(s).toEqual({ theme: 'dark', masterPasswordHash: '' });
  });

  it('saveSettings and getSettings roundtrip', async () => {
    await saveSettings({ theme: 'light', masterPasswordHash: 'abc' });
    const s = await getSettings();
    expect(s.theme).toBe('light');
    expect(s.masterPasswordHash).toBe('abc');
  });
});

describe('CalDAV credentials storage', () => {
  it('getCalDAVCredentials returns null when empty', async () => {
    const c = await getCalDAVCredentials();
    expect(c).toBeNull();
  });

  it('saveCalDAVCredentials and getCalDAVCredentials roundtrip', async () => {
    await saveCalDAVCredentials({ url: 'https://cal.example.com' });
    const c = await getCalDAVCredentials();
    expect(c).toEqual({ url: 'https://cal.example.com' });
  });
});

describe('active workspace storage', () => {
  it('getActiveWorkspaceId returns null when not set', async () => {
    const id = await getActiveWorkspaceId();
    expect(id).toBeNull();
  });

  it('saveActiveWorkspaceId and getActiveWorkspaceId roundtrip', async () => {
    await saveActiveWorkspaceId('ws-123');
    const id = await getActiveWorkspaceId();
    expect(id).toBe('ws-123');
  });
});
