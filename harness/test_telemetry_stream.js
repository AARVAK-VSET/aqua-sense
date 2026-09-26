const TelemetryManager = require("../src/lib/telemetry-manager");

let passed = 0;
let failed = 0;

function test(name, condition) {
  if (condition) {
    console.log(`PASS: ${name}`);
    passed++;
  } else {
    console.log(`FAIL: ${name}`);
    failed++;
  }
}

console.log("=== AquaSense Telemetry Stream Test ===\n");

// 1. Registration
const manager = new TelemetryManager();

const tank1 = manager.registerTank("tank1");
const tank2 = manager.registerTank("tank2");

test("registerTank creates tank1", !!tank1);
test("registerTank creates tank2", !!tank2);

// 2. Multi-vessel updates
manager.updateTank("tank1", 75);
manager.updateTank("tank2", 60);

test("tank1 level updated", manager.getTankState("tank1").level === 75);
test("tank2 level updated", manager.getTankState("tank2").level === 60);

// 3. Level normalization / clamping
manager.updateTank("tank1", 150);
test(
  "levels above 100 are clamped to 100",
  manager.getTankState("tank1").level === 100
);

manager.updateTank("tank1", -20);
test(
  "levels below 0 are clamped to 0",
  manager.getTankState("tank1").level === 0
);

// 4. Alarm listener
let receivedAlarm = null;

manager.onAlarmTrigger(function (alert) {
  receivedAlarm = alert;
});

manager.updateTank("tank2", 15);

test(
  "alarm listener receives notification",
  receivedAlarm !== null
);

test(
  "alarm notification identifies correct tank",
  receivedAlarm && receivedAlarm.tankId === "tank2"
);

test(
  "alarm notification contains normalized level",
  receivedAlarm && receivedAlarm.level === 15
);

// 5. Alarm count
test(
  "alarm count increments on threshold crossing",
  manager.getAlarmTriggerCount() === 2
);

// 6. Repeated critical updates do not create duplicate alarms
manager.updateTank("tank2", 10);
manager.updateTank("tank2", 5);

test(
  "repeated critical updates do not trigger duplicate alarms",
  manager.getAlarmTriggerCount() === 2
);

// 7. Recovery and re-entry
manager.updateTank("tank2", 30);
manager.updateTank("tank2", 12);

test(
  "recovery allows a new alarm episode",
  manager.getAlarmTriggerCount() === 3
);

// 8. Static normalization
test(
  "normalizeLevel converts numeric strings",
  TelemetryManager.normalizeLevel("18") === 18
);

test(
  "normalizeLevel clamps high values",
  TelemetryManager.normalizeLevel(150) === 100
);

test(
  "normalizeLevel clamps low values",
  TelemetryManager.normalizeLevel(-10) === 0
);

test(
  "normalizeLevel rejects invalid values",
  TelemetryManager.normalizeLevel("abc") === null
);

console.log("\n=== Test Summary ===");
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed > 0) {
  process.exit(1);
}

console.log("\nALL TELEMETRY STREAM TESTS PASSED");