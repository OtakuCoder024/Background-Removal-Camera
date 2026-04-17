const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { ipcMain, app, shell, BrowserWindow } = require("electron");

const AKVCAM_VERSION = "9.4.0";
const INSTALLER_NAME = `akvirtualcamera-windows-${AKVCAM_VERSION}.exe`;

/** @type {import('child_process').ChildProcessWithoutNullStreams | null} */
let streamProc = null;
/** stdin backpressure: false until 'drain' after a partial write */
let akvcamStdinOk = true;
let pendingStop = false;

function bundledAkvcamDir() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "akvcam");
  }
  return path.join(__dirname, "..", "build", "akvcam");
}

function readInstallPathFromRegistry() {
  if (process.platform !== "win32") return null;
  try {
    const { execSync } = require("node:child_process");
    const out = execSync(
      'reg query "HKLM\\SOFTWARE\\Webcamoid\\VirtualCamera" /v installPath',
      { encoding: "utf8" },
    );
    const m = /installPath\s+REG_SZ\s+(.+)/.exec(out);
    return m ? m[1].trim() : null;
  } catch {
    return null;
  }
}

/**
 * Resolve AkVCamManager.exe: prefer install dir (x64) from Webcamoid registry, then common paths.
 */
function resolveAkVCamManager() {
  const inst = readInstallPathFromRegistry();
  if (inst) {
    const x64 = path.join(inst, "x64", "AkVCamManager.exe");
    const x86 = path.join(inst, "x86", "AkVCamManager.exe");
    if (fs.existsSync(x64)) return x64;
    if (fs.existsSync(x86)) return x86;
  }
  const pf = process.env.ProgramFiles;
  if (pf) {
    for (const sub of [
      path.join(pf, "AkVirtualCamera", "x64", "AkVCamManager.exe"),
      path.join(pf, "AkVirtualCamera", "x86", "AkVCamManager.exe"),
    ]) {
      if (fs.existsSync(sub)) return sub;
    }
  }
  const localBundled = path.join(bundledAkvcamDir(), "x64", "AkVCamManager.exe");
  if (fs.existsSync(localBundled)) return localBundled;
  return null;
}

function resolveInstallerPath() {
  const p = path.join(bundledAkvcamDir(), INSTALLER_NAME);
  return fs.existsSync(p) ? p : null;
}

function broadcastAkvcamStreamError(message) {
  for (const win of BrowserWindow.getAllWindows()) {
    try {
      win.webContents.send("akvcam:stream-error", message);
    } catch {
      /* ignore */
    }
  }
}

/**
 * AkVCamManager exited or the pipe broke while streaming; clear state once.
 * @param {import('child_process').ChildProcess} proc
 * @param {Error} [err]
 * @param {string} [fallbackMessage]
 */
function notifyStreamUnexpectedEnd(proc, err, fallbackMessage) {
  if (proc.akvcamNotified) return;
  proc.akvcamNotified = true;
  if (streamProc === proc) streamProc = null;
  akvcamStdinOk = true;
  try {
    proc.stdin?.removeAllListeners();
  } catch {
    /* ignore */
  }
  if (!pendingStop) {
    const msg =
      err?.message ||
      fallbackMessage ||
      "Virtual camera stream stopped unexpectedly.";
    broadcastAkvcamStreamError(msg);
  }
  try {
    if (!proc.killed) proc.kill();
  } catch {
    /* ignore */
  }
}

function stopStreamProcess() {
  pendingStop = true;
  if (streamProc) {
    const proc = streamProc;
    proc.akvcamNotified = true;
    try {
      streamProc.stdin?.removeAllListeners();
    } catch {
      /* ignore */
    }
    try {
      streamProc.stdin?.end();
    } catch {
      /* ignore */
    }
    try {
      streamProc.kill();
    } catch {
      /* ignore */
    }
    streamProc = null;
  }
  akvcamStdinOk = true;
  pendingStop = false;
}

function registerAkvcamIpc() {
  ipcMain.handle("akvcam:resolve", () => {
    const managerPath = resolveAkVCamManager();
    const installerPath = resolveInstallerPath();
    return {
      managerPath,
      installerPath,
      hasManager: !!managerPath,
      hasInstaller: !!installerPath,
      version: AKVCAM_VERSION,
    };
  });

  ipcMain.handle("akvcam:open-installer", async () => {
    const installerPath = resolveInstallerPath();
    if (!installerPath) {
      await shell.openExternal(
        `https://github.com/webcamoid/akvirtualcamera/releases/download/${AKVCAM_VERSION}/${INSTALLER_NAME}`,
      );
      return { ok: false, reason: "no-bundled-opened-url" };
    }
    const err = await shell.openPath(installerPath);
    if (err) return { ok: false, reason: err };
    return { ok: true };
  });

  ipcMain.handle("akvcam:start", async (_event, opts) => {
    stopStreamProcess();
    const managerPath = resolveAkVCamManager();
    if (!managerPath) {
      return { ok: false, error: "AkVCamManager.exe not found. Install AKVirtualCamera (bundled installer or from GitHub)." };
    }

    const width = Number(opts.width) || 960;
    const height = Number(opts.height) || 540;
    const fps = Number(opts.fps) || 30;
    const deviceId = typeof opts.deviceId === "string" ? opts.deviceId : "AkVCamVideoDevice0";

    akvcamStdinOk = true;

    try {
      streamProc = spawn(managerPath, [
        "stream",
        "--fps",
        String(fps),
        deviceId,
        "RGB24",
        String(width),
        String(height),
      ], {
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }

    const proc = streamProc;
    proc.akvcamNotified = false;

    proc.stderr?.on("data", (chunk) => {
      console.error("[akvcam]", chunk.toString());
    });
    proc.on("error", (err) => {
      console.error("[akvcam] process error", err);
    });
    proc.stdin.on("error", (err) => {
      console.error("[akvcam] stdin error", err);
      notifyStreamUnexpectedEnd(proc, err);
    });
    proc.on("close", (code) => {
      if (proc.akvcamNotified) return;
      console.warn("[akvcam] stream exited", code);
      notifyStreamUnexpectedEnd(
        proc,
        undefined,
        `AkVCamManager exited (code ${code ?? "?"})`,
      );
    });

    return { ok: true };
  });

  ipcMain.handle("akvcam:stop", async () => {
    stopStreamProcess();
    return { ok: true };
  });

  ipcMain.on("akvcam-frame", (_event, payload) => {
    const proc = streamProc;
    if (!proc?.stdin?.writable || pendingStop || proc.akvcamNotified) return;
    if (!akvcamStdinOk) return;
    const buf = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
    try {
      akvcamStdinOk = proc.stdin.write(buf, (err) => {
        if (err) {
          console.error("[akvcam] write callback error", err);
          notifyStreamUnexpectedEnd(proc, err);
        }
      });
    } catch (err) {
      console.error("[akvcam] write threw", err);
      notifyStreamUnexpectedEnd(
        proc,
        err instanceof Error ? err : new Error(String(err)),
      );
      return;
    }
    if (!akvcamStdinOk) {
      proc.stdin.once("drain", () => {
        if (streamProc === proc && !proc.akvcamNotified) akvcamStdinOk = true;
      });
    }
  });

  app.on("before-quit", () => {
    stopStreamProcess();
  });
}

module.exports = { registerAkvcamIpc, resolveAkVCamManager, bundledAkvcamDir };
