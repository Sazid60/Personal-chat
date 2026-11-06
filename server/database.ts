import path from 'path';
import { createClient, Client } from '@libsql/client';

try {
  if (typeof process.loadEnvFile === 'function') {
    process.loadEnvFile();
  }
} catch (_) {}

const tursoUrl = process.env.TURSO_DATABASE_URL;
const tursoToken = process.env.TURSO_AUTH_TOKEN;

let client: Client;

if (tursoUrl && tursoToken) {
  console.log(`[DATABASE] Connecting to Turso Cloud libSQL: ${tursoUrl}`);
  client = createClient({
    url: tursoUrl,
    authToken: tursoToken
  });
} else {
  const localDbPath = path.join(__dirname, '..', 'chat.db');
  console.log(`[DATABASE] Using local SQLite file via libSQL: file:${localDbPath}`);
  client = createClient({
    url: `file:${localDbPath}`
  });
}

export const db = client;

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

  for (const sql of schemaStatements) {
    try {
      await client.execute(sql);
    } catch (e) {
      console.warn('[DATABASE] Schema init statement warning:', e);
    }
  }
  console.log('[DATABASE] Database schema verified ✓');
}

initTables().catch(err => {
  console.error('[DATABASE] Schema initialization error:', err);
});

export const dbAsync = {
  get: async <T = any>(sql: string, params: any[] = []): Promise<T | undefined> => {
    const res = await client.execute({ sql, args: params });
    return (res.rows[0] as unknown as T) || undefined;
  },
  all: async <T = any>(sql: string, params: any[] = []): Promise<T[]> => {
    const res = await client.execute({ sql, args: params });
    return res.rows as unknown as T[];
  },
  run: async (sql: string, params: any[] = []): Promise<{ lastID: number; changes: number }> => {
    const res = await client.execute({ sql, args: params });
    return { lastID: Number(res.lastInsertRowid ?? 0), changes: res.rowsAffected };
  }
};
