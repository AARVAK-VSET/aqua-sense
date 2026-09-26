"use strict";

const assert = require("assert");

const CACHE_KEY = "aquasense:lastSnapshot";

function createMockStorage() {
  const store = {};

  return {
    setItem: function (key, value) {
      store[key] = String(value);
    },
    getItem: function (key) {
      return Object.prototype.hasOwnProperty.call(store, key)
        ? store[key]
        : null;
    },
    removeItem: function (key) {
      delete store[key];
    },
  };
}

function saveTelemetrySnapshot(storage, tanks) {
  const snapshot = {
    savedAt: new Date().toISOString(),
    tanks: tanks,
  };

  storage.setItem(CACHE_KEY, JSON.stringify(snapshot));
}

function loadTelemetrySnapshot(storage) {
  const raw = storage.getItem(CACHE_KEY);

  if (!raw) {
    return null;
  }

  const snapshot = JSON.parse(raw);

  if (
    !snapshot ||
    typeof snapshot.savedAt !== "string" ||
    !snapshot.tanks ||
    typeof snapshot.tanks !== "object"
  ) {
    return null;
  }

  return snapshot;
}

function testSerialization() {
  const storage = createMockStorage();

  const tanks = {
    tank1: 70,
    tank2: 80,
    tank3: 40,
    tank4: 90,
  };

  saveTelemetrySnapshot(storage, tanks);

  const raw = storage.getItem(CACHE_KEY);
  const snapshot = JSON.parse(raw);

  assert.deepStrictEqual(snapshot.tanks, tanks);
  assert.strictEqual(typeof snapshot.savedAt, "string");
  assert.ok(!Number.isNaN(Date.parse(snapshot.savedAt)));

  console.log("PASS: telemetry snapshot serialization");
}

function testCacheHydration() {
  const storage = createMockStorage();

  const tanks = {
    tank1: 70,
    tank2: 80,
    tank3: 40,
    tank4: 90,
  };

  saveTelemetrySnapshot(storage, tanks);

  const snapshot = loadTelemetrySnapshot(storage);

  assert.deepStrictEqual(snapshot.tanks, tanks);

  console.log("PASS: cache hydration");
}

function testNetworkStateTransitions() {
  let state = "offline";
  let reconnectCount = 0;

  function goOnline() {
    state = "online";
    reconnectCount++;
  }

  function goOffline() {
    state = "offline";
  }

  goOffline();
  assert.strictEqual(state, "offline");

  goOnline();
  assert.strictEqual(state, "online");
  assert.strictEqual(reconnectCount, 1);

  console.log("PASS: network state transitions");
}

testSerialization();
testCacheHydration();
testNetworkStateTransitions();

console.log("All dashboard offline cache tests passed.");