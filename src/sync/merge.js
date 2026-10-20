/**
 * Merge logic for incoming sync payloads.
 *
 * Policy chosen with the user: master wins on any conflict; the slave's own
 * unique data is preserved. Concretely, this is a workspace-level merge:
 *
 *   - Workspaces existing on both sides are replaced by the master's copy
 *     (name, background, widgets, order).
 *   - Workspaces that only exist on the slave are kept, appended after the
 *     master's.
 *   - Workspaces that only exist on the master are added.
 *   - Settings: master's values override; slave-only keys survive.
 *   - Active workspace id: kept if it still exists, else the first one.
 */

// Limits mirroring export-import.js — a sync payload must not be able to
// write more than an import would be allowed to.
const MAX_WORKSPACES = 10;
const MAX_WIDGETS_PER_WORKSPACE = 50;

/**
 * Merge master's workspaces into the slave's local list.
 * Pure: takes arrays, returns a new array.
 */
export function mergeWorkspaces(masterWorkspaces, localWorkspaces) {
  const master = Array.isArray(masterWorkspaces) ? masterWorkspaces : [];
  const local = Array.isArray(localWorkspaces) ? localWorkspaces : [];

  const result = master.filter((w) => w && w.id);

  // Slave-only workspaces survive, appended in their original order.
  for (const w of local) {
    if (w && w.id && !result.some((r) => r.id === w.id)) {
      result.push(w);
    }
  }
  return result;
}

/**
 * Merge settings: master overrides, slave-only keys preserved.
 */
export function mergeSettings(masterSettings, localSettings) {
  return { ...(localSettings || {}), ...(masterSettings || {}) };
}

/**
 * Normalize the incoming payload before it is applied.
 *
 * The payload comes from another device, so it is untrusted input even if the
 * connection itself is authenticated: the pairing code proves the sender
 * knows the code, not that the payload is well-formed. The slave validates
 * the structure here — the same boundary importData draws (see
 * export-import.js) — instead of writing whatever arrived straight into
 * storage.
 */
export function sanitizePayload(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const raw = Array.isArray(payload.workspaces) ? payload.workspaces : [];
  // Same limits the import path enforces — a peer must not be able to make us
  // store more than an import would be allowed to.
  if (raw.length > MAX_WORKSPACES) return null;
  // Entries without a usable id are dropped (mergeWorkspaces ignores them
  // anyway) rather than rejecting the whole payload: one malformed workspace
  // on the other side should not cost the user the entire sync.
  const workspaces = [];
  for (const ws of raw) {
    if (!ws || typeof ws !== 'object') continue;
    if (typeof ws.id !== 'string' || !ws.id) continue;
    if (ws.widgets !== undefined && !Array.isArray(ws.widgets)) continue;
    if (Array.isArray(ws.widgets) && ws.widgets.length > MAX_WIDGETS_PER_WORKSPACE) {
      continue;
    }
    workspaces.push(ws);
  }
  return {
    workspaces,
    settings:
      payload.settings && typeof payload.settings === 'object'
        ? payload.settings
        : {},
    caldav: null,
    version: payload.version ?? 1,
  };
}
