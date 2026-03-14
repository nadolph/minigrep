const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// Ensure uploads dir exists
const uploadsDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// Multer
const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `steak-${req.session.userId}-${Date.now()}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Images only'));
  }
});

// App setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(session({
  store: new SQLiteStore({ db: 'sessions.db', dir: __dirname }),
  secret: process.env.SESSION_SECRET || 'steak38-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 }
}));

// Locals
app.use((req, res, next) => {
  res.locals.user = req.session.username || null;
  res.locals.role = req.session.role || null;
  res.locals.userId = req.session.userId || null;
  next();
});

// Auth guards
const requireAuth = (req, res, next) => {
  if (!req.session.userId) return res.redirect('/login');
  next();
};
const requireRole = (role) => (req, res, next) => {
  if (!req.session.userId) return res.redirect('/login');
  if (req.session.role !== role) return res.redirect('/dashboard');
  next();
};

// ── HOME ──────────────────────────────────────────────
app.get('/', (req, res) => res.render('home'));

// ── AUTH ──────────────────────────────────────────────
app.get('/login', (req, res) => {
  if (req.session.userId) return res.redirect('/dashboard');
  res.render('login', { error: null });
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.render('login', { error: 'Invalid username or password' });
  }
  req.session.userId = user.id;
  req.session.username = user.username;
  req.session.role = user.role;
  res.redirect('/dashboard');
});

app.get('/register', (req, res) => {
  if (req.session.userId) return res.redirect('/dashboard');
  res.render('register', { error: null });
});

app.post('/register', (req, res) => {
  const { username, email, password, role } = req.body;
  if (!['contestant', 'taster'].includes(role))
    return res.render('register', { error: 'Please select a role' });
  if (!username || !email || !password || password.length < 6)
    return res.render('register', { error: 'All fields required; password minimum 6 characters' });

  try {
    const hash = bcrypt.hashSync(password, 10);
    const result = db.prepare(
      'INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)'
    ).run(username.trim(), email.trim(), hash, role);

    if (role === 'contestant') {
      db.prepare('INSERT INTO steaks (user_id) VALUES (?)').run(result.lastInsertRowid);
    }
    req.session.userId = result.lastInsertRowid;
    req.session.username = username.trim();
    req.session.role = role;
    res.redirect('/dashboard');
  } catch (e) {
    const msg = e.message.includes('UNIQUE') ? 'Username or email already taken' : 'Registration failed';
    res.render('register', { error: msg });
  }
});

app.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

// ── DASHBOARD ─────────────────────────────────────────
app.get('/dashboard', requireAuth, (req, res) => {
  const flash = { error: req.query.error || null, success: req.query.success || null };

  if (req.session.role === 'contestant') {
    const steak = db.prepare('SELECT * FROM steaks WHERE user_id = ?').get(req.session.userId);
    const stats = db.prepare(`
      SELECT COUNT(*) as count,
             ROUND(AVG(taste_score), 1) as avg_taste,
             ROUND(AVG(texture_score), 1) as avg_texture,
             ROUND((AVG(taste_score) + AVG(texture_score)) / 2.0, 1) as avg_total
      FROM votes WHERE steak_id = ?
    `).get(steak?.id);
    return res.render('dashboard', { steak, stats, ...flash });
  }

  // Taster: all steaks with their existing vote
  const steaks = db.prepare(`
    SELECT s.*, u.username as contestant,
           v.taste_score as my_taste, v.texture_score as my_texture
    FROM steaks s
    JOIN users u ON u.id = s.user_id
    LEFT JOIN votes v ON v.steak_id = s.id AND v.taster_id = ?
    ORDER BY s.name
  `).all(req.session.userId);
  res.render('dashboard', { steaks, ...flash });
});

// ── STEAK MANAGEMENT ──────────────────────────────────
app.post('/my-steak', requireRole('contestant'), upload.single('image'), (req, res) => {
  const { name, description } = req.body;
  const steak = db.prepare('SELECT * FROM steaks WHERE user_id = ?').get(req.session.userId);

  let imageFilename = steak?.image_filename;
  if (req.file) {
    if (imageFilename) {
      const old = path.join(uploadsDir, imageFilename);
      if (fs.existsSync(old)) fs.unlinkSync(old);
    }
    imageFilename = req.file.filename;
  }

  db.prepare(`
    UPDATE steaks SET name = ?, description = ?, image_filename = ?, updated_at = CURRENT_TIMESTAMP
    WHERE user_id = ?
  `).run((name || '').trim() || 'My Steak', (description || '').trim(), imageFilename, req.session.userId);

  res.redirect('/dashboard?success=saved');
});

// ── VOTING ────────────────────────────────────────────
app.post('/vote/:steakId', requireRole('taster'), (req, res) => {
  const steakId = parseInt(req.params.steakId);
  const taste = parseInt(req.body.taste_score);
  const texture = parseInt(req.body.texture_score);

  if (![taste, texture].every(n => n >= 1 && n <= 10)) {
    return res.redirect('/dashboard?error=Scores+must+be+between+1+and+10');
  }

  db.prepare(`
    INSERT INTO votes (taster_id, steak_id, taste_score, texture_score)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(taster_id, steak_id) DO UPDATE SET
      taste_score = excluded.taste_score,
      texture_score = excluded.texture_score
  `).run(req.session.userId, steakId, taste, texture);

  res.redirect('/dashboard?success=Vote+submitted!');
});

// ── PUBLIC PAGES ──────────────────────────────────────
app.get('/steaks', (req, res) => {
  const steaks = db.prepare(`
    SELECT s.*, u.username as contestant, COUNT(v.id) as vote_count
    FROM steaks s
    JOIN users u ON u.id = s.user_id
    LEFT JOIN votes v ON v.steak_id = s.id
    GROUP BY s.id
    ORDER BY s.name
  `).all();
  res.render('steaks', { steaks });
});

app.get('/results', (req, res) => {
  const results = db.prepare(`
    SELECT s.*, u.username as contestant,
           COUNT(v.id) as vote_count,
           ROUND(AVG(v.taste_score), 1) as avg_taste,
           ROUND(AVG(v.texture_score), 1) as avg_texture,
           ROUND((AVG(v.taste_score) + AVG(v.texture_score)) / 2.0, 1) as avg_total
    FROM steaks s
    JOIN users u ON u.id = s.user_id
    LEFT JOIN votes v ON v.steak_id = s.id
    GROUP BY s.id
    ORDER BY avg_total DESC, vote_count DESC
  `).all();
  res.render('results', { results });
});

app.listen(PORT, () => console.log(`38steaks running → http://localhost:${PORT}`));
