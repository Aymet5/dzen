import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.join(process.cwd(), 'bot_database.sqlite');
const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    username TEXT,
    first_name TEXT,
    trial_started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    subscription_expires_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

export interface User {
  id: number;
  username: string | null;
  first_name: string | null;
  trial_started_at: string;
  subscription_expires_at: string | null;
  created_at: string;
}

export const getUser = (id: number): User | undefined => {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id) as User | undefined;
};

export const createUser = (id: number, username: string | null, first_name: string | null) => {
  db.prepare('INSERT OR IGNORE INTO users (id, username, first_name) VALUES (?, ?, ?)').run(id, username, first_name);
};

export const updateSubscription = (id: number, expiresAt: string) => {
  db.prepare('UPDATE users SET subscription_expires_at = ? WHERE id = ?').run(expiresAt, id);
};

export const getAllUsers = (): User[] => {
  return db.prepare('SELECT * FROM users ORDER BY created_at DESC').all() as User[];
};

export default db;
