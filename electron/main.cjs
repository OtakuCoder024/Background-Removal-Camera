const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { app, BrowserWindow, Tray, Menu, nativeImage, screen } = require("electron");

app.commandLine.appendSwitch("disable-renderer-backgrounding");
app.commandLine.appendSwitch("disable-background-timer-throttling");
app.commandLine.appendSwitch("disable-backgrounding-occluded-windows");

function getWindowIcon() {
  const pngPath = app.isPackaged
    ? path.join(process.resourcesPath, "window-icon.png")
    : path.join(__dirname, "window-icon.png");
  if (fs.existsSync(pngPath)) {
    const buf = fs.readFileSync(pngPath);
    const img = nativeImage.createFromBuffer(buf, { width: 256, height: 256 });
    if (!img.isEmpty()) return img;
  }
  return undefined;
}

function getTrayIcon() {
  const icoPath = app.isPackaged
    ? path.join(process.resourcesPath, "app-icon.ico")
    : path.join(__dirname, "icon.ico");
  if (fs.existsSync(icoPath)) {
    const img = nativeImage.createFromPath(icoPath);
    if (!img.isEmpty()) return img;
  }
  const win = getWindowIcon();
  return win ? win.resize({ width: 16, height: 16 }) : nativeImage.createEmpty();
}

const useViteDevServer = process.env.ELECTRON_DEV === "1" && !app.isPackaged;

let mainWindow = null;
let tray = null;

/*
 * "Off-screen" mode — instead of truly minimizing (which releases the GPU surface
 * and kills WebGL / TF.js), we move the full-size window far off-screen.
 *
 * The window stays in the normal (non-minimized) state, so the OS compositor
 * keeps the GPU context alive and the canvas renders at full resolution.
 * OBS Window Capture can still grab the full-size frame because it reads the
 * window's backbuffer directly, regardless of on-screen position.
 */
let _offscreen = false;
let _normalBounds = null;
let _miniGuard = false;

function enterOffscreen() {
  if (!mainWindow || mainWindow.isDestroyed() || _offscreen || _miniGuard) return;
  _miniGuard = true;
  _offscreen = true;
  _normalBounds = mainWindow.getBounds();

  mainWindow.setSkipTaskbar(true);
  mainWindow.setPosition(-32000, -32000);

  if (tray) tray.setToolTip("Background Removal Camera — click tray icon to restore");
  setTimeout(() => { _miniGuard = false; }, 300);
}

function exitOffscreen() {
  if (!mainWindow || mainWindow.isDestroyed() || !_offscreen) return;
  _offscreen = false;
  _miniGuard = true;
  mainWindow.setSkipTaskbar(false);
  if (_normalBounds) {
    mainWindow.setBounds(_normalBounds);
    _normalBounds = null;
  }
  mainWindow.focus();
  if (tray) tray.setToolTip("Background Removal Camera");
  setTimeout(() => { _miniGuard = false; }, 300);
}

function createTray() {
  tray = new Tray(getTrayIcon());
  tray.setToolTip("Background Removal Camera");
  tray.on("click", () => {
    if (_offscreen) {
      exitOffscreen();
    } else if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Restore window", click: () => {
        if (_offscreen) exitOffscreen();
        else if (mainWindow) { mainWindow.restore(); mainWindow.show(); mainWindow.focus(); }
      }},
      { type: "separator" },
      { label: "Quit", click: () => { app.isQuiting = true; app.quit(); } },
    ])
  );
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 520,
    title: "Background Removal Camera",
    backgroundColor: "#0f1218",
    icon: getWindowIcon(),
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.cjs"),
      sandbox: false,
      backgroundThrottling: false,
    },
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  /*
   * Intercept minimize: event.preventDefault() does NOT work on Windows for the
   * minimize event. Instead, we let the minimize happen, then immediately restore
   * the window and shrink it to a PiP corner widget. The brief minimize→restore
   * might briefly threaten the GPU context, but the renderer has recovery logic.
   */
  mainWindow.on("minimize", () => {
    if (_miniGuard || !mainWindow || mainWindow.isDestroyed()) return;
    setTimeout(() => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      mainWindow.restore();
      enterOffscreen();
    }, 80);
  });

  mainWindow.on("close", (event) => {
    if (!app.isQuiting) {
      event.preventDefault();
      enterOffscreen();
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  if (useViteDevServer) {
    mainWindow.loadURL("http://127.0.0.1:5173/");
  } else {
    const indexHtml = path.join(__dirname, "..", "dist", "index.html");
    mainWindow.loadURL(pathToFileURL(indexHtml).href);
  }
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (_offscreen) exitOffscreen();
    else if (mainWindow) { mainWindow.restore(); mainWindow.show(); mainWindow.focus(); }
  });

  app.whenReady().then(() => {
    createTray();
    createWindow();
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on("before-quit", () => {
    app.isQuiting = true;
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}
