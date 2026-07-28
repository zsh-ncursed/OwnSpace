import { describe, it, expect, beforeEach } from 'vitest';
import { state, getActiveWorkspace, setState } from '../src/state.js';

beforeEach(() => {
  setState({
    workspaces: [],
    activeWorkspaceId: null,
    theme: 'dark',
    loading: true,
  });
});

describe('state', () => {
  it('initial state is empty', () => {
    expect(state.workspaces).toEqual([]);
    expect(state.activeWorkspaceId).toBeNull();
  });
});

describe('getActiveWorkspace', () => {
  it('returns null when no active workspace', () => {
    expect(getActiveWorkspace()).toBeNull();
  });

  it('returns active workspace', () => {
    setState({
      workspaces: [{ id: 'ws-1', name: 'Test' }],
      activeWorkspaceId: 'ws-1',
    });
    expect(getActiveWorkspace()).toEqual({ id: 'ws-1', name: 'Test' });
  });

  it('returns null when active workspace not found', () => {
    setState({
      workspaces: [{ id: 'ws-2', name: 'Other' }],
      activeWorkspaceId: 'ws-1',
    });
    expect(getActiveWorkspace()).toBeNull();
  });
});
