#include <Arduino.h>
#include <ESP8266WiFi.h>
#include <WiFiUdp.h>
#include "FirebaseESP8266.h"
#include <DateTime.h>

const int trigPin = D1;
const int echoPin = D2;
const int relayPin = D5; // pump relay control pin
const unsigned long tankDepth = 500UL;

const int VAL_PROBE1 = A0;
const int VAL_PROBE2 = A1;
const int VAL_PROBE3 = A2;
const int VAL_PROBE4 = A3;
const int WATER_LEVEL = 850;

// --- Issue #22: hysteresis deadband + guard timers ---
const int PUMP_ON_THRESHOLD = 25;   // turn pump ON when level drops below this
const int PUMP_OFF_THRESHOLD = 85;  // turn pump OFF when level rises above this
const unsigned long MIN_RUN_MS = 5000UL;      // minimum time pump stays ON once started
const unsigned long MIN_COOLDOWN_MS = 5000UL; // minimum time pump stays OFF once stopped

bool pumpOn = false;
unsigned long lastSwitchTime = 0;
// -----------------------------------------------------

#define FIREBASE_HOST "*******************"
#define FIREBASE_AUTH "*************"
#define WIFI_SSID "*********"
#define WIFI_PASSWORD "**********"

FirebaseData firebaseData;

int readUltrasonicLevelPercent()
{
  digitalWrite(trigPin, LOW);
  delayMicroseconds(2);
  digitalWrite(trigPin, HIGH);
  delayMicroseconds(10);
  digitalWrite(trigPin, LOW);

  unsigned long duration = pulseIn(echoPin, HIGH, 30000UL);
  if (duration == 0) return -1;

  unsigned long distance = duration / 58UL;
  if (distance > tankDepth) distance = tankDepth;

  int percent = (tankDepth - distance) * 100UL / tankDepth;
  percent = constrain(percent, 0, 100);

  Serial.println(percent);

  return percent;
}

// Applies a Schmitt-trigger style hysteresis deadband so sensor noise near
// either threshold does not cause the relay to chatter. A minimum run/cooldown
// timer provides a second layer of short-cycle protection.
void updatePumpRelay(int percent, unsigned long now)
{
  bool wantOn = pumpOn;

  if (!pumpOn && percent < PUMP_ON_THRESHOLD)  wantOn = true;
  if (pumpOn  && percent > PUMP_OFF_THRESHOLD) wantOn = false;

  if (wantOn != pumpOn)
  {
    unsigned long minWait = pumpOn ? MIN_RUN_MS : MIN_COOLDOWN_MS;
    if (now - lastSwitchTime >= minWait)
    {
      pumpOn = wantOn;
      lastSwitchTime = now;
      digitalWrite(relayPin, pumpOn ? HIGH : LOW);

      Firebase.setBool(firebaseData, "PumpOn", pumpOn);
      Firebase.setInt(firebaseData, "PumpOnThreshold", PUMP_ON_THRESHOLD);
      Firebase.setInt(firebaseData, "PumpOffThreshold", PUMP_OFF_THRESHOLD);
    }
  }
}

void setup()
{
  Serial.begin(115200);

  pinMode(trigPin, OUTPUT);
  pinMode(echoPin, INPUT);
  pinMode(relayPin, OUTPUT);
  digitalWrite(relayPin, LOW);

  Firebase.begin(FIREBASE_HOST, FIREBASE_AUTH);

  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Connecting to Wi-Fi");
  while (WiFi.status() != WL_CONNECTED)
  {
    Serial.print(".");
    delay(300);
  }
  Serial.println();
  Serial.print("Connected with IP: ");
  Serial.println(WiFi.localIP());
  Serial.println();

  Firebase.reconnectWiFi(true);
}

// Converts a raw 10-bit ADC reading (0-1023) from an analog probe into
// a calibrated, clamped 0-100 percentage value before it is transmitted.
int convertAdcToPercent(int rawValue)
{
  int clampedRaw = constrain(rawValue, 0, 1023);
  long scaled = (long)clampedRaw * 100L / 1023L;
  return (int)constrain(scaled, 0L, 100L);
}

void loop()
{
  int percent = readUltrasonicLevelPercent();
  if (percent >= 0)
  {
    Firebase.setInt(firebaseData, "WaterLevelPercent", percent);
    updatePumpRelay(percent, millis());
  }

  int val1 = analogRead(VAL_PROBE1);
  int val2 = analogRead(VAL_PROBE2);
  int val3 = analogRead(VAL_PROBE3);
  int val4 = analogRead(VAL_PROBE4);

  int percent1 = convertAdcToPercent(val1);
  int percent2 = convertAdcToPercent(val2);
  int percent3 = convertAdcToPercent(val3);
  int percent4 = convertAdcToPercent(val4);

  Firebase.setInt(firebaseData, "WaterLevel1", percent1);
  Firebase.setInt(firebaseData, "WaterLevel2", percent2);
  Firebase.setInt(firebaseData, "WaterLevel3", percent3);
  Firebase.setInt(firebaseData, "WaterLevel4", percent4);

  delay(3000);
}