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

  global.TelemetryManager = TelemetryManager;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = TelemetryManager;
  }
})(typeof window !== "undefined" ? window : this);
