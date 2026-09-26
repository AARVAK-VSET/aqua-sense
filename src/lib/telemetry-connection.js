/**
 * TelemetryConnection (Issue #15)
 *
 * Wraps a real-time telemetry stream (Firebase, WebSocket, SSE, etc.) with:
 *  - Exponential backoff reconnect, with jitter, so a flaky stream doesn't
 *    hammer the server with rapid-fire reconnect attempts.
 *  - A small connecting/connected/disconnected/error state machine that is
 *    surfaced to callers (e.g. dashboard UI) via onStateChange.
 *  - Disconnection-reason logging via onLog.
 *
 * The caller supplies a `connect` function with the shape:
 *   function connect(onOpen, onFail) -> handle
 * `onOpen()` must be called once the stream is live, and `onFail(err)` must
 * be called if the stream errors out or drops. The returned `handle` may
 * expose a `close()` method used to tear down the underlying connection.
 */
(function (global) {
  const STATES = {
    CONNECTING: "connecting",
    CONNECTED: "connected",
    DISCONNECTED: "disconnected",
    ERROR: "error",
  };

  const DEFAULTS = {
    baseDelayMs: 1000,
    maxDelayMs: 30000,
    maxRetries: Infinity,
    jitterRatio: 0.5,
  };

  function TelemetryConnection(options) {
    options = options || {};
    if (typeof options.connect !== "function") {
      throw new Error("TelemetryConnection requires a `connect` function");
    }

    this.connectFn = options.connect;
    this.baseDelayMs = options.baseDelayMs || DEFAULTS.baseDelayMs;
    this.maxDelayMs = options.maxDelayMs || DEFAULTS.maxDelayMs;
    this.maxRetries =
      options.maxRetries != null ? options.maxRetries : DEFAULTS.maxRetries;
    this.jitterRatio =
      options.jitterRatio != null ? options.jitterRatio : DEFAULTS.jitterRatio;

    this.onStateChange = options.onStateChange || function () {};
    this.onLog =
      options.onLog ||
      function (message) {
        if (typeof console !== "undefined" && console.error) {
          console.error(message);
        }
      };

    // Injectable for deterministic tests.
    this._random = options.randomFn || Math.random;
    this._setTimeout =
      options.setTimeoutFn ||
      (typeof global.setTimeout === "function" ? global.setTimeout.bind(global) : setTimeout);
    this._clearTimeout =
      options.clearTimeoutFn ||
      (typeof global.clearTimeout === "function" ? global.clearTimeout.bind(global) : clearTimeout);

    this.state = STATES.DISCONNECTED;
    this.retryCount = 0;
    this._timer = null;
    this._handle = null;
    this._stopped = true;
  }

  TelemetryConnection.STATES = STATES;

  /** Starts (or restarts) the connection attempt loop. */
  TelemetryConnection.prototype.connect = function () {
    if (this._timer) {
      this._clearTimeout(this._timer);
      this._timer = null;
    }
    this._stopped = false;
    this.retryCount = 0;
    this._attempt();
  };

  /** Stops the loop and cancels any pending reconnect timer. */
  TelemetryConnection.prototype.disconnect = function () {
    this._stopped = true;
    if (this._timer) {
      this._clearTimeout(this._timer);
      this._timer = null;
    }
    if (this._handle && typeof this._handle.close === "function") {
      try {
        this._handle.close();
      } catch (e) {
        // Ignore errors tearing down an already-broken connection.
      }
    }
    this._handle = null;
    this._transition(STATES.DISCONNECTED, { manual: true });
  };

  /**
   * Exponential backoff with "full jitter": a random delay between 0 and
   * the exponential ceiling. This avoids the thundering-herd / rapid-retry
   * problem that plain exponential backoff without jitter can still cause.
   */
  TelemetryConnection.prototype.computeBackoffDelay = function (attempt) {
    const ceiling = Math.min(
      this.maxDelayMs,
      this.baseDelayMs * Math.pow(2, attempt)
    );
    const minDelay = ceiling * (1 - this.jitterRatio);
    const jitterSpan = ceiling * this.jitterRatio;
    return Math.round(minDelay + this._random() * jitterSpan);
  };

  TelemetryConnection.prototype._attempt = function () {
    if (this._stopped) return;

    this._transition(STATES.CONNECTING, { attempt: this.retryCount + 1 });

    const self = this;
    let settled = false;

    const onOpen = function () {
      if (settled || self._stopped) return;
      settled = true;
      self.retryCount = 0;
      self._transition(STATES.CONNECTED);
    };

    const onFail = function (err) {
      if (settled) return;
      settled = true;
      self._handleFailure(err);
    };

    try {
      this._handle = this.connectFn(onOpen, onFail);
    } catch (err) {
      if (!settled) {
        settled = true;
        this._handleFailure(err);
      }
    }
  };

  TelemetryConnection.prototype._handleFailure = function (err) {
    const reason = (err && err.message) || String(err || "Unknown error");
    this.onLog("[AquaSense] Telemetry stream disconnected: " + reason, err);
    this._transition(STATES.ERROR, { reason: reason });

    if (this._stopped) return;

    if (this.retryCount >= this.maxRetries) {
      this._transition(STATES.DISCONNECTED, { reason: reason, exhausted: true });
      return;
    }

    const delay = this.computeBackoffDelay(this.retryCount);
    this._transition(STATES.DISCONNECTED, {
      reason: reason,
      retryInMs: delay,
      nextAttempt: this.retryCount + 1,
    });

    const self = this;
    this._timer = this._setTimeout(function () {
      self._timer = null;
      self.retryCount += 1;
      self._attempt();
    }, delay);
  };

  TelemetryConnection.prototype._transition = function (state, meta) {
    this.state = state;
    this.onStateChange(state, meta || {});
  };

  global.TelemetryConnection = TelemetryConnection;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = TelemetryConnection;
  }
})(typeof window !== "undefined" ? window : this);
