# AquaSense 💧

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![IoT](https://img.shields.io/badge/Domain-IoT%20%26%20Embedded-blue.svg)](https://github.com/AARVAK-VSET)
[![Organization](https://img.shields.io/badge/Organization-AARVAK--VSET-purple.svg)](https://github.com/AARVAK-VSET)
[![Event](https://img.shields.io/badge/TSJ%202026-Patch%20Wars-orange.svg)](https://github.com/AARVAK-VSET)

> **AquaSense** is an open-source, IoT-driven liquid level and water quality monitoring system. Designed for smart reservoirs, overhead tanks, and agricultural irrigation, AquaSense provides real-time ultrasonic depth sensing, multi-tank visual telemetry, threshold alerting, and cloud synchronization.

---

## 🚀 Key Features

- **Real-Time Telemetry**: Dynamic visual water ball simulation depicting current tank volumes, percentage capacities, and safe/warning/danger operational zones.
- **Multi-Tank Monitoring**: Scalable dashboard capable of simultaneous multi-tank telemetry and zone categorization.
- **Smart Threshold Alerts**: Visual indicators and audio triggers for overflow prevention and critical dry-run protection.
- **Cloud & Firebase Sync**: Live state streaming to Firebase Realtime Database and REST telemetry endpoints.
- **Hardware Agnostic**: Compatible with NodeMCU (ESP8266), ESP32, Arduino Uno/Mega with HC-SR04 ultrasonic sensors.

---

## 🛠️ Hardware Requirements

| Component | Model | Purpose |
| :--- | :--- | :--- |
| **Microcontroller** | NodeMCU ESP8266 / ESP32 | Wi-Fi connectivity & sensor data acquisition |
| **Distance Sensor** | HC-SR04 Ultrasonic Sensor | Non-contact liquid level distance measurement |
| **Actuator** | 5V Relay Module | Automated pump motor cut-off control |
| **Display (Optional)** | 16x2 I2C LCD | Local telemetry status readout |
| **Power Supply** | 5V 2A DC Adapter | Stable microcontroller power source |

---

## 📁 Repository Structure

```
aqua-sense/
├── assets/              # Badges, system diagrams, and UI branding assets
├── docs/                # System documentation & technical schematics
├── screenshots/         # Dashboard UI previews
├── src/                 # Web application & dashboard source
│   ├── home.html        # Primary multi-tank dashboard
│   ├── demo.html        # Water animation component demo
│   ├── Firebase-interagtion.html # Live Firebase synchronization view
│   └── lib/             # Canvas-based water ball visualization engine
├── _config.yml          # Jekyll documentation config
├── CODE_OF_CONDUCT.md
├── CONTRIBUTING.md
├── LICENSE
└── README.md
```

---

## ⚡ Running the Web Dashboard Locally

Simply open the dashboard in your web browser:

```bash
# Clone the repository
git clone https://github.com/AARVAK-VSET/aqua-sense.git
cd aqua-sense

# Option 1: Open directly in your browser
start src/home.html

# Option 2: Serve via local HTTP server
npx serve src
```

---

## 🤝 Contributing to Patch Wars 2026

We welcome contributions from all **Patch Wars (TSJ 2026)** participants!

1. Fork this repository: `https://github.com/AARVAK-VSET/aqua-sense`
2. Claim an open issue by commenting `"Claiming this issue"` on the issue thread.
3. Create your feature branch: `git checkout -b fix/issue-<number>`
4. Implement your enhancements and test locally.
5. Submit a pull request referencing your issue: `Fixes #12`

---

## 📄 License

Distributed under the MIT License. See [LICENSE](LICENSE) for more details.  
Maintained by **[AARVAK-VSET](https://github.com/AARVAK-VSET)**.
