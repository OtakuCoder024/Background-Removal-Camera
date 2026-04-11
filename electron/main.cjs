const fs = require("node:fs");
const path = require("node:path");

const { pathToFileURL } = require("node:url");

const { app, BrowserWindow, nativeImage } = require("electron");

/**
 * Load window-icon.png as a buffer and create the nativeImage with explicit size.
 * This avoids Windows misreading ICO layer dimensions and skewing the title-bar icon.
 */
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



/** Vite dev server only when explicitly requested and not running from a packaged app. */

const useViteDevServer =

  process.env.ELECTRON_DEV === "1" && !app.isPackaged;



let mainWindow = null;



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

      /** WebGL (TensorFlow.js) is more reliable with sandbox off in Electron. */

      sandbox: false,

    },

  });



  mainWindow.once("ready-to-show", () => {

    mainWindow?.show();

  });



  if (useViteDevServer) {

    mainWindow.loadURL("http://127.0.0.1:5173/");

  } else {

    const indexHtml = path.join(__dirname, "..", "dist", "index.html");

    mainWindow.loadURL(pathToFileURL(indexHtml).href);

  }



  mainWindow.on("closed", () => {

    mainWindow = null;

  });

}



const gotLock = app.requestSingleInstanceLock();

if (!gotLock) {

  app.quit();

} else {

  app.on("second-instance", () => {

    if (mainWindow) {

      if (mainWindow.isMinimized()) {

        mainWindow.restore();

      }

      mainWindow.focus();

    }

  });



  app.whenReady().then(() => {

    createWindow();

    app.on("activate", () => {

      if (BrowserWindow.getAllWindows().length === 0) {

        createWindow();

      }

    });

  });



  app.on("window-all-closed", () => {

    if (process.platform !== "darwin") {

      app.quit();

    }

  });

}

