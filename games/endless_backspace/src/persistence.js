const KEY = "endless_backspace_save_v1";
const SCHEMA_VERSION = 1;

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object") return null;
    if (data.schema_version !== SCHEMA_VERSION) {
      // No migrations yet — just wipe stale schema versions silently.
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

export function writeSave(state) {
  const payload = {
    schema_version: SCHEMA_VERSION,
    settings: state.settings,
    completion_flags: state.completionFlags,
    found_findables: state.foundFindables,
    current_run: state.run, // may be null if quit-without-save
  };
  try {
    localStorage.setItem(KEY, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

export function writeSettingsOnly(state) {
  // Persist settings + meta without overwriting an in-progress run.
  const existing = loadSave();
  const payload = {
    schema_version: SCHEMA_VERSION,
    settings: state.settings,
    completion_flags: state.completionFlags,
    found_findables: state.foundFindables,
    current_run: existing?.current_run ?? null,
  };
  try {
    localStorage.setItem(KEY, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

export function clearRun() {
  const existing = loadSave();
  if (!existing) return;
  existing.current_run = null;
  try {
    localStorage.setItem(KEY, JSON.stringify(existing));
  } catch {
    /* noop */
  }
}

export function hasResumableRun() {
  const data = loadSave();
  return !!(data && data.current_run);
}
