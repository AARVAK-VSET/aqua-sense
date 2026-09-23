#!/usr/bin/env python3
"""
Regression and Validation Test Harness for Issue #22:
Implement automated pump relay controller with deadband oscillation protection.

Validates that:
1. The pump only turns ON when the level drops below PUMP_ON_THRESHOLD (25%).
2. The pump only turns OFF when the level rises above PUMP_OFF_THRESHOLD (85%).
3. Noisy sensor readings oscillating around a 50% threshold never cause chatter.
4. 200 noisy readings between 48-52% produce at most 4 relay toggles
   (two full ON/OFF cycles maximum).
"""

import random
import sys

PUMP_ON_THRESHOLD = 25
PUMP_OFF_THRESHOLD = 85


def simulate_pump(levels):
    """
    Simulates the firmware's updatePumpRelay() hysteresis logic in Python.
    Equivalent to the C++ logic in src/Water_level/Water_level.ino:
      if (!pumpOn && percent < PUMP_ON_THRESHOLD)  wantOn = true;
      if (pumpOn  && percent > PUMP_OFF_THRESHOLD) wantOn = false;
    (Guard timers are omitted here since this harness checks pure
    threshold/deadband behavior across a reading sequence.)
    """
    pump_on = False
    toggles = 0
    history = []

    for level in levels:
        want_on = pump_on
        if not pump_on and level < PUMP_ON_THRESHOLD:
            want_on = True
        if pump_on and level > PUMP_OFF_THRESHOLD:
            want_on = False

        if want_on != pump_on:
            pump_on = want_on
            toggles += 1

        history.append(pump_on)

    return toggles, history


def run_tests():
    print("=" * 80)
    print("AQUASENSE FIRMWARE TEST HARNESS: ISSUE #22 HYSTERESIS DEADBAND VALIDATION")
    print("=" * 80)
    print(f"ON threshold: <{PUMP_ON_THRESHOLD}% | OFF threshold: >{PUMP_OFF_THRESHOLD}%\n")

    all_passed = True

    # --- Test 1: noisy readings oscillating between 48-52% must not chatter ---
    random.seed(42)
    noisy_levels = [50 + random.uniform(-2, 2) for _ in range(200)]
    toggles, _ = simulate_pump(noisy_levels)

    status = "PASS" if toggles <= 4 else "FAIL"
    print(f"Test 1 - 200 noisy readings (48-52%): {toggles} toggle(s) -> {status}")
    assert toggles <= 4, f"Too many toggles from sensor noise: {toggles}"
    if status == "FAIL":
        all_passed = False

    # --- Test 2: level actually dropping below ON threshold must start pump ---
    low_levels = [40, 35, 30, 20, 15]
    toggles, history = simulate_pump(low_levels)
    status = "PASS" if history[-1] is True else "FAIL"
    print(f"Test 2 - level drops to 15%: pump ends ON -> {status}")
    assert history[-1] is True, "Pump should turn ON once level drops below 25%"
    if status == "FAIL":
        all_passed = False

    # --- Test 3: level actually rising above OFF threshold must stop pump ---
    high_levels = [15, 30, 50, 70, 90]
    toggles, history = simulate_pump(high_levels)
    status = "PASS" if history[-1] is False else "FAIL"
    print(f"Test 3 - level rises to 90%: pump ends OFF -> {status}")
    assert history[-1] is False, "Pump should turn OFF once level rises above 85%"
    if status == "FAIL":
        all_passed = False

    # --- Test 4: comprehensive sweep, pump state always boolean & stable in deadband ---
    print("\nExecuting comprehensive sweep (26 to 84%, deadband zone)...")
    deadband_levels = list(range(26, 85))
    toggles, _ = simulate_pump(deadband_levels)
    status = "PASS" if toggles == 0 else "FAIL"
    print(f"Test 4 - deadband sweep 26-84%: {toggles} toggle(s) -> {status}")
    assert toggles == 0, "No toggles should occur while strictly inside the deadband"
    if status == "FAIL":
        all_passed = False

    print("\n" + "=" * 80)
    if all_passed:
        print("ALL TESTS PASSED: Hysteresis deadband eliminates relay chatter.")
        print("=" * 80)
        return 0
    else:
        print("TESTS FAILED.")
        print("=" * 80)
        return 1


if __name__ == "__main__":
    sys.exit(run_tests())
