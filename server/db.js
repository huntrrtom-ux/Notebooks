const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'notebook.db');

// Ensure data directory exists
const fs = require('fs');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS rooms (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS items (
    id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL,
    type TEXT NOT NULL,
    title TEXT DEFAULT '',
    content TEXT DEFAULT '',
    x REAL DEFAULT 100,
    y REAL DEFAULT 100,
    width REAL DEFAULT 300,
    height REAL DEFAULT 200,
    group_id TEXT,
    pinned_to TEXT,
    color TEXT DEFAULT '',
    meta TEXT DEFAULT '{}',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS links (
    id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL,
    from_item_id TEXT NOT NULL,
    to_item_id TEXT NOT NULL,
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL,
    chat_item_id TEXT,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS canvas_state (
    room_id TEXT PRIMARY KEY,
    zoom REAL DEFAULT 1,
    pan_x REAL DEFAULT 0,
    pan_y REAL DEFAULT 0,
    locked INTEGER DEFAULT 0,
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
  );
`);

module.exports = db;
