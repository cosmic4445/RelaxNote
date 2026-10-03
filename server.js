const express = require("express");
const multer = require("multer");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = __dirname;
const HOME = process.env.RELAXNOTE_HOME || ROOT;
const DATA = path.join(HOME, "data");
const UPLOADS = path.join(HOME, "uploads");
const SONGS = path.join(HOME, "songs");
const COVERS = path.join(SONGS, "covers");
[DATA, UPLOADS, SONGS, COVERS].forEach(d => fs.mkdirSync(d, { recursive: true }));
const SEED = path.join(ROOT, "songs", "catalog.json");
const CATALOG = path.join(SONGS, "catalog.json");
if (!fs.existsSync(CATALOG) && fs.existsSync(SEED)) fs.copyFileSync(SEED, CATALOG);

const DB_FILE = path.join(DATA, "db.json");
const SECRET_FILE = path.join(DATA, "secret.txt");
if (!fs.existsSync(SECRET_FILE)) fs.writeFileSync(SECRET_FILE, crypto.randomBytes(32).toString("hex"));
const SECRET = process.env.JWT_SECRET || fs.readFileSync(SECRET_FILE, "utf8");
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
const GENRES = ["lofi", "electronic", "rock", "metal", "kpop", "other"];

let db = fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE, "utf8")) : { users: [], songs: [] };
function save() {
  fs.writeFileSync(DB_FILE + ".tmp", JSON.stringify(db, null, 2));
  fs.renameSync(DB_FILE + ".tmp", DB_FILE);
}

const FIRST_ADMIN = process.env.FIRST_USER_ADMIN === "1";
const roleOf = u => {
  if (ADMIN_EMAIL) return u.email === ADMIN_EMAIL ? "admin" : "user";
  return FIRST_ADMIN && db.users[0] && db.users[0].id === u.id ? "admin" : "user";
};
const enc = v => encodeURIComponent(v).replace(/'/g, "%27");
const IMAGE_EXT = /\.(jpe?g|png|webp)$/i;
function isImage(file) {
  try {
    const fd = fs.openSync(file, "r");
    const b = Buffer.alloc(12);
    fs.readSync(fd, b, 0, 12, 0);
    fs.closeSync(fd);
    const jpg = b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
    const png = b[0] === 0x89 && b.toString("ascii", 1, 4) === "PNG";
    const webp = b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP";
    return jpg || png || webp;
  } catch (e) {
    return false;
  }
}
const publicUser = u => ({ id: u.id, name: u.name, email: u.email, role: roleOf(u) });
const sign = u => jwt.sign({ id: u.id }, SECRET, { expiresIn: "30d" });

const hits = new Map();
function limiter(req, res, next) {
  const now = Date.now();
  const rec = (hits.get(req.ip) || []).filter(t => now - t < 15 * 60 * 1000);
  if (rec.length >= 30) return res.status(429).json({ error: "Too many attempts. Try again in 15 minutes." });
  rec.push(now);
  hits.set(req.ip, rec);
  next();
}

function auth(req, res, next) {
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : req.query.t;
  try {
    const p = jwt.verify(token, SECRET);
    const u = db.users.find(x => x.id === p.id);
    if (!u) throw new Error("no user");
    req.user = publicUser(u);
    next();
  } catch (e) {
    res.status(401).json({ error: "Sign in required." });
  }
}
function adminOnly(req, res, next) {
  if (req.user.role !== "admin") return res.status(403).json({ error: "Admins only." });
  next();
}

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOADS,
    filename: (req, file, cb) => cb(null, crypto.randomUUID() + path.extname(file.originalname).toLowerCase())
  }),
  limits: { fileSize: 30 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = file.fieldname === "cover" ? IMAGE_EXT.test(file.originalname) : /\.(mp3|wav|ogg|flac|m4a)$/i.test(file.originalname);
    cb(null, ok);
  }
});

function findCover(entry) {
  const names = [];
  if (entry.cover) names.push(path.basename(entry.cover));
  const base = path.basename(entry.file, path.extname(entry.file));
  ["jpg", "jpeg", "png", "webp"].forEach(e => names.push(base + "." + e));
  const hit = names.find(n => fs.existsSync(path.join(COVERS, n)));
  return hit ? "/songs/covers/" + enc(hit) : "";
}

function curated() {
  try {
    const list = JSON.parse(fs.readFileSync(CATALOG, "utf8"));
    return list
      .filter(s => s.file && fs.existsSync(path.join(SONGS, path.basename(s.file))))
      .map(s => ({
        id: "c-" + path.basename(s.file),
        title: s.title || path.basename(s.file),
        artist: s.artist || "Unknown artist",
        genre: GENRES.includes(s.genre) ? s.genre : "other",
        url: "/songs/" + enc(path.basename(s.file)),
        cover: findCover(s),
        credit: s.credit || "",
        license: s.license || "",
        link: typeof s.link === "string" && s.link.startsWith("https://") ? s.link : ""
      }));
  } catch (e) {
    return [];
  }
}

const app = express();
app.use(express.json({ limit: "100kb" }));

app.post("/api/register", limiter, (req, res) => {
  const name = String(req.body.name || "").trim();
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  if (!name || name.length > 40) return res.status(400).json({ error: "Enter a name up to 40 characters." });
  if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: "Enter a valid email address." });
  if (password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters." });
  if (db.users.some(u => u.email === email)) return res.status(409).json({ error: "That email already has an account. Sign in instead." });
  const user = { id: crypto.randomUUID(), name, email, hash: bcrypt.hashSync(password, 10), createdAt: Date.now() };
  db.users.push(user);
  save();
  res.json({ token: sign(user), user: publicUser(user) });
});

app.post("/api/login", limiter, (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const user = db.users.find(u => u.email === email);
  if (!user || !bcrypt.compareSync(String(req.body.password || ""), user.hash)) {
    return res.status(401).json({ error: "Email or password is incorrect." });
  }
  res.json({ token: sign(user), user: publicUser(user) });
});

app.get("/api/me", auth, (req, res) => res.json(req.user));

app.get("/api/songs", (req, res) => {
  const community = db.songs
    .filter(s => s.status === "approved")
    .map(s => ({
      id: "s-" + s.id,
      title: s.title,
      artist: s.artist,
      genre: s.genre,
      url: "/api/file/" + s.id,
      cover: s.cover ? "/api/cover/" + s.id : "",
      credit: "Community song by " + s.artist,
      license: "",
      link: ""
    }));
  res.json(curated().concat(community));
});

app.get("/api/file/:id", (req, res) => {
  const song = db.songs.find(s => s.id === req.params.id);
  if (!song || song.status === "removed") return res.sendStatus(404);
  const send = () => res.sendFile(path.join(UPLOADS, song.file));
  if (song.status === "approved") return send();
  auth(req, res, () => {
    if (req.user.role === "admin" || req.user.id === song.userId) return send();
    res.sendStatus(403);
  });
});

app.get("/api/cover/:id", (req, res) => {
  const song = db.songs.find(s => s.id === req.params.id);
  if (!song || !song.cover || song.status === "removed") return res.sendStatus(404);
  res.set("X-Content-Type-Options", "nosniff");
  const send = () => res.sendFile(path.join(UPLOADS, song.cover));
  if (song.status === "approved") return send();
  auth(req, res, () => {
    if (req.user.role === "admin" || req.user.id === song.userId) return send();
    res.sendStatus(403);
  });
});

app.post("/api/upload", auth, upload.fields([{ name: "audio", maxCount: 1 }, { name: "cover", maxCount: 1 }]), (req, res) => {
  const files = req.files || {};
  const audio = files.audio && files.audio[0];
  const cover = files.cover && files.cover[0];
  const cleanup = () => [audio, cover].forEach(f => f && fs.unlink(f.path, () => {}));
  const title = String(req.body.title || "").trim();
  const genre = String(req.body.genre || "");
  if (!audio) { cleanup(); return res.status(400).json({ error: "Choose an mp3, wav, ogg, flac or m4a file." }); }
  if (cover && (cover.size > 3 * 1024 * 1024 || !isImage(cover.path))) { cleanup(); return res.status(400).json({ error: "Cover art must be a real jpg, png or webp image up to 3 MB." }); }
  if (!title || title.length > 80) { cleanup(); return res.status(400).json({ error: "Enter a title up to 80 characters." }); }
  if (!GENRES.includes(genre)) { cleanup(); return res.status(400).json({ error: "Choose a genre." }); }
  if (req.body.confirm !== "yes") { cleanup(); return res.status(400).json({ error: "Confirm that you made the song and it is clean." }); }
  const waiting = db.songs.filter(s => s.userId === req.user.id && s.status === "pending").length;
  if (waiting >= 5) { cleanup(); return res.status(429).json({ error: "You have 5 songs waiting for review. Wait for those first." }); }
  const song = {
    id: crypto.randomUUID(),
    title,
    artist: req.user.name,
    genre,
    file: audio.filename,
    cover: cover ? cover.filename : "",
    userId: req.user.id,
    status: "pending",
    reason: "",
    createdAt: Date.now()
  };
  db.songs.push(song);
  save();
  res.json({ id: song.id, status: song.status });
});

app.get("/api/mine", auth, (req, res) => {
  res.json(
    db.songs
      .filter(s => s.userId === req.user.id && s.status !== "removed")
      .map(s => ({ id: s.id, title: s.title, genre: s.genre, status: s.status, reason: s.reason, cover: s.cover ? "/api/cover/" + s.id : "" }))
      .reverse()
  );
});

app.get("/api/admin/pending", auth, adminOnly, (req, res) => {
  res.json(
    db.songs
      .filter(s => s.status === "pending")
      .map(s => ({ id: s.id, title: s.title, artist: s.artist, genre: s.genre, url: "/api/file/" + s.id, cover: s.cover ? "/api/cover/" + s.id : "" }))
  );
});

function review(status) {
  return (req, res) => {
    const song = db.songs.find(s => s.id === req.params.id);
    if (!song) return res.sendStatus(404);
    song.status = status;
    song.reason = status === "rejected" ? String((req.body && req.body.reason) || "").slice(0, 120) : "";
    save();
    res.json({ ok: true });
  };
}
app.post("/api/admin/songs/:id/approve", auth, adminOnly, review("approved"));
app.post("/api/admin/songs/:id/reject", auth, adminOnly, review("rejected"));

app.delete("/api/admin/songs/:id", auth, adminOnly, (req, res) => {
  const song = db.songs.find(s => s.id === req.params.id);
  if (!song) return res.sendStatus(404);
  song.status = "removed";
  fs.unlink(path.join(UPLOADS, song.file), () => {});
  if (song.cover) fs.unlink(path.join(UPLOADS, song.cover), () => {});
  save();
  res.json({ ok: true });
});

app.use("/songs", express.static(SONGS));
app.use(express.static(path.join(ROOT, "public")));

app.use((err, req, res, next) => {
  const msg = err.code === "LIMIT_FILE_SIZE" ? "The file is larger than 30 MB." : "Upload failed.";
  res.status(400).json({ error: msg });
});

const PORT = process.env.PORT === undefined ? 3000 : Number(process.env.PORT);
const HOST = process.env.HOST || "0.0.0.0";
const server = app.listen(PORT, HOST, () => console.log("RelaxNote running at http://localhost:" + server.address().port));

module.exports = { app, server };
