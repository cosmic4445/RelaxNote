const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("mini", {
  onState: callback => ipcRenderer.on("mini:state", (event, state) => callback(state)),
  onExpanded: callback => ipcRenderer.on("mini:expanded", (event, value) => callback(value)),
  cmd: command => ipcRenderer.send("mini:cmd", command),
  hover: inside => ipcRenderer.send("mini:hover", inside),
  open: () => ipcRenderer.send("mini:open")
});
