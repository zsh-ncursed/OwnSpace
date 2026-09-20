// Single source of truth. `state` is a const object — never reassigned, only
// mutated in place (state.workspaces = ..., Object.assign(state, ...)). This
// guarantees `window.state` (set once in app.js as `window.state = state`) and
// the module export always reference the same object. The old syncStateToWindow
// / syncStateFromWindow two-way copy functions were removed: they could diverge
// and create two competing sources of truth.
export const state = {
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
