import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.join(process.cwd(), 'bot_database.sqlite');
const db = new Database(dbPath);

console.log('Clearing vpn_config for all users...');
db.prepare('UPDATE users SET vpn_config = NULL').run();
console.log('Done!');
