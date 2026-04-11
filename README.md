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
- **Windows virtual camera:** Optional **AKVirtualCamera** integration so other apps can use the processed feed as a normal webcam (after installing the driver).

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
```

### Windows: system virtual camera (AKVirtualCamera)

The desktop app can stream the **processed** picture to **AKVirtualCamera** so Zoom, Teams, OBS, and other apps see it as a normal webcam. This uses [webcamoid/akvirtualcamera](https://github.com/webcamoid/akvirtualcamera) (GPL-3.0). See [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

1. **One-time driver install (admin):** run the bundled installer shipped under `build/akvcam/akvirtualcamera-windows-9.4.0.exe`, or download the same file from the [releases page](https://github.com/webcamoid/akvirtualcamera/releases). Restart this app after installing.
2. In the app: **Start camera**, then enable **Stream processed output to AKVirtualCamera**.
3. In the other app, choose the virtual camera device (often named like **Virtual Camera**).

**Building from source:** `npm run akvcam:fetch` downloads the pinned installer into `build/akvcam/` (required before `npm run dist` if the file is not already there).

---

## Project layout

- `src/` — Vite + TypeScript UI and processing
- `electron/` — Electron main process, preload, AKVirtualCamera IPC (`akvcam.cjs`)
- `build/akvcam/` — bundled AKVirtualCamera installer + license text (installer binary is gitignored; use `npm run akvcam:fetch`)
- `scripts/` — icons, patch-icons, fetch-akvcam

---

## License

This project’s own code is released under the **MIT License** — see [`LICENSE`](LICENSE). Bundled third-party components (including AKVirtualCamera) are subject to their own licenses; see [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).
