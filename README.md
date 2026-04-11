# Background Removal Camera

A lightweight, privacy-first camera application that provides real-time **background blur**, **solid color replacement**, or **custom background images** directly in your webcam preview. 

Built with **TensorFlow.js** and **MediaPipe Selfie Segmentation**, all processing happens 100% locally on your machine. There are no cloud APIs, no account sign-ups, and no telemetry—just grant camera permissions and start broadcasting.

Run it directly in your modern web browser, or build it as a standalone Windows desktop application using Electron.

---

## ✨ Key Features

- **Advanced Segmentation Controls:** Fine-grained parameter controls—including masking sensitivity, edge smoothing, and feathering—to maintain precise subject segmentation and prevent edge degradation.
- **Versatile Background Options:** Toggle seamlessly between real-time blur, solid colors, or custom image replacements.
- **OBS-Optimized UI:** A dedicated "Fill Window" mode automatically hides the user interface, providing a clean, chrome-less video feed perfect for OBS Window Capture. (Press `Esc` or hover the preview to restore controls).
- **Mirror Mode:** Standard horizontal flipping for a natural, front-facing camera experience.
- **Cross-Platform Flexibility:** Run as a standard web app, or use the packaged Electron build for a native desktop window experience.

---

## ⚙️ Requirements

- **Node.js:** v18+ (v20 LTS is highly recommended).
- **OS (for Desktop Builds):** Windows is required to run the packaged desktop build scripts as configured (`electron-builder --win`). The web version runs on any OS with a modern browser.

---

## 🚀 Quick Start (Development)

Clone the repository and install the dependencies to get started:

```bash
git clone [https://github.com/OtakuCoder024/Background-Removal-Camera.git](https://github.com/OtakuCoder024/Background-Removal-Camera.git)
cd Background-Removal-Camera
npm install
