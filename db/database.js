const Database = require('better-sqlite3');
const bcrypt = require('bcrypt');
const path = require('path');

const db = new Database(path.join(__dirname, 'portal.db'));

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    first_name TEXT,
    last_name TEXT,
    date_of_birth TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS addresses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL,
    type TEXT DEFAULT 'home',
    street TEXT,
    street2 TEXT,
    city TEXT,
    state TEXT,
    postal_code TEXT,
    country TEXT,
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS phone_numbers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL,
    type TEXT DEFAULT 'mobile',
    number TEXT NOT NULL,
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS email_addresses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL,
    type TEXT DEFAULT 'personal',
    address TEXT NOT NULL,
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
  );
`);

// Add new address columns if they don't exist yet (migration)
const addrCols = db.prepare("PRAGMA table_info(addresses)").all().map(c => c.name);
if (!addrCols.includes('street2')) db.exec("ALTER TABLE addresses ADD COLUMN street2 TEXT");
if (!addrCols.includes('state'))   db.exec("ALTER TABLE addresses ADD COLUMN state TEXT");

// Add dial_code to phone_numbers if it doesn't exist yet (migration)
const phoneCols = db.prepare("PRAGMA table_info(phone_numbers)").all().map(c => c.name);
if (!phoneCols.includes('dial_code')) db.exec("ALTER TABLE phone_numbers ADD COLUMN dial_code TEXT DEFAULT '+1'");

// Seed default admin if none exists
const adminCount = db.prepare('SELECT COUNT(*) as count FROM admins').get();
if (adminCount.count === 0) {
  const hash = bcrypt.hashSync('admin123', 10);
  db.prepare('INSERT INTO admins (username, password_hash) VALUES (?, ?)').run('admin', hash);
  console.log('Default admin created: admin / admin123');
}

module.exports = db;
