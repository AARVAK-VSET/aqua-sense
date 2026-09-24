/**
 * Test Harness for Issue #15:
 * Exponential backoff reconnect (with jitter) for the real-time telemetry
 * stream, plus connection state surfacing and disconnection logging.
 */

const assert = require("assert");
const TelemetryConnection = require("../src/lib/telemetry-connection.js");
const { STATES } = TelemetryConnection;

// A controllable fake timer so backoff delays can be asserted and advanced
// without the test suite actually sleeping in real time.
function createFakeClock() {
  let nextId = 1;
  const pending = new Map();
  return {
    setTimeoutFn(fn, delay) {
      const id = nextId++;
      pending.set(id, { fn, delay });
      return id;
    },
    clearTimeoutFn(id) {
      pending.delete(id);
    },
    pendingCount() {
      return pending.size;
    },
    pendingDelay() {
      const [first] = pending.values();
      return first ? first.delay : null;
    },
    // Fires the oldest scheduled timer as if its delay had elapsed.
    advance() {
      const [id] = pending.keys();
      if (id === undefined) return false;
      const { fn } = pending.get(id);
      pending.delete(id);
      fn();
      return true;
    },
  };
}

function makeRecorder() {
  const events = [];
  return {
    events,
    onStateChange(state, meta) {
      events.push({ state: state, meta: meta });
    },
  };
}

console.log("=".repeat(70));
console.log("TEST HARNESS: ISSUE #15 TELEMETRY RECONNECT VALIDATION");
console.log("=".repeat(70));

// Test 1: Exponential growth capped at maxDelayMs
console.log("\n[Test 1] Testing exponential backoff growth and cap...");
{
  const conn = new TelemetryConnection({
    connect: function () {},
    baseDelayMs: 1000,
    maxDelayMs: 30000,
    jitterRatio: 0, // isolate the exponential curve from jitter for this test
    randomFn: () => 0,
  });

  assert.strictEqual(conn.computeBackoffDelay(0), 1000, "attempt 0 -> base delay");
  assert.strictEqual(conn.computeBackoffDelay(1), 2000, "attempt 1 -> 2x base delay");
  assert.strictEqual(conn.computeBackoffDelay(2), 4000, "attempt 2 -> 4x base delay");
  assert.strictEqual(conn.computeBackoffDelay(3), 8000, "attempt 3 -> 8x base delay");
  assert.strictEqual(
    conn.computeBackoffDelay(10),
    30000,
    "large attempt counts must clamp to maxDelayMs, never grow unbounded"
  );
  console.log("PASS: Backoff delay doubles per attempt and clamps at the configured ceiling.");
}

// Test 2: Jitter keeps delay within the full-jitter window and away from 0
console.log("\n[Test 2] Testing jitter bounds (no thundering-herd / zero-delay retries)...");
{
  const conn = new TelemetryConnection({
    connect: function () {},
    baseDelayMs: 1000,
    maxDelayMs: 30000,
    jitterRatio: 0.5,
    randomFn: () => 0, // minimum jitter draw
  });
  const minDraw = conn.computeBackoffDelay(2); // ceiling = 4000
  assert.strictEqual(minDraw, 2000, "random()=0 should yield the lower jitter bound (ceiling * (1 - ratio))");

  conn._random = () => 0.999999; // maximum jitter draw
  const maxDraw = conn.computeBackoffDelay(2);
  assert.ok(maxDraw <= 4000, "jittered delay must never exceed the exponential ceiling");
  assert.ok(maxDraw >= 2000, "jittered delay must never fall below the lower jitter bound");
  console.log("PASS: Jittered delay always stays within [ceiling*(1-ratio), ceiling], never rapid-fire.");
}

// Test 3: Successful connect surfaces CONNECTING -> CONNECTED
console.log("\n[Test 3] Testing happy-path state transitions...");
{
  const recorder = makeRecorder();
  const clock = createFakeClock();
  const conn = new TelemetryConnection({
    connect: function (onOpen) {
      onOpen();
      return { close() {} };
    },
    onStateChange: recorder.onStateChange,
    setTimeoutFn: clock.setTimeoutFn,
    clearTimeoutFn: clock.clearTimeoutFn,
  });

  conn.connect();

  assert.deepStrictEqual(
    recorder.events.map((e) => e.state),
    [STATES.CONNECTING, STATES.CONNECTED]
  );
  assert.strictEqual(conn.state, STATES.CONNECTED);
  assert.strictEqual(conn.retryCount, 0);
  console.log("PASS: A successful connect surfaces connecting -> connected to the UI.");
}

// Test 4: Failure surfaces CONNECTING -> ERROR -> DISCONNECTED, logs the reason,
// and schedules a single backoff retry (no rapid retry loop).
console.log("\n[Test 4] Testing failure state transitions and disconnection logging...");
{
  const recorder = makeRecorder();
  const clock = createFakeClock();
  const loggedMessages = [];
  let attempts = 0;

  const conn = new TelemetryConnection({
    connect: function (onOpen, onFail) {
      attempts++;
      onFail(new Error("network timeout"));
      return { close() {} };
    },
    onStateChange: recorder.onStateChange,
    onLog: (message) => loggedMessages.push(message),
    setTimeoutFn: clock.setTimeoutFn,
    clearTimeoutFn: clock.clearTimeoutFn,
    baseDelayMs: 1000,
    maxDelayMs: 30000,
    jitterRatio: 0,
    randomFn: () => 0,
  });

  conn.connect();

  assert.deepStrictEqual(
    recorder.events.map((e) => e.state),
    [STATES.CONNECTING, STATES.ERROR, STATES.DISCONNECTED]
  );
  assert.ok(
    loggedMessages.some((m) => m.includes("network timeout")),
    "the disconnection reason must be logged"
  );
  assert.strictEqual(attempts, 1, "must not retry synchronously/immediately");
  assert.strictEqual(clock.pendingCount(), 1, "exactly one reconnect timer should be scheduled");
  assert.strictEqual(clock.pendingDelay(), 1000, "first retry should wait one base backoff interval");

  // Advance the fake clock: the scheduled retry fires and fails again.
  clock.advance();
  assert.strictEqual(attempts, 2, "advancing the timer should trigger exactly one retry");
  assert.strictEqual(conn.retryCount, 1);
  assert.strictEqual(clock.pendingDelay(), 2000, "second retry should back off further (2x)");
  console.log("PASS: Failures log the reason, surface connecting/error/disconnected, and back off instead of retrying instantly.");
}

// Test 5: A subsequent successful attempt resets the retry counter.
console.log("\n[Test 5] Testing retry counter reset after recovery...");
{
  const clock = createFakeClock();
  let failuresLeft = 2;

  const conn = new TelemetryConnection({
    connect: function (onOpen, onFail) {
      if (failuresLeft > 0) {
        failuresLeft--;
        onFail(new Error("dropped"));
      } else {
        onOpen();
      }
      return { close() {} };
    },
    onLog: () => {},
    setTimeoutFn: clock.setTimeoutFn,
    clearTimeoutFn: clock.clearTimeoutFn,
    baseDelayMs: 100,
    maxDelayMs: 1000,
    jitterRatio: 0,
    randomFn: () => 0,
  });

  conn.connect();
  assert.strictEqual(conn.retryCount, 0);
  clock.advance(); // 1st retry -> fails again
  assert.strictEqual(conn.retryCount, 1);
  clock.advance(); // 2nd retry -> succeeds
  assert.strictEqual(conn.state, STATES.CONNECTED);
  assert.strictEqual(conn.retryCount, 0, "retry count must reset once the connection recovers");
  console.log("PASS: Retry count resets to zero after a successful reconnect.");
}

// Test 6: maxRetries is respected and stops scheduling further attempts
// (a second, independent safeguard against infinite rapid retry loops).
console.log("\n[Test 6] Testing maxRetries exhaustion...");
{
  const recorder = makeRecorder();
  const clock = createFakeClock();
  let attempts = 0;

  const conn = new TelemetryConnection({
    connect: function (onOpen, onFail) {
      attempts++;
      onFail(new Error("still down"));
      return { close() {} };
    },
    onStateChange: recorder.onStateChange,
    onLog: () => {},
    setTimeoutFn: clock.setTimeoutFn,
    clearTimeoutFn: clock.clearTimeoutFn,
    baseDelayMs: 10,
    maxDelayMs: 100,
    maxRetries: 2,
    jitterRatio: 0,
    randomFn: () => 0,
  });

  conn.connect(); // attempt 1 (retryCount 0) fails
  clock.advance(); // retry 1 (retryCount 1) fails
  clock.advance(); // retry 2 (retryCount 2) fails -> exhausted, no more scheduling

  assert.strictEqual(attempts, 3, "initial attempt + 2 retries = 3 total attempts");
  assert.strictEqual(clock.pendingCount(), 0, "no further retry should be scheduled once maxRetries is exhausted");
  const last = recorder.events[recorder.events.length - 1];
  assert.strictEqual(last.state, STATES.DISCONNECTED);
  assert.strictEqual(last.meta.exhausted, true, "final state must flag that retries were exhausted");
  console.log("PASS: maxRetries stops the retry loop and surfaces a terminal disconnected state.");
}

// Test 7: Manual disconnect cancels any pending retry timer and prevents
// further reconnect attempts.
console.log("\n[Test 7] Testing manual disconnect cancels pending retries...");
{
  const clock = createFakeClock();
  let attempts = 0;
  let closed = false;

  const conn = new TelemetryConnection({
    connect: function (onOpen, onFail) {
      attempts++;
      onFail(new Error("boom"));
      return {
        close() {
          closed = true;
        },
      };
    },
    onLog: () => {},
    setTimeoutFn: clock.setTimeoutFn,
    clearTimeoutFn: clock.clearTimeoutFn,
    baseDelayMs: 1000,
    jitterRatio: 0,
    randomFn: () => 0,
  });

  conn.connect();
  assert.strictEqual(clock.pendingCount(), 1);

  conn.disconnect();
  assert.strictEqual(clock.pendingCount(), 0, "pending retry timer must be cancelled on manual disconnect");
  assert.strictEqual(conn.state, STATES.DISCONNECTED);
  assert.strictEqual(closed, true, "the underlying handle should be closed");

  const attemptsBefore = attempts;
  const fired = clock.advance();
  assert.strictEqual(fired, false, "there must be nothing left to advance after disconnect");
  assert.strictEqual(attempts, attemptsBefore, "no reconnect attempt should occur after manual disconnect");
  console.log("PASS: Manual disconnect tears down the handle and stops the retry loop.");
}

// Test 8: A thrown synchronous error from the connect function is treated
// the same as an async onFail callback (robust error handling).
console.log("\n[Test 8] Testing synchronous connect() exceptions are handled...");
{
  const recorder = makeRecorder();
  const clock = createFakeClock();

  const conn = new TelemetryConnection({
    connect: function () {
      throw new Error("stream constructor exploded");
    },
    onStateChange: recorder.onStateChange,
    onLog: () => {},
    setTimeoutFn: clock.setTimeoutFn,
    clearTimeoutFn: clock.clearTimeoutFn,
    baseDelayMs: 500,
    jitterRatio: 0,
    randomFn: () => 0,
  });

  assert.doesNotThrow(() => conn.connect());
  assert.deepStrictEqual(
    recorder.events.map((e) => e.state),
    [STATES.CONNECTING, STATES.ERROR, STATES.DISCONNECTED]
  );
  assert.strictEqual(clock.pendingCount(), 1, "a retry should still be scheduled after a thrown error");
  console.log("PASS: Synchronous exceptions from connect() are caught and routed through the same backoff path.");
}

console.log("\n" + "=".repeat(70));
console.log("ALL 8 TEST SUITES PASSED (100% PASS)");
console.log("=".repeat(70));
