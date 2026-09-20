/**
 * TelemetryManager — Centralized Multi-Tank Telemetry State Machine
 *
 * Implements deterministic per-tank state transitions to prevent duplicate
 * alarm notifications and race conditions across concurrent telemetry streams.
 *
 * Invariant: For each tank, one continuous CRITICAL episode (< threshold)
 * produces exactly one logical alarm event.
 *
 * @author AARVAK-VSET / Patch Wars 2026
 */
class TelemetryManager {
  /**
   * Normalizes incoming raw telemetry into a finite number.
   * Rejects null, undefined, "", non-numeric strings, NaN, and Infinity.
   * Accepts finite numbers and valid numeric strings (e.g. "18" -> 18).
   *
   * @param {*} value
   * @returns {number|null}
   */
  static normalizeLevel(value) {
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : null;
    }
    if (typeof value === 'string' && value.trim() !== '') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  }

  /**
   * @param {Object} options
   * @param {number} [options.threshold=20] - Critical water level threshold percentage.
   * @param {boolean} [options.autoRegister=false] - Whether to auto-register unknown tank IDs.
   */
  constructor(options = {}) {
    this.threshold = typeof options.threshold === 'number' ? options.threshold : 20;
    this.autoRegister = Boolean(options.autoRegister);
    this.tanks = new Map();
    this.alarmTriggerCount = 0;
    this.listeners = new Set();
  }

  /**
   * Registers a tank with an initial baseline level.
   * Idempotent: If the tank is already registered, its current level and state
   * are preserved (never resets active state back to NORMAL).
   *
   * Baseline state is established WITHOUT firing an alarm event.
   *
   * @param {string} tankId
   * @param {number} [initialLevel=100]
   * @returns {Object}
   */
  registerTank(tankId, initialLevel = 100) {
    if (typeof tankId !== 'string' || tankId.trim() === '') {
      return { accepted: false, reason: 'INVALID_TANK_ID' };
    }

    if (this.tanks.has(tankId)) {
      return { accepted: true, tankId, state: this.getTankState(tankId), existing: true };
    }

    const normalized = TelemetryManager.normalizeLevel(initialLevel);
    const baselineLevel = normalized !== null ? normalized : 100;
    const initialState = baselineLevel < this.threshold ? 'CRITICAL' : 'NORMAL';

    this.tanks.set(tankId, {
      id: tankId,
      level: baselineLevel,
      state: initialState,
      history: [
        {
          from: null,
          to: initialState,
          level: baselineLevel,
          timestamp: Date.now()
        }
      ]
    });

    return {
      accepted: true,
      tankId,
      state: this.getTankState(tankId),
      existing: false
    };
  }

  /**
   * Processes a telemetry level update for a tank.
   *
   * Validates level input, updates state, records transition in history,
   * and fires an alarm ONLY on a valid NORMAL -> CRITICAL transition.
   *
   * @param {string} tankId
   * @param {*} rawLevel
   * @returns {Object}
   */
  updateTank(tankId, rawLevel) {
    if (typeof tankId !== 'string' || tankId.trim() === '') {
      return { accepted: false, reason: 'INVALID_TANK_ID' };
    }

    if (!this.tanks.has(tankId)) {
      if (this.autoRegister) {
        this.registerTank(tankId, 100);
      } else {
        return { accepted: false, reason: 'UNKNOWN_TANK', tankId };
      }
    }

    const level = TelemetryManager.normalizeLevel(rawLevel);
    if (level === null) {
      return { accepted: false, reason: 'INVALID_LEVEL', tankId, level: rawLevel };
    }

    const tank = this.tanks.get(tankId);
    const previousState = tank.state;
    const nextState = level < this.threshold ? 'CRITICAL' : 'NORMAL';

    tank.level = level;
    tank.state = nextState;

    // Explicit FSM transition: exactly NORMAL -> CRITICAL
    const enteredCritical = (previousState === 'NORMAL' && nextState === 'CRITICAL');

    if (previousState !== nextState) {
      tank.history.push({
        from: previousState,
        to: nextState,
        level,
        timestamp: Date.now()
      });
      if (tank.history.length > 20) {
        tank.history.shift();
      }
    }

    if (enteredCritical) {
      this.alarmTriggerCount++;
      const eventPayload = {
        tankId,
        level,
        previousState,
        state: nextState,
        timestamp: Date.now(),
        triggerIndex: this.alarmTriggerCount
      };

      // Isolated listener execution: an error in one listener will not crash telemetry
      this.listeners.forEach((listener) => {
        try {
          listener(eventPayload);
        } catch (err) {
          console.error(`[TelemetryManager] Error in alarm listener for ${tankId}:`, err);
        }
      });
    }

    return {
      accepted: true,
      tankId,
      level,
      previousState,
      state: nextState,
      alarmTriggered: enteredCritical
    };
  }

  /**
   * Subscribes a listener callback to logical alarm trigger events.
   * Returns an unsubscribe cleanup function.
   *
   * @param {Function} callback
   * @returns {Function}
   */
  onAlarmTrigger(callback) {
    if (typeof callback !== 'function') {
      throw new TypeError('Listener must be a function');
    }
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  /**
   * Returns the total count of logical alarms triggered since instantiation or reset.
   * @returns {number}
   */
  getAlarmTriggerCount() {
    return this.alarmTriggerCount;
  }

  /**
   * Returns a defensive state snapshot (detached copy preventing unintended mutation).
   * @param {string} tankId
   * @returns {Object|null}
   */
  getTankState(tankId) {
    const tank = this.tanks.get(tankId);
    if (!tank) return null;
    return {
      id: tank.id,
      level: tank.level,
      state: tank.state,
      history: tank.history.map((h) => ({ ...h }))
    };
  }

  /**
   * Returns all registered tank IDs.
   * @returns {string[]}
   */
  getRegisteredTankIds() {
    return Array.from(this.tanks.keys());
  }

  /**
   * Resets all internal state and counters (useful for isolated harness test runs).
   */
  reset() {
    this.tanks.clear();
    this.alarmTriggerCount = 0;
  }
}

// UMD / Global Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = TelemetryManager;
}
if (typeof window !== 'undefined') {
  window.TelemetryManager = TelemetryManager;
}
