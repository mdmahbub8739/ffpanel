PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  phone TEXT,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  balance INTEGER NOT NULL DEFAULT 0,
  total_spent INTEGER NOT NULL DEFAULT 0,
  referral_code TEXT UNIQUE NOT NULL,
  referred_by INTEGER REFERENCES users(id),
  role TEXT NOT NULL DEFAULT 'user',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_ref ON users(referral_code);

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  image_url TEXT,
  badge TEXT,
  type TEXT NOT NULL DEFAULT 'Game / Voucher',
  description TEXT,
  demo_url TEXT,
  rules TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_products_cat ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_active ON products(active);

CREATE TABLE IF NOT EXISTS packages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price INTEGER NOT NULL,
  duration TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_packages_product ON packages(product_id);

CREATE TABLE IF NOT EXISTS stock_keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  package_id INTEGER NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  order_id INTEGER REFERENCES orders(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_stock_pkg ON stock_keys(package_id, used);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  serial TEXT UNIQUE NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
  package_id INTEGER REFERENCES packages(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  package_name TEXT NOT NULL,
  qty INTEGER NOT NULL DEFAULT 1,
  amount INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  payment_method TEXT,
  txn_id TEXT,
  delivered_code TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);

CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  amount INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  txn_id TEXT,
  mfs_type TEXT,
  sender TEXT,
  ref_order INTEGER REFERENCES orders(id),
  meta TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_txn_unique ON transactions(txn_id) WHERE txn_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_txn_user ON transactions(user_id);

CREATE TABLE IF NOT EXISTS checkout_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  merchant_order_id TEXT UNIQUE NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL,
  ref_id INTEGER,
  amount INTEGER NOT NULL,
  vt_session_id TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS promos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  kind TEXT NOT NULL DEFAULT 'percent',
  value INTEGER NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  usage_limit INTEGER NOT NULL DEFAULT 0,
  used INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT
);

CREATE TABLE IF NOT EXISTS bonus_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS rate_limits (
  bucket TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0,
  window_start INTEGER NOT NULL
);

INSERT OR IGNORE INTO settings (key, value) VALUES
  ('site_name', 'PANELSELL'),
  ('admin_panel_name', 'FF panel sale official'),
  ('primary_color', '#0a9d2b'),
  ('accent_color', '#10141f'),
  ('logo_text', 'PANELSELL'),
  ('hero_tagline', 'কিভাবে প্যানেল কিনবেন'),
  ('bkash_number', ''),
  ('nagad_number', ''),
  ('referral_bonus_percent', '5'),
  ('support_link', ''),
  ('footer_text', '© Copyright 2026 Panel Sell. All Rights Reserved.');

INSERT OR IGNORE INTO categories (name, slug, sort_order) VALUES
  ('All', 'all', 0),
  ('NON ROOT', 'non-root', 1),
  ('ROOT', 'root', 2);
