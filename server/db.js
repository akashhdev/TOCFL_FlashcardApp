const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'tocfl.db');
const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    username   TEXT    NOT NULL UNIQUE,
    password   TEXT    NOT NULL,
    created_at TEXT    DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS flashcard_decks (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name       TEXT    NOT NULL,
    cards_json TEXT    NOT NULL,
    created_at TEXT    DEFAULT (datetime('now')),
    updated_at TEXT    DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS flashcard_progress (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    deck_id          INTEGER NOT NULL REFERENCES flashcard_decks(id) ON DELETE CASCADE,
    current_index    INTEGER NOT NULL DEFAULT 0,
    card_statuses    TEXT    NOT NULL,
    score            INTEGER NOT NULL DEFAULT 0,
    session_duration INTEGER NOT NULL DEFAULT 0,
    is_finished      INTEGER NOT NULL DEFAULT 0,
    is_bonus_window  INTEGER NOT NULL DEFAULT 1,
    saved_at         TEXT    DEFAULT (datetime('now')),
    UNIQUE(user_id, deck_id)
  );

  CREATE TABLE IF NOT EXISTS paragraph_saves (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name             TEXT    NOT NULL,
    paragraph_config TEXT    NOT NULL,
    paragraph_data   TEXT    NOT NULL,
    created_at       TEXT    DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS conversation_saves (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id             INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name                TEXT    NOT NULL,
    conversation_config TEXT    NOT NULL,
    conversation_data   TEXT    NOT NULL,
    created_at          TEXT    DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_decks_user      ON flashcard_decks(user_id);
  CREATE INDEX IF NOT EXISTS idx_progress_deck   ON flashcard_progress(deck_id);
  CREATE INDEX IF NOT EXISTS idx_paragraphs_user ON paragraph_saves(user_id);
  CREATE INDEX IF NOT EXISTS idx_convos_user     ON conversation_saves(user_id);
`);

module.exports = db;
