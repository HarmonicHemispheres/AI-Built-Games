// Tiny pub/sub for cross-module signals. No deps. Node-safe.
//
// Canonical event names (see CONTRACTS.md):
//   scene-changed, phase-changed, round-cleared, hand-changed, resource-changed,
//   unit-selected, castle-damaged, enemy-killed, card-played, tile-revealed, game-over
//
// Payloads are plain objects. Listeners must not throw; errors are swallowed and
// logged so one bad listener can't break the frame loop.

const channels = new Map();

export function on(event, fn) {
  if (!channels.has(event)) channels.set(event, new Set());
  channels.get(event).add(fn);
  return () => off(event, fn);
}

export function off(event, fn) {
  const set = channels.get(event);
  if (set) set.delete(fn);
}

export function once(event, fn) {
  const dispose = on(event, (payload) => {
    dispose();
    fn(payload);
  });
  return dispose;
}

export function emit(event, payload) {
  const set = channels.get(event);
  if (!set) return;
  for (const fn of [...set]) {
    try {
      fn(payload);
    } catch (err) {
      console.error(`[events] listener for "${event}" threw:`, err);
    }
  }
}

// Test/utility: drop every listener (used by harnesses).
export function clearAll() {
  channels.clear();
}
