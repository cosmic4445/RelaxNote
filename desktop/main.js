const { app, BrowserWindow, Menu, shell } = require("electron");
const path = require("path");
const fs = require("fs");

app.commandLine.appendSwitch("enable-features", "HardwareMediaKeyHandling,MediaSessionService");

if (!app.requestSingleInstanceLock()) app.quit();

let win;

function readConfig() {
  const file = path.join(app.getPath("userData"), "config.json");
  if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify({ serverUrl: "" }, null, 2));
  try {
    return { file, serverUrl: String(JSON.parse(fs.readFileSync(file, "utf8")).serverUrl || "") };
  } catch (e) {
    return { file, serverUrl: "" };
  }
}

function startLocalServer() {
  return new Promise(resolve => {
    process.env.RELAXNOTE_HOME = app.getPath("userData");
    process.env.PORT = "0";
    process.env.HOST = "127.0.0.1";
    process.env.FIRST_USER_ADMIN = "1";
    const { server } = require("../server");
    const done = () => resolve("http://127.0.0.1:" + server.address().port);
    if (server.listening) done();
    else server.once("listening", done);
  });
}

function songsFolder() {
  const dir = path.join(app.getPath("userData"), "songs");
  fs.mkdirSync(path.join(dir, "covers"), { recursive: true });
  return dir;
}

function buildMenu(cfg) {
  const template = [
    {
      label: "File",
      submenu: [
        { label: "Open songs folder", click: () => shell.openPath(songsFolder()) },
        { label: "Open settings file", click: () => shell.openPath(cfg.file) },
        { type: "separator" },
        { role: "quit" }
      ]
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "togglefullscreen" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { role: "resetZoom" }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function createWindow() {
  const cfg = readConfig();
  const remote = /^https?:\/\//.test(cfg.serverUrl) ? cfg.serverUrl : "";
  const url = remote || (await startLocalServer());
  buildMenu(cfg);

  win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 360,
    minHeight: 520,
    backgroundColor: "#0F0F0F",
    title: "RelaxNote",
    icon: path.join(__dirname, "..", "build", "icon.png"),
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false }
  });

  const origin = new URL(url).origin;
  win.webContents.setWindowOpenHandler(({ url: target }) => {
    if (/^https?:/.test(target)) shell.openExternal(target);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, target) => {
    if (new URL(target).origin !== origin) {
      event.preventDefault();
      if (/^https?:/.test(target)) shell.openExternal(target);
    }
  });

  win.loadURL(url);
}

app.on("second-instance", () => {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

app.whenReady().then(createWindow);
app.on("window-all-closed", () => app.quit());
