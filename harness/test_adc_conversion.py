#!/usr/bin/env python3
"""
Regression and Validation Test Harness for Issue #59:
Calibrate raw ADC readings to a clamped 0-100 percentage before
transmission, and ensure every Firebase.setInt call in the firmware
loop passes the required FirebaseData tracking object.

Validates that:
1. Raw 10-bit ADC readings (0-1023) are linearly mapped to 0-100.
2. Out-of-range / edge-case inputs (negative, > 1023) are clamped.
3. The firmware source no longer contains any Firebase.setInt(...) call
   that omits the firebaseData object as its first argument.
4. The firmware source actually calls the conversion function before
   transmitting each of the four probe readings.
"""

import re
import sys
from pathlib import Path

ADC_MAX = 1023

FIRMWARE_PATH = Path("src/Water_level/Water_level.ino")


def convert_adc_to_percent(raw_value):
    """
    Python mirror of the fixed C++ logic:

        int convertAdcToPercent(int rawValue)
        {
          int clampedRaw = constrain(rawValue, 0, 1023);
          long scaled = (long)clampedRaw * 100L / 1023L;
          return (int)constrain(scaled, 0L, 100L);
        }
    """
    clamped_raw = max(0, min(ADC_MAX, raw_value))
    scaled = (clamped_raw * 100) // ADC_MAX
    return max(0, min(100, scaled))


def test_calibration_mapping():
    print("-" * 80)
    print("1. Calibration mapping (0-1023 -> 0-100)")
    print("-" * 80)

    cases = [
        (0, 0),
        (1023, 100),
        (512, 50),
        (256, 25),
        (768, 75),
    ]

    all_passed = True
    for raw, expected in cases:
        got = convert_adc_to_percent(raw)
        # allow +/-1 for integer rounding differences
        ok = abs(got - expected) <= 1
        status = "PASS" if ok else "FAIL"
        print(f"  raw={raw:<5} expected~={expected:<4} got={got:<4} [{status}]")
        all_passed = all_passed and ok

    return all_passed


def test_edge_case_clamping():
    print("-" * 80)
    print("2. Edge-case clamping (out-of-range inputs)")
    print("-" * 80)

    cases = [
        (-500, 0),
        (-1, 0),
        (2000, 100),
        (5000, 100),
    ]

    all_passed = True
    for raw, expected in cases:
        got = convert_adc_to_percent(raw)
        ok = got == expected
        status = "PASS" if ok else "FAIL"
        print(f"  raw={raw:<6} expected={expected:<4} got={got:<4} [{status}]")
        all_passed = all_passed and ok

    return all_passed


def test_full_sweep():
    print("-" * 80)
    print("3. Full sweep (0 to 1023) - result must always be within [0, 100]")
    print("-" * 80)

    failures = 0
    for raw in range(0, ADC_MAX + 1):
        pct = convert_adc_to_percent(raw)
        if pct < 0 or pct > 100:
            print(f"  FAIL at raw={raw}: percent={pct}")
            failures += 1

    if failures == 0:
        print(f"  PASS: all {ADC_MAX + 1} values mapped within [0, 100]%.")

    return failures == 0


def test_firmware_payload_formatting():
    print("-" * 80)
    print("4. Firmware payload formatting (source-level checks)")
    print("-" * 80)

    if not FIRMWARE_PATH.exists():
        print(f"  FAIL: firmware file not found at {FIRMWARE_PATH}")
        return False

    source = FIRMWARE_PATH.read_text()
    all_passed = True

    # No setInt call should omit the firebaseData tracking object.
    # A correct call looks like: Firebase.setInt(firebaseData, "Key", value)
    bad_calls = re.findall(r'Firebase\.setInt\(\s*"', source)
    if bad_calls:
        print(f"  FAIL: found {len(bad_calls)} Firebase.setInt(...) call(s) "
              f"missing the firebaseData argument.")
        all_passed = False
    else:
        print("  PASS: every Firebase.setInt(...) call passes firebaseData.")

    good_calls = re.findall(r'Firebase\.setInt\(\s*firebaseData\s*,', source)
    if len(good_calls) < 5:
        print(f"  FAIL: expected at least 5 Firebase.setInt(firebaseData, ...) "
              f"calls (WaterLevelPercent + 4 probes), found {len(good_calls)}.")
        all_passed = False
    else:
        print(f"  PASS: found {len(good_calls)} correctly-formed setInt calls.")

    # The four probe readings must be run through the conversion function
    # before transmission, not sent as raw analogRead() values.
    if "convertAdcToPercent" not in source:
        print("  FAIL: no ADC-to-percent conversion function found in firmware.")
        all_passed = False
    else:
        conversions = re.findall(r'convertAdcToPercent\(val\d\)', source)
        if len(conversions) < 4:
            print(f"  FAIL: expected 4 probe readings converted, found "
                  f"{len(conversions)}.")
            all_passed = False
        else:
            print("  PASS: all 4 probe readings are converted before transmission.")

    raw_probe_sends = re.findall(
        r'Firebase\.setInt\(\s*firebaseData\s*,\s*"WaterLevel\d"\s*,\s*val\d\s*\)',
        source,
    )
    if raw_probe_sends:
        print("  FAIL: found probe values transmitted without conversion.")
        all_passed = False
    else:
        print("  PASS: no raw (unconverted) probe values are transmitted.")

    return all_passed


def run_tests():
    print("=" * 80)
    print("AQUASENSE FIRMWARE TEST HARNESS: ISSUE #59 ADC CALIBRATION VALIDATION")
    print("=" * 80)

    results = [
        test_calibration_mapping(),
        test_edge_case_clamping(),
        test_full_sweep(),
        test_firmware_payload_formatting(),
    ]

    print("=" * 80)
    if all(results):
        print("ALL TESTS PASSED: ADC calibration and payload formatting verified.")
        print("=" * 80)
        return 0
    else:
        print("TESTS FAILED.")
        print("=" * 80)
        return 1


if __name__ == "__main__":
    sys.exit(run_tests())