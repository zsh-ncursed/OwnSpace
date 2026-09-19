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
 * Normalize the incoming payload before it is applied: strip anything that
 * must never be overwritten (nothing so far — full copy is intended, and the
 * active-workspace id is reconciled by the caller against merged workspaces).
 */
export function sanitizePayload(payload) {
  if (!payload || typeof payload !== 'object') return null;
  return {
    workspaces: Array.isArray(payload.workspaces) ? payload.workspaces : [],
    settings:
      payload.settings && typeof payload.settings === 'object'
        ? payload.settings
        : {},
    caldav: payload.caldav ?? null,
    version: payload.version ?? 1,
  };
}
