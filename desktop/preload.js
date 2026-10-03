const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("rnDesktop", {
  update: state => ipcRenderer.send("np:update", state),
  onCommand: callback => ipcRenderer.on("np:cmd", (event, command) => callback(command))
});
