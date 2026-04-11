const { contextBridge, ipcRenderer } = require("electron");

if (process.platform === "win32") {
  contextBridge.exposeInMainWorld("akvcam", {
    resolve: () => ipcRenderer.invoke("akvcam:resolve"),
    start: (opts) => ipcRenderer.invoke("akvcam:start", opts),
    stop: () => ipcRenderer.invoke("akvcam:stop"),
    openInstaller: () => ipcRenderer.invoke("akvcam:open-installer"),
    /** Raw RGB24 frame; length must be width * height * 3 */
    pushFrame: (arrayBuffer) => {
      ipcRenderer.send("akvcam-frame", arrayBuffer);
    },
  });
}
