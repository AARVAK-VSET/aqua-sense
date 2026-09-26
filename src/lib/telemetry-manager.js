(function (global) {
  const CRITICAL_PCT = 20;
  const RECOVER_PCT = 25;

  function TelemetryManager(options) {
    options = options || {};
    this.onAlarm = options.onAlarm || function () {};
    this.onClear = options.onClear || function () {};
    this.tanks = {};
    this.alarmCount = 0;
  }

  TelemetryManager.prototype.update = function (tankId, level) {
    if (typeof level !== "number" || !isFinite(level)) return;
    const tank =
      this.tanks[tankId] ||
      (this.tanks[tankId] = { state: "NORMAL", level: 100 });
    tank.level = level;

    if (tank.state === "NORMAL" && level < CRITICAL_PCT) {
      tank.state = "ALARM";
      this.alarmCount++;
      this.onAlarm(tankId, level);
    } else if (tank.state === "ALARM" && level >= RECOVER_PCT) {
      tank.state = "NORMAL";
      this.onClear(tankId, level);
    }
  };

  // Clamps/validates a raw incoming telemetry value to the 0-100 percent
  // range expected by the gauges. Returns null for values that cannot be
  // interpreted as a number at all (so callers can skip updating).
  TelemetryManager.normalizeLevel = function (raw) {
    var num = Number(raw);

    if (raw === null || raw === undefined || raw === "" || !isFinite(num)) {
      return null;
    }

    if (num < 0) return 0;
    if (num > 100) return 100;

    return num;
  };

  global.TelemetryManager = TelemetryManager;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = TelemetryManager;
  }
})(typeof window !== "undefined" ? window : this);