export let state = {
  workspaces: [],
  activeWorkspaceId: null,
  theme: 'dark',
  loading: true,
  _searchEngine: 'google',
};

export function getActiveWorkspace() {
  return state.workspaces.find((ws) => ws.id === state.activeWorkspaceId) || null;
}

export function setState(updates) {
  Object.assign(state, updates);
}

export function syncStateToWindow() {
  window.state.workspaces = state.workspaces;
  window.state.activeWorkspaceId = state.activeWorkspaceId;
  window.state.theme = state.theme;
}

export function syncStateFromWindow() {
  state.workspaces = window.state.workspaces || state.workspaces;
  state.activeWorkspaceId = window.state.activeWorkspaceId || state.activeWorkspaceId;
  state.theme = window.state.theme || state.theme;
}
