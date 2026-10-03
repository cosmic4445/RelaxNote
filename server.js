const express = require("express");
const multer = require("multer");
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
const SECRET = process.env.FILE_SECRET || fs.readFileSync(SECRET_FILE, "utf8");
const ADMIN_EMAIL = "cuberalted@gmail.com";
const GENRES = ["lofi", "electronic", "rock", "metal", "kpop", "other"];
const JWKS_URL = process.env.FIREBASE_JWKS_URL || "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";

function loadFirebaseConfig() {
  for (const dir of [HOME, ROOT]) {
    const file = path.join(dir, "firebase-config.json");
    if (!fs.existsSync(file)) continue;
    try {
      const c = JSON.parse(fs.readFileSync(file, "utf8"));
      if (c.apiKey && c.authDomain && c.projectId && c.appId) {
        return { apiKey: c.apiKey, authDomain: c.authDomain, projectId: c.projectId, appId: c.appId };
      }
    } catch (e) {}
  }
  return null;
}
const FIREBASE = loadFirebaseConfig();
if (!FIREBASE) console.log("Sign-in is not set up: add firebase-config.json (see README.md).");

let db = fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE, "utf8")) : { users: [], songs: [] };
function save() {
  fs.writeFileSync(DB_FILE + ".tmp", JSON.stringify(db, null, 2));
  fs.renameSync(DB_FILE + ".tmp", DB_FILE);
}

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

let jwks = null;
async function verifyIdToken(token) {
  const jose = await import("jose");
  if (!jwks) jwks = jose.createRemoteJWKSet(new URL(JWKS_URL));
  const { payload } = await jose.jwtVerify(token, jwks, {
    issuer: "https://securetoken.google.com/" + FIREBASE.projectId,
    audience: FIREBASE.projectId,
    algorithms: ["RS256"]
  });
  if (!payload.sub || String(payload.sub).length > 128) throw new Error("bad subject");
  return payload;
}

async function auth(req, res, next) {
  if (!FIREBASE) return res.status(503).json({ error: "Sign-in is not set up on this server yet." });
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  try {
    const claims = await verifyIdToken(token);
    const email = String(claims.email || "").toLowerCase();
    if (!email) throw new Error("no email");
    const claimName = String(claims.name || "").trim().slice(0, 40);
    let user = db.users.find(u => u.id === claims.sub);
    if (!user) {
      user = { id: claims.sub, name: claimName || email.split("@")[0], email, createdAt: Date.now() };
      db.users.push(user);
      save();
    } else if (user.email !== email || (claimName && user.name !== claimName)) {
      user.email = email;
      if (claimName) user.name = claimName;
      save();
    }
    const verified = claims.email_verified === true;
    req.user = {
      id: user.id,
      name: user.name,
      email,
      verified,
      role: verified && email === ADMIN_EMAIL ? "admin" : "user"
    };
    next();
  } catch (e) {
    res.status(401).json({ error: "Sign in required." });
  }
}
function adminOnly(req, res, next) {
  if (req.user.role !== "admin") return res.status(403).json({ error: "Admins only." });
  next();
}
function needVerified(req, res, next) {
  if (!req.user.verified) return res.status(403).json({ error: "Verify your email address before submitting songs." });
  next();
}

function fileToken(id) {
  const body = id + "." + (Date.now() + 12 * 3600 * 1000);
  const sig = crypto.createHmac("sha256", SECRET).update(body).digest("base64url");
  return Buffer.from(body).toString("base64url") + "." + sig;
}
function checkFileToken(token, id) {
  try {
    const [b, sig] = String(token).split(".");
    const body = Buffer.from(b, "base64url").toString();
    const want = crypto.createHmac("sha256", SECRET).update(body).digest("base64url");
    const a = Buffer.from(String(sig));
    const w = Buffer.from(want);
    if (a.length !== w.length || !crypto.timingSafeEqual(a, w)) return false;
    const [tokenId, exp] = body.split(".");
    return tokenId === id && Number(exp) > Date.now();
  } catch (e) {
    return false;
  }
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

app.get("/api/config", (req, res) => {
  res.json(FIREBASE ? { configured: true, firebase: FIREBASE } : { configured: false });
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
  if (song.status === "approved" || checkFileToken(req.query.ft, song.id)) {
    return res.sendFile(path.join(UPLOADS, song.file));
  }
  res.sendStatus(403);
});

app.get("/api/cover/:id", (req, res) => {
  const song = db.songs.find(s => s.id === req.params.id);
  if (!song || !song.cover || song.status === "removed") return res.sendStatus(404);
  res.set("X-Content-Type-Options", "nosniff");
  if (song.status === "approved" || checkFileToken(req.query.ft, song.id)) {
    return res.sendFile(path.join(UPLOADS, song.cover));
  }
  res.sendStatus(403);
});

app.post("/api/upload", auth, needVerified, upload.fields([{ name: "audio", maxCount: 1 }, { name: "cover", maxCount: 1 }]), (req, res) => {
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
      .map(s => ({ id: s.id, title: s.title, genre: s.genre, status: s.status, reason: s.reason }))
      .reverse()
  );
});

app.get("/api/admin/pending", auth, adminOnly, (req, res) => {
  res.json(
    db.songs
      .filter(s => s.status === "pending")
      .map(s => ({
        id: s.id,
        title: s.title,
        artist: s.artist,
        genre: s.genre,
        url: "/api/file/" + s.id + "?ft=" + fileToken(s.id),
        cover: s.cover ? "/api/cover/" + s.id + "?ft=" + fileToken(s.id) : ""
      }))
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
