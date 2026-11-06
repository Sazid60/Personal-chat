const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'chat.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  // Users table
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      phone TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      avatar TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Conversations table
  db.run(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      user1_id INTEGER NOT NULL,
      user2_id INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (user1_id) REFERENCES users(id),
      FOREIGN KEY (user2_id) REFERENCES users(id)
    )
  `);

  // Text-Only Messages table (no files/media stored to keep storage featherweight)
  db.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      sender_id INTEGER NOT NULL,
      recipient_id INTEGER NOT NULL,
      text TEXT NOT NULL,
      is_unsent INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id),
      FOREIGN KEY (sender_id) REFERENCES users(id)
    )
  `);

  // Web Push Subscriptions for background notifications when app is closed
  db.run(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      endpoint TEXT UNIQUE NOT NULL,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  db.run(`CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, created_at)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_users_search ON users(email, phone)`);
});

// Helper database promise wrappers
const dbAsync = {
  get: (sql, params = []) =>
    new Promise((resolve, reject) => {
      db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
    }),
  all: (sql, params = []) =>
    new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
    }),
  run: (sql, params = []) =>
    new Promise((resolve, reject) => {
      db.run(sql, params, function (err) {
        if (err) return reject(err);
        resolve({ lastID: this.lastID, changes: this.changes });
      });
    })
};

module.exports = { db, dbAsync };

