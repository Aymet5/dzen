import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.join(process.cwd(), 'bot_database.sqlite');
const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    username TEXT,
    first_name TEXT,
    trial_started_at DATETIME,
    subscription_expires_at DATETIME,
    vpn_client_email TEXT,
    vpn_config TEXT,
    last_sub_months INTEGER,
    last_message_id INTEGER,
    expiry_notified INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Migrations
try {
  db.exec('ALTER TABLE users ADD COLUMN vpn_client_email TEXT;');
} catch (e) {}
try {
  db.exec('ALTER TABLE users ADD COLUMN vpn_config TEXT;');
} catch (e) {}
try {
  db.exec('ALTER TABLE users ADD COLUMN last_message_id INTEGER;');
} catch (e) {}
try {
  db.exec('ALTER TABLE users ADD COLUMN expiry_notified INTEGER DEFAULT 0;');
} catch (e) {}
try {
  db.exec('ALTER TABLE users ADD COLUMN last_sub_months INTEGER;');
} catch (e) {}

export interface User {
  id: number;
  username: string | null;
  first_name: string | null;
  trial_started_at: string | null;
  subscription_expires_at: string | null;
  vpn_client_email: string | null;
  vpn_config: string | null;
  last_sub_months: number | null;
  last_message_id: number | null;
  expiry_notified: number;
  created_at: string;
}

export const getUser = (id: number): User | undefined => {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id) as User | undefined;
};

export const createUser = (id: number, username: string | null, first_name: string | null) => {
  db.prepare('INSERT OR IGNORE INTO users (id, username, first_name, trial_started_at) VALUES (?, ?, ?, NULL)').run(id, username, first_name);
};

export const updateSubscription = (id: number, expiresAt: string, months: number) => {
  db.prepare('UPDATE users SET subscription_expires_at = ?, last_sub_months = ?, expiry_notified = 0 WHERE id = ?').run(expiresAt, months, id);
};

export const updateVpnConfig = (id: number, email: string, config: string) => {
  db.prepare('UPDATE users SET vpn_client_email = ?, vpn_config = ? WHERE id = ?').run(email, config, id);
};

export const startTrial = (id: number) => {
  const now = new Date().toISOString();
  db.prepare('UPDATE users SET trial_started_at = ?, expiry_notified = 0 WHERE id = ?').run(now, id);
};

export const setExpiryNotified = (id: number, notified: boolean) => {
  db.prepare('UPDATE users SET expiry_notified = ? WHERE id = ?').run(notified ? 1 : 0, id);
};

export const getExpiredUsers = (): User[] => {
  return db.prepare(`
    SELECT * FROM users 
    WHERE expiry_notified = 0 
    AND (
      (subscription_expires_at IS NOT NULL AND datetime(subscription_expires_at) < datetime('now'))
      OR 
      (trial_started_at IS NOT NULL AND subscription_expires_at IS NULL AND datetime(trial_started_at, '+7 days') < datetime('now'))
    )
  `).all() as User[];
};

export const getStats = () => {
  const total = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
  const active_subs = db.prepare("SELECT COUNT(*) as count FROM users WHERE subscription_expires_at IS NOT NULL AND datetime(subscription_expires_at) > datetime('now')").get() as { count: number };
  const active_trials = db.prepare("SELECT COUNT(*) as count FROM users WHERE trial_started_at IS NOT NULL AND subscription_expires_at IS NULL AND datetime(trial_started_at, '+7 days') > datetime('now')").get() as { count: number };
  const expired = db.prepare(`
    SELECT COUNT(*) as count FROM users 
    WHERE 
      (subscription_expires_at IS NOT NULL AND datetime(subscription_expires_at) < datetime('now'))
      OR 
      (trial_started_at IS NOT NULL AND subscription_expires_at IS NULL AND datetime(trial_started_at, '+7 days') < datetime('now'))
  `).get() as { count: number };

  // Note: We don't have a payments table, so we simulate payment stats based on active subs for now
  // In a real app, you'd have a separate table for transactions
  return {
    total: total.count,
    active_subs: active_subs.count,
    active_trials: active_trials.count,
    expired: expired.count,
    payments_today: 0, // Placeholder
    payments_month: 0  // Placeholder
  };
};

export const updateLastMessageId = (id: number, messageId: number | null) => {
  db.prepare('UPDATE users SET last_message_id = ? WHERE id = ?').run(messageId, id);
};

export const getAllUsers = (): User[] => {
  return db.prepare('SELECT * FROM users ORDER BY created_at DESC').all() as User[];
};

export default db;
