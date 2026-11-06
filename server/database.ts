import sqlite3 from 'sqlite3';
import path from 'path';
import { createClient, Client } from '@libsql/client';

try {
  if (typeof process.loadEnvFile === 'function') {
    process.loadEnvFile();
  }
} catch (_) {}

const tursoUrl = process.env.TURSO_DATABASE_URL;
const tursoToken = process.env.TURSO_AUTH_TOKEN;

const isTurso = Boolean(tursoUrl && tursoToken);

let tursoClient: Client | null = null;
let sqliteDb: sqlite3.Database | null = null;

if (isTurso) {
  console.log(`[DATABASE] Connecting to Turso Cloud libSQL: ${tursoUrl}`);
  tursoClient = createClient({
    url: tursoUrl!,
    authToken: tursoToken!
  });
} else {
  console.log('[DATABASE] Using local SQLite file (chat.db)');
  const sqlite = sqlite3.verbose();
  const dbPath = path.join(__dirname, '..', 'chat.db');
  sqliteDb = new sqlite.Database(dbPath);
}

export const db = sqliteDb;

// Initialize tables
async function initTables() {
  const schemaStatements = [
    `CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      phone TEXT,
      password TEXT NOT NULL,
      avatar TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone ON users(phone) WHERE phone IS NOT NULL AND phone != ''`,
    `CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      user1_id INTEGER NOT NULL,
      user2_id INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (user1_id) REFERENCES users(id),
      FOREIGN KEY (user2_id) REFERENCES users(id)
    )`,
    `CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      sender_id INTEGER NOT NULL,
      recipient_id INTEGER NOT NULL,
      text TEXT NOT NULL,
      is_unsent INTEGER DEFAULT 0,
      is_read INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id),
      FOREIGN KEY (sender_id) REFERENCES users(id)
    )`,
    `CREATE TABLE IF NOT EXISTS push_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      endpoint TEXT UNIQUE NOT NULL,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_users_search ON users(email, phone)`
  ];

  if (isTurso && tursoClient) {
    for (const sql of schemaStatements) {
      try {
        await tursoClient.execute(sql);
      } catch (e) {
        console.warn('[DATABASE] Schema init statement warning:', e);
      }
    }
    console.log('[DATABASE] Turso Cloud schema verified ✓');
  } else if (sqliteDb) {
    sqliteDb.serialize(() => {
      sqliteDb.run('PRAGMA journal_mode = WAL');
      sqliteDb.run('PRAGMA auto_vacuum = INCREMENTAL');
      for (const sql of schemaStatements) {
        sqliteDb.run(sql);
      }
      sqliteDb.run('ALTER TABLE messages ADD COLUMN is_read INTEGER DEFAULT 0', () => {});
    });
    console.log('[DATABASE] Local SQLite schema verified ✓');
  }
}

initTables().catch(err => {
  console.error('[DATABASE] Schema initialization error:', err);
});

export const dbAsync = {
  get: async <T = any>(sql: string, params: any[] = []): Promise<T | undefined> => {
    if (isTurso && tursoClient) {
      const res = await tursoClient.execute({ sql, args: params });
      return (res.rows[0] as unknown as T) || undefined;
    }
    return new Promise((resolve, reject) => {
      sqliteDb!.get(sql, params, (err, row) => (err ? reject(err) : resolve(row as T)));
    });
  },
  all: async <T = any>(sql: string, params: any[] = []): Promise<T[]> => {
    if (isTurso && tursoClient) {
      const res = await tursoClient.execute({ sql, args: params });
      return res.rows as unknown as T[];
    }
    return new Promise((resolve, reject) => {
      sqliteDb!.all(sql, params, (err, rows) => (err ? reject(err) : resolve((rows || []) as T[])));
    });
  },
  run: async (sql: string, params: any[] = []): Promise<{ lastID: number; changes: number }> => {
    if (isTurso && tursoClient) {
      const res = await tursoClient.execute({ sql, args: params });
      return { lastID: Number(res.lastInsertRowid ?? 0), changes: res.rowsAffected };
    }
    return new Promise((resolve, reject) => {
      sqliteDb!.run(sql, params, function (this: sqlite3.RunResult, err: Error | null) {
        if (err) return reject(err);
        resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
  }
};
