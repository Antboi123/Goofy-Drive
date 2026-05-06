const express = require('express');
const path = require('path');
const fs = require('fs');
const helmet = require('helmet');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

const db = new Database(path.join(__dirname, 'data', 'goofy-drive.db'));

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  plan TEXT NOT NULL DEFAULT 'free',
  unrestricted INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS folders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  folder_id INTEGER,
  original_name TEXT NOT NULL,
  stored_name TEXT NOT NULL,
  mime_type TEXT,
  size_bytes INTEGER NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'private',
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (folder_id) REFERENCES folders(id)
);
`);

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  store: new SQLiteStore({ db: 'sessions.sqlite', dir: './data' }),
  secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: false }
}));

app.use(express.static(path.join(__dirname, 'public')));

const FREE_ALLOWED_EXTENSIONS = new Set(['.png','.jpg','.jpeg','.gif','.webp','.svg','.pdf','.doc','.docx','.txt','.md','.html','.css','.js','.json','.blend','.zip']);

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, path.join(__dirname, 'uploads')),
  filename: (_, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname).toLowerCase()}`)
});

const upload = multer({ storage, limits: { fileSize: 1024 * 1024 * 1024 } }); // hard 1GB request cap, relaxed in logic for paid chunks

function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Not authenticated' });
  next();
}

function planLimitBytes(user) {
  if (user.unrestricted) return Number.MAX_SAFE_INTEGER;
  return user.plan === 'pro' ? 3 * 1024 * 1024 * 1024 : 1 * 1024 * 1024 * 1024;
}

function isFileAllowed(user, filename) {
  if (user.plan === 'pro' || user.unrestricted) return true;
  return FREE_ALLOWED_EXTENSIONS.has(path.extname(filename).toLowerCase());
}

function basicVirusHeuristic(filePath) {
  const blocked = ['.exe', '.bat', '.cmd', '.scr', '.ps1', '.vbs', '.jar'];
  const ext = path.extname(filePath).toLowerCase();
  return blocked.includes(ext);
}

app.post('/api/register', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password || password.length < 8) return res.status(400).json({ error: 'Invalid credentials' });
  try {
    const hash = bcrypt.hashSync(password, 10);
    db.prepare('INSERT INTO users (email, password_hash, created_at) VALUES (?, ?, ?)').run(email, hash, new Date().toISOString());
    res.json({ ok: true });
  } catch {
    res.status(400).json({ error: 'Email already exists' });
  }
});

app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) return res.status(401).json({ error: 'Invalid login' });
  req.session.user = { id: user.id, email: user.email, plan: user.plan, unrestricted: !!user.unrestricted };
  res.json({ ok: true, user: req.session.user });
});

app.post('/api/logout', requireAuth, (req, res) => req.session.destroy(() => res.json({ ok: true })));
app.get('/api/me', (req, res) => res.json({ user: req.session.user || null }));

app.post('/api/folders', requireAuth, (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Folder name required' });
  const info = db.prepare('INSERT INTO folders (user_id, name, created_at) VALUES (?, ?, ?)').run(req.session.user.id, name, new Date().toISOString());
  res.json({ id: info.lastInsertRowid, name });
});

app.get('/api/files', requireAuth, (req, res) => {
  const mine = db.prepare('SELECT f.*, u.email as owner_email FROM files f JOIN users u ON f.user_id=u.id WHERE f.user_id = ? ORDER BY f.created_at DESC').all(req.session.user.id);
  const publicFiles = db.prepare('SELECT f.*, u.email as owner_email FROM files f JOIN users u ON f.user_id=u.id WHERE f.visibility = ? ORDER BY f.created_at DESC LIMIT 100').all('public');
  const folders = db.prepare('SELECT * FROM folders WHERE user_id = ? ORDER BY created_at DESC').all(req.session.user.id);
  res.json({ mine, publicFiles, folders });
});

app.post('/api/upload', requireAuth, upload.single('document'), (req, res) => {
  const user = db.prepare('SELECT id, plan, unrestricted FROM users WHERE id = ?').get(req.session.user.id);
  if (!req.file) return res.status(400).json({ error: 'No file' });

  if (!isFileAllowed(user, req.file.originalname)) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: 'Free plan file type restriction. Upgrade for any file type.' });
  }

  if (req.file.size > planLimitBytes(user)) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: 'File exceeds your plan transfer limit.' });
  }

  if (basicVirusHeuristic(req.file.path)) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: 'Upload blocked by malware policy.' });
  }

  const visibility = req.body.visibility === 'public' ? 'public' : 'private';
  const folderId = req.body.folderId ? Number(req.body.folderId) : null;
  const info = db.prepare('INSERT INTO files (user_id, folder_id, original_name, stored_name, mime_type, size_bytes, visibility, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(user.id, folderId, req.file.originalname, req.file.filename, req.file.mimetype, req.file.size, visibility, new Date().toISOString());
  res.json({ ok: true, id: info.lastInsertRowid });
});

app.get('/api/download/:id', requireAuth, (req, res) => {
  const file = db.prepare('SELECT * FROM files WHERE id = ?').get(req.params.id);
  if (!file) return res.status(404).send('Not found');
  if (file.visibility !== 'public' && file.user_id !== req.session.user.id) return res.status(403).send('Forbidden');
  res.download(path.join(__dirname, 'uploads', file.stored_name), file.original_name);
});

app.post('/api/subscription/checkout', requireAuth, (req, res) => {
  res.json({
    message: 'Payment backend placeholder: connect Stripe/PayPal here and confirm webhook to activate plan.',
    nextStep: '/api/subscription/activate-pro'
  });
});

app.post('/api/subscription/activate-pro', requireAuth, (req, res) => {
  db.prepare('UPDATE users SET plan = ? WHERE id = ?').run('pro', req.session.user.id);
  req.session.user.plan = 'pro';
  res.json({ ok: true, plan: 'pro' });
});

app.post('/api/admin/unrestricted/:userId', requireAuth, (req, res) => {
  const self = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.user.id);
  if (!self || !self.unrestricted) return res.status(403).json({ error: 'Only unrestricted admins can grant unrestricted' });
  db.prepare('UPDATE users SET unrestricted = 1 WHERE id = ?').run(Number(req.params.userId));
  res.json({ ok: true });
});

app.get('*', (_, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => console.log(`Goofy Drive on http://localhost:${PORT}`));
