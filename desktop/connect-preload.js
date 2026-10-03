const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("connect", {
  onInit: callback => ipcRenderer.on("connect:init", (event, value) => callback(value)),
  save: value => ipcRenderer.send("connect:save", value),
  cancel: () => ipcRenderer.send("connect:cancel")
});
