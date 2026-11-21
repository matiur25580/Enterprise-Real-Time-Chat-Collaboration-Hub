function createSocketEventLimiter({ limits, now = Date.now }) {
  const windows = new Map();

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

  function reset() {
    windows.clear();
  }

  return { allow, reset };
}

module.exports = { createSocketEventLimiter };
