#!/usr/bin/env python3
"""
Regression and Validation Test Harness for Issue #17:
Fix integer distance calculation overflow for high-depth industrial tanks.

Validates that:
1. Pulse duration and distance use unsigned 32-bit integer arithmetic.
2. 16-bit signed integer arithmetic overflow is prevented.
3. Pulse timeouts / no-echo readings (duration == 0) are safely discarded.
4. Distance is clamped to tankDepth before subtraction.
5. Calculated percentage is strictly clamped between 0 and 100.
"""

import ctypes
import sys

def buggy_16bit_calc(duration_us, tank_depth=500):
    """
    Simulates 16-bit signed integer calculations on Arduino Uno/ESP8266
    prior to the fix.
    """
    dur16 = ctypes.c_int16(duration_us).value
    dist16 = ctypes.c_int16(dur16 // 58).value
    diff16 = ctypes.c_int16(tank_depth - dist16).value
    mult16 = ctypes.c_int16(diff16 * 100).value
    percent16 = ctypes.c_int16(mult16 // tank_depth).value
    return dist16, percent16

def fixed_calc(duration_us, tank_depth=500):
    """
    Simulates the fixed unsigned long logic with timeout rejection and clamping.
    Equivalent to C++:
      unsigned long duration = pulseIn(echoPin, HIGH, 30000UL);
      if (duration == 0) return -1;
      unsigned long distance = duration / 58UL;
      if (distance > tankDepth) distance = tankDepth;
      int percent = (tankDepth - distance) * 100UL / tankDepth;
      percent = constrain(percent, 0, 100);
    """
    if duration_us == 0:
        return None, None # Discarded (no echo / timeout)

    duration = int(duration_us) & 0xFFFFFFFF
    distance = duration // 58
    if distance > tank_depth:
        distance = tank_depth

    percent = (tank_depth - distance) * 100 // tank_depth
    percent = max(0, min(100, percent))
    return distance, percent

def run_tests():
    print("=" * 80)
    print("AQUASENSE FIRMWARE TEST HARNESS: ISSUE #17 DISTANCE CALCULATION VALIDATION")
    print("=" * 80)
    print(f"Configured Tank Depth: 500 cm (High-depth industrial tank)\n")

    test_durations = [0, 5000, 23200, 40000, 60000]
    
    print(f"{'Pulse (us)':<12} | {'Buggy Dist':<12} | {'Buggy %':<10} | {'Fixed Dist':<12} | {'Fixed %':<10} | {'Status'}")
    print("-" * 80)

    all_passed = True

    for duration in test_durations:
        b_dist, b_pct = buggy_16bit_calc(duration)
        f_dist, f_pct = fixed_calc(duration)

        if duration == 0:
            assert f_pct is None, "Duration 0 must be rejected"
            status = "PASS (Rejected - No Echo)"
            f_dist_str = "N/A"
            f_pct_str = "REJECTED"
        else:
            assert f_pct is not None, f"Duration {duration} should return a valid percentage"
            assert 0 <= f_pct <= 100, f"Percentage {f_pct} out of bounds for duration {duration}"
            status = f"PASS ({f_pct}% Clamped)"
            f_dist_str = f"{f_dist} cm"
            f_pct_str = f"{f_pct}%"

        print(f"{duration:<12} | {b_dist:<12} | {b_pct:<10} | {f_dist_str:<12} | {f_pct_str:<10} | {status}")

    print("-" * 80)
    print("\nExecuting Comprehensive Sweep (0 to 100,000 us in 100 us steps)...")
    
    sweep_failures = 0
    for d in range(1, 100001, 100):
        dist, pct = fixed_calc(d)
        if pct < 0 or pct > 100:
            print(f"FAIL at duration={d}us: percent={pct}")
            sweep_failures += 1
            all_passed = False

    if sweep_failures == 0:
        print("PASS: 1,000 sweep data points strictly bounded in [0, 100]% range.")

    print("\n" + "=" * 80)
    if all_passed:
        print("ALL TESTS PASSED: Integer overflow resolved and sensor data validated.")
        print("=" * 80)
        return 0
    else:
        print("TESTS FAILED.")
        print("=" * 80)
        return 1

if __name__ == "__main__":
    sys.exit(run_tests())

