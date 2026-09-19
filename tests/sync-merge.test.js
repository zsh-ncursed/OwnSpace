import { describe, it, expect } from 'vitest';
import {
  mergeWorkspaces,
  mergeSettings,
  sanitizePayload,
} from '../src/sync/merge.js';

describe('mergeWorkspaces', () => {
  it('replaces shared workspaces with the master copy', () => {
    const master = [{ id: 'a', name: 'Work (master)', widgets: [] }];
    const local = [{ id: 'a', name: 'Work (local)', widgets: [] }];
    expect(mergeWorkspaces(master, local)).toEqual(master);
  });

  it('keeps slave-only workspaces, appended after the master list', () => {
    const master = [{ id: 'a', name: 'Work', widgets: [] }];
    const local = [
      { id: 'a', name: 'Work (local)', widgets: [] },
      { id: 'b', name: 'Side project', widgets: [] },
    ];
    const merged = mergeWorkspaces(master, local);
    expect(merged.map((w) => w.id)).toEqual(['a', 'b']);
    expect(merged[1].name).toBe('Side project');
  });

  it('adds master-only workspaces', () => {
    const master = [
      { id: 'a', name: 'Work', widgets: [] },
      { id: 'c', name: 'New from master', widgets: [] },
    ];
    const local = [{ id: 'a', name: 'Work (local)', widgets: [] }];
    expect(mergeWorkspaces(master, local).map((w) => w.id)).toEqual([
      'a',
      'c',
    ]);
  });

  it('handles empty sides', () => {
    expect(mergeWorkspaces([], [{ id: 'x' }])).toEqual([{ id: 'x' }]);
    expect(mergeWorkspaces([{ id: 'x' }], [])).toEqual([{ id: 'x' }]);
  });

  it('is pure: does not mutate its inputs', () => {
    const master = [{ id: 'a', name: 'Work' }];
    const local = [{ id: 'b', name: 'Side' }];
    mergeWorkspaces(master, local);
    expect(master).toEqual([{ id: 'a', name: 'Work' }]);
    expect(local).toEqual([{ id: 'b', name: 'Side' }]);
  });

  it('ignores malformed entries instead of crashing', () => {
    const master = [{ id: 'a', name: 'Work' }, null, { noId: true }];
    const local = [null, { id: 'b' }];
    const merged = mergeWorkspaces(master, local);
    expect(merged.map((w) => w.id)).toEqual(['a', 'b']);
  });
});

describe('mergeSettings', () => {
  it('master overrides slave on conflict', () => {
    expect(
      mergeSettings({ theme: 'light', language: 'ru' }, { theme: 'dark' }),
    ).toEqual({ theme: 'light', language: 'ru' });
  });

  it('preserves slave-only keys', () => {
    expect(mergeSettings({ theme: 'light' }, { theme: 'dark', extra: 1 })).toEqual(
      { theme: 'light', extra: 1 },
    );
  });
});

describe('sanitizePayload', () => {
  it('normalizes a full payload', () => {
    const out = sanitizePayload({
      workspaces: [{ id: 'a' }],
      settings: { theme: 'light' },
      caldav: { url: 'https://caldav.local' },
      version: 2,
    });
    expect(out).toEqual({
      workspaces: [{ id: 'a' }],
      settings: { theme: 'light' },
      caldav: { url: 'https://caldav.local' },
      version: 2,
    });
  });

  it('fills defaults for missing parts', () => {
    const out = sanitizePayload({ workspaces: [{ id: 'a' }] });
    expect(out.settings).toEqual({});
    expect(out.caldav).toBeNull();
    expect(out.version).toBe(1);
  });

  it('rejects non-object payloads', () => {
    expect(sanitizePayload(null)).toBeNull();
    expect(sanitizePayload('nope')).toBeNull();
  });
});
