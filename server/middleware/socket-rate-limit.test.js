const test = require("node:test");
const assert = require("node:assert/strict");
const { createSocketEventLimiter } = require("./socket-rate-limit");

test("allows events up to the configured per-event limit", () => {
  const limiter = createSocketEventLimiter({
    limits: { send_message: { maxEvents: 2, windowMs: 1000 } },
    now: () => 100
  });

  assert.equal(limiter.allow("send_message"), true);
  assert.equal(limiter.allow("send_message"), true);
  assert.equal(limiter.allow("send_message"), false);
});

test("resets an event window after its duration", () => {
  let time = 100;
  const limiter = createSocketEventLimiter({
    limits: { typing: { maxEvents: 1, windowMs: 500 } },
    now: () => time
  });

  assert.equal(limiter.allow("typing"), true);
  assert.equal(limiter.allow("typing"), false);
  time = 600;
  assert.equal(limiter.allow("typing"), true);
});

test("keeps event limits independent and supports cleanup", () => {
  const limiter = createSocketEventLimiter({
    limits: {
      send_message: { maxEvents: 1, windowMs: 1000 },
      typing: { maxEvents: 1, windowMs: 1000 }
    },
    now: () => 100
  });

  assert.equal(limiter.allow("send_message"), true);
  assert.equal(limiter.allow("typing"), true);
  assert.equal(limiter.allow("send_message"), false);
  limiter.reset();
  assert.equal(limiter.allow("send_message"), true);
});

