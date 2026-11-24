const test = require("node:test");
const assert = require("node:assert/strict");
const { createSocketEventLimiter } = require("./socket-rate-limit");

test("allows events up to the configured limit", () => {
  const limiter = createSocketEventLimiter({
    limits: { typing: { maxEvents: 2, windowMs: 1000 } },
    now: () => 100,
  });

  assert.equal(limiter.allow("typing"), true);
  assert.equal(limiter.allow("typing"), true);
  assert.equal(limiter.allow("typing"), false);
});

test("resets an event counter after its fixed window expires", () => {
  let now = 100;
  const limiter = createSocketEventLimiter({
    limits: { typing: { maxEvents: 1, windowMs: 500 } },
    now: () => now,
  });

  assert.equal(limiter.allow("typing"), true);
  assert.equal(limiter.allow("typing"), false);
  now = 600;
  assert.equal(limiter.allow("typing"), true);
});

test("does not limit events without an explicit policy", () => {
  const limiter = createSocketEventLimiter({ limits: {} });
  assert.equal(limiter.allow("unconfigured-event"), true);
});

test("reset clears all event windows", () => {
  const limiter = createSocketEventLimiter({
    limits: { typing: { maxEvents: 1, windowMs: 1000 } },
    now: () => 100,
  });

  assert.equal(limiter.allow("typing"), true);
  limiter.reset();
  assert.equal(limiter.allow("typing"), true);
});
