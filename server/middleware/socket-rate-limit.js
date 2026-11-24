// Create an in-memory fixed-window limiter for selected events on one socket connection.
function createSocketEventLimiter({ limits, now = Date.now }) {
  const windows = new Map();

  // Return false when an event exceeds its configured count within the active time window.
  function allow(eventName) {
    const limit = limits[eventName];
    if (!limit) return true;

    const currentTime = now();
    const current = windows.get(eventName);
    if (!current || currentTime - current.startedAt >= limit.windowMs) {
      windows.set(eventName, { startedAt: currentTime, count: 1 });
      return true;
    }

    if (current.count >= limit.maxEvents) return false;
    current.count += 1;
    return true;
  }

  // Clear counters when the socket disconnects so the limiter can be discarded cleanly.
  function reset() {
    windows.clear();
  }

  return { allow, reset };
}

module.exports = { createSocketEventLimiter };
