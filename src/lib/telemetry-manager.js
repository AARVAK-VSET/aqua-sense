(function (global) {
  const CRITICAL_PCT = 20;
  const RECOVER_PCT = 20;

  function TelemetryManager(options) {
    options = options || {};

    this.threshold =
      typeof options.threshold === "number" && isFinite(options.threshold)
        ? options.threshold
        : CRITICAL_PCT;

    this.onAlarm = options.onAlarm || function () {};
    this.onClear = options.onClear || function () {};

    this.autoRegister = options.autoRegister !== false;

    this.tanks = {};
    this.alarmCount = 0;
    this.alarmListeners = [];
  }

  TelemetryManager.normalizeLevel = function (value) {
    if (value === null || value === undefined) return null;
    if (typeof value === "string" && value.trim() === "") return null;

    const number = Number(value);

    if (!isFinite(number)) return null;

    return Math.max(0, Math.min(100, number));
  };

  TelemetryManager.prototype.registerTank = function (tankId, initialLevel) {
    if (!tankId) return false;

    // Registration is intentionally idempotent.
    if (this.tanks[tankId]) {
      return this.tanks[tankId];
    }

    let level = TelemetryManager.normalizeLevel(initialLevel);

    if (level === null) {
      level = 100;
    }

    this.tanks[tankId] = {
      state: level < this.threshold ? "CRITICAL" : "NORMAL",
      level: level
    };

    return this.tanks[tankId];
  };

  TelemetryManager.prototype.onAlarmTrigger = function (listener) {
    if (typeof listener !== "function") return false;

    this.alarmListeners.push(listener);
    return true;
  };

  TelemetryManager.prototype.getAlarmTriggerCount = function () {
    return this.alarmCount;
  };

  TelemetryManager.prototype.getTankState = function (tankId) {
    const tank = this.tanks[tankId];

    if (!tank) return null;

    return {
      state: tank.state,
      level: tank.level
    };
  };

  TelemetryManager.prototype.updateTank = function (tankId, level) {
    const normalizedLevel = TelemetryManager.normalizeLevel(level);

    if (normalizedLevel === null) {
      return {
        accepted: false,
        reason: "INVALID_LEVEL",
        tankId: tankId
      };
    }

    let tank = this.tanks[tankId];

    if (!tank) {
      if (!this.autoRegister) {
        return {
          accepted: false,
          reason: "UNKNOWN_TANK",
          tankId: tankId
        };
      }

      this.registerTank(tankId, 100);
      tank = this.tanks[tankId];
    }

    const previousState = tank.state;

    tank.level = normalizedLevel;

    let alarmTriggered = false;

    if (previousState === "NORMAL" && normalizedLevel < this.threshold) {
      tank.state = "CRITICAL";
      this.alarmCount++;
      alarmTriggered = true;

      const alert = {
        tankId: tankId,
        level: normalizedLevel,
        state: "CRITICAL"
      };

      this.onAlarm(tankId, normalizedLevel);

      this.alarmListeners.slice().forEach(function (listener) {
        try {
          listener(alert);
        } catch (error) {
          // One faulty listener must not block the others.
        }
      });
    } else if (
      previousState === "CRITICAL" &&
      normalizedLevel >= RECOVER_PCT
    ) {
      tank.state = "NORMAL";
      this.onClear(tankId, normalizedLevel);
    }

    return {
      accepted: true,
      tankId: tankId,
      level: normalizedLevel,
      previousState: previousState,
      state: tank.state,
      alarmTriggered: alarmTriggered
    };
  };

  // Preserve the original API used elsewhere in the project.
  TelemetryManager.prototype.update = function (tankId, level) {
    const normalizedLevel = TelemetryManager.normalizeLevel(level);

    if (normalizedLevel === null) return;

    this.updateTank(tankId, normalizedLevel);
  };

  global.TelemetryManager = TelemetryManager;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = TelemetryManager;
  }
})(typeof window !== "undefined" ? window : this);