/**
 * Test Harness for Issue #19:
 * Add local storage telemetry caching for offline dashboard fallback.
 */

const assert = require("assert");

// Mock LocalStorage
class MockLocalStorage {
  constructor() {
    this.store = new Map();
  }
  getItem(key) {
    return this.store.has(key) ? this.store.get(key) : null;
  }
  setItem(key, value) {
    this.store.set(key, String(value));
  }
  removeItem(key) {
    this.store.delete(key);
  }
  clear() {
    this.store.clear();
  }
}

// Mock DOM Elements
class MockElement {
  constructor(id) {
    this.id = id;
    this.textContent = "";
    this.hidden = true;
  }
}

const mockStorage = new MockLocalStorage();
const mockBanner = new MockElement("cache-banner");

const CACHE_KEY = "aquasense:lastSnapshot";

function saveSnapshot(tanks, storage = mockStorage) {
  try {
    storage.setItem(
      CACHE_KEY,
      JSON.stringify({ savedAt: Date.now(), tanks: tanks })
    );
    return true;
  } catch (e) {
    return false;
  }
}

function loadSnapshot(storage = mockStorage) {
  try {
    const raw = storage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function showCachedBanner(savedAt, el = mockBanner) {
  if (!el) return;
  el.textContent =
    "Offline: showing cached data from " + new Date(savedAt).toLocaleString();
  el.hidden = false;
}

function hideCachedBanner(el = mockBanner) {
  if (!el) return;
  el.hidden = true;
}

function sanitizeLevel(val) {
  const n = Number(val);
  if (isNaN(n) || val === null || val === "" || val === undefined) {
    return null;
  }
  return Math.max(0, Math.min(100, Math.round(n)));
}

console.log("=".repeat(70));
console.log("TEST HARNESS: ISSUE #19 LOCALSTORAGE TELEMETRY CACHE VALIDATION");
console.log("=".repeat(70));

// Test 1: Save & Load Snapshot
console.log("\n[Test 1] Testing saveSnapshot and loadSnapshot...");
mockStorage.clear();
const liveData = { tank1: 75, tank2: 45, tank3: 90, tank4: 30 };
saveSnapshot(liveData);
const loaded = loadSnapshot();
assert(loaded !== null, "Loaded snapshot should not be null");
assert(typeof loaded.savedAt === "number", "savedAt should be a timestamp number");
assert.deepStrictEqual(loaded.tanks, liveData, "Loaded tanks should match saved data");
console.log("PASS: Snapshot correctly persisted to and retrieved from localStorage.");

// Test 2: Error Resilience (Corrupt data in localStorage)
console.log("\n[Test 2] Testing resilient loadSnapshot on corrupted JSON...");
mockStorage.setItem(CACHE_KEY, "INVALID_JSON_CORRUPTED{{{");
const corruptedResult = loadSnapshot();
assert.strictEqual(corruptedResult, null, "Corrupt storage should safely return null without throwing");
console.log("PASS: Corrupted JSON safely returns null without throwing exceptions.");

// Test 3: Value Sanitization & Boundary Clamping
console.log("\n[Test 3] Testing level sanitization and boundary clamping...");
assert.strictEqual(sanitizeLevel(50), 50);
assert.strictEqual(sanitizeLevel(-10), 0, "Negative values must clamp to 0");
assert.strictEqual(sanitizeLevel(150), 100, "Values > 100 must clamp to 100");
assert.strictEqual(sanitizeLevel("85"), 85, "String numbers must be parsed");
assert.strictEqual(sanitizeLevel("invalid"), null, "Non-numeric strings return null");
assert.strictEqual(sanitizeLevel(null), null, "null returns null");
assert.strictEqual(sanitizeLevel(undefined), null, "undefined returns null");
console.log("PASS: Tank values strictly clamped in [0, 100] and invalid inputs handled.");

// Test 4: Offline Banner Presentation & Timestamp Indicator
console.log("\n[Test 4] Testing offline banner visibility and timestamp formatting...");
const timestamp = 1774000000000;
showCachedBanner(timestamp);
assert.strictEqual(mockBanner.hidden, false, "Banner should be visible when offline");
assert(mockBanner.textContent.includes("Offline: showing cached data from "), "Banner text must include offline notice");
assert(mockBanner.textContent.length > 35, "Banner text must include formatted timestamp");
hideCachedBanner();
assert.strictEqual(mockBanner.hidden, true, "Banner should be hidden when online data arrives");
console.log("PASS: Banner correctly displays formatted timestamp and toggles visibility.");

// Test 5: Full Offline Fallback Lifecycle
console.log("\n[Test 5] Simulating full offline fallback lifecycle...");
mockStorage.clear();
mockBanner.hidden = true;

// Step 5a: Initial load without cache -> returns null
let initialCache = loadSnapshot();
assert.strictEqual(initialCache, null);

// Step 5b: Live network data arrives -> saved to storage & banner hidden
onLiveData = (data) => {
  saveSnapshot(data);
  hideCachedBanner();
};
onLiveData({ tank1: 80, tank2: 60, tank3: 70, tank4: 50 });
assert.strictEqual(mockBanner.hidden, true);

// Step 5c: Browser reloads offline -> loads cached data and displays timestamp banner
const offlineCache = loadSnapshot();
assert(offlineCache !== null);
showCachedBanner(offlineCache.savedAt);
assert.strictEqual(mockBanner.hidden, false);
assert(mockBanner.textContent.includes("Offline: showing cached data from"));
console.log("PASS: Complete offline fallback lifecycle verified successfully.");

console.log("\n" + "=".repeat(70));
console.log("ALL 5 TEST SUITES PASSED (100% PASS)");
console.log("=".repeat(70));
