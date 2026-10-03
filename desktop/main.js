const { app, BrowserWindow, Menu, shell, screen, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");

app.commandLine.appendSwitch("enable-features", "HardwareMediaKeyHandling,MediaSessionService");

if (!app.requestSingleInstanceLock()) app.quit();

let win;
let mini;
let cfg;
let np = { has: false, title: "", artist: "", cover: "", playing: false, theme: "default" };
let miniTimer = null;
let miniExpanded = false;
let appOrigin = "";
let localUrl = "";
let connectWin = null;

function readConfig() {
  const file = path.join(app.getPath("userData"), "config.json");
  if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify({ serverUrl: "", miniPlayer: true }, null, 2));
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    return { file, serverUrl: String(data.serverUrl || ""), miniPlayer: data.miniPlayer !== false };
  } catch (e) {
    return { file, serverUrl: "", miniPlayer: true };
  }
}

function writeConfig() {
  fs.writeFileSync(cfg.file, JSON.stringify({ serverUrl: cfg.serverUrl, miniPlayer: cfg.miniPlayer }, null, 2));
}

function placeMini(expanded) {
  const area = screen.getPrimaryDisplay().workArea;
  const width = expanded ? 310 : 40;
  const height = expanded ? 96 : 56;
  mini.setBounds({ x: area.x, y: area.y + area.height - height, width, height });
}

function setExpanded(expanded) {
  if (!mini || mini.isDestroyed()) return;
  miniExpanded = expanded;
  placeMini(expanded);
  mini.webContents.send("mini:expanded", expanded);
}

function showMini() {
  if (!cfg.miniPlayer || !np.has || !mini || mini.isDestroyed()) return;
  mini.webContents.send("mini:state", np);
  setExpanded(true);
  mini.showInactive();
  clearTimeout(miniTimer);
  miniTimer = setTimeout(() => setExpanded(false), 4000);
}

function hideMini() {
  clearTimeout(miniTimer);
  if (mini && !mini.isDestroyed()) mini.hide();
}

function createMini() {
  mini = new BrowserWindow({
    width: 40,
    height: 56,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, "mini-preload.js"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  });
  mini.setAlwaysOnTop(true, "screen-saver");
  mini.loadFile(path.join(__dirname, "mini.html"));
  mini.webContents.on("did-finish-load", () => mini.webContents.send("mini:state", np));
}

function cleanState(raw) {
  const s = raw && typeof raw === "object" ? raw : {};
  const cover = typeof s.cover === "string" && /^https?:\/\//.test(s.cover) ? s.cover.slice(0, 500) : "";
  const theme = ["default", "black", "white"].includes(s.theme) ? s.theme : "default";
  return {
    has: s.has === true,
    title: String(s.title || "").slice(0, 120),
    artist: String(s.artist || "").slice(0, 120),
    cover,
    playing: s.playing === true,
    theme
  };
}

ipcMain.on("np:update", (event, raw) => {
  if (!win || event.sender !== win.webContents) return;
  const next = cleanState(raw);
  const changed = next.title !== np.title && next.has;
  np = next;
  if (mini && !mini.isDestroyed()) mini.webContents.send("mini:state", np);
  if (!np.has) hideMini();
  else if (changed && !win.isFocused()) showMini();
});

ipcMain.on("mini:cmd", (event, command) => {
  if (!win || !["toggle", "next", "prev"].includes(command)) return;
  win.webContents.send("np:cmd", command);
});

ipcMain.on("mini:hover", (event, inside) => {
  if (!mini || !mini.isVisible()) return;
  clearTimeout(miniTimer);
  if (inside) setExpanded(true);
  else miniTimer = setTimeout(() => setExpanded(false), 1200);
});

ipcMain.on("mini:open", () => {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
});

function startLocalServer() {
  return new Promise(resolve => {
    process.env.RELAXNOTE_HOME = app.getPath("userData");
    process.env.PORT = "0";
    process.env.HOST = "127.0.0.1";
    const { server } = require("../server");
    const done = () => resolve("http://127.0.0.1:" + server.address().port);
    if (server.listening) done();
    else server.once("listening", done);
  });
}

async function resolveTarget() {
  if (/^https?:\/\//.test(cfg.serverUrl)) return cfg.serverUrl;
  if (!localUrl) localUrl = await startLocalServer();
  return localUrl;
}

async function loadTarget() {
  const url = await resolveTarget();
  appOrigin = new URL(url).origin;
  await win.loadURL(url).catch(() => {});
}

function openConnectDialog() {
  if (connectWin && !connectWin.isDestroyed()) {
    connectWin.focus();
    return;
  }
  connectWin = new BrowserWindow({
    width: 480,
    height: 300,
    parent: win,
    modal: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    title: "Connect to a server",
    backgroundColor: "#0F0F0F",
    webPreferences: {
      preload: path.join(__dirname, "connect-preload.js"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  });
  connectWin.removeMenu();
  connectWin.loadFile(path.join(__dirname, "connect.html"));
  connectWin.webContents.on("did-finish-load", () => connectWin.webContents.send("connect:init", cfg.serverUrl));
}

ipcMain.on("connect:save", async (event, value) => {
  if (!connectWin || event.sender !== connectWin.webContents) return;
  const text = String(value || "").trim().replace(/\/+$/, "");
  if (text && !/^https?:\/\/\S+$/.test(text)) return;
  cfg.serverUrl = text;
  writeConfig();
  connectWin.close();
  await loadTarget();
});

ipcMain.on("connect:cancel", event => {
  if (connectWin && event.sender === connectWin.webContents) connectWin.close();
});

function songsFolder() {
  const dir = path.join(app.getPath("userData"), "songs");
  fs.mkdirSync(path.join(dir, "covers"), { recursive: true });
  return dir;
}

function buildMenu() {
  const template = [
    {
      label: "File",
      submenu: [
        { label: "Connect to a server...", click: openConnectDialog },
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
        { role: "resetZoom" },
        { type: "separator" },
        {
          label: "Show mini player when RelaxNote is not in front",
          type: "checkbox",
          checked: cfg.miniPlayer,
          click: item => {
            cfg.miniPlayer = item.checked;
            writeConfig();
            if (!cfg.miniPlayer) hideMini();
          }
        }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function createWindow() {
  cfg = readConfig();
  buildMenu();

  win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 360,
    minHeight: 520,
    backgroundColor: "#0F0F0F",
    title: "RelaxNote",
    icon: path.join(__dirname, "..", "build", "icon.png"),
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, sandbox: true, nodeIntegration: false }
  });

  win.webContents.setWindowOpenHandler(({ url: target }) => {
    if (/^https?:/.test(target)) shell.openExternal(target);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, target) => {
    if (new URL(target).origin !== appOrigin) {
      event.preventDefault();
      if (/^https?:/.test(target)) shell.openExternal(target);
    }
  });

  win.on("blur", showMini);
  win.on("focus", hideMini);
  win.on("minimize", showMini);
  win.on("closed", () => {
    hideMini();
    if (mini && !mini.isDestroyed()) mini.destroy();
  });

  win.webContents.on("did-fail-load", (event, code, description, failedUrl, isMainFrame) => {
    if (isMainFrame && code !== -3 && failedUrl.startsWith("http")) {
      win.loadFile(path.join(__dirname, "offline.html"), { query: { url: failedUrl } });
    }
  });

  createMini();
  await loadTarget();
}

app.on("second-instance", () => {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

app.whenReady().then(createWindow);
app.on("window-all-closed", () => app.quit());
