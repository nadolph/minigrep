const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'steaks.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('contestant', 'taster')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS steaks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL DEFAULT 'My Steak',
    description TEXT DEFAULT '',
    image_filename TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS votes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    taster_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    steak_id INTEGER NOT NULL REFERENCES steaks(id) ON DELETE CASCADE,
    taste_score INTEGER NOT NULL CHECK(taste_score BETWEEN 1 AND 10),
    texture_score INTEGER NOT NULL CHECK(texture_score BETWEEN 1 AND 10),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(taster_id, steak_id)
  );
`);

module.exports = db;
