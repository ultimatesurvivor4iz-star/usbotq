
const Database = require("better-sqlite3");
const path = require("node:path");
const fs = require("node:fs");

const dataFolder = path.join(__dirname, "..", "data");
fs.mkdirSync(dataFolder, { recursive: true });

const db = new Database(path.join(dataFolder, "dayz.sqlite"));

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS players (
    discord_id TEXT PRIMARY KEY,
    gamer_tag TEXT,
    coins INTEGER NOT NULL DEFAULT 100,
    kills INTEGER NOT NULL DEFAULT 0,
    deaths INTEGER NOT NULL DEFAULT 0,
    last_daily TEXT
  );

  CREATE TABLE IF NOT EXISTS purchases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    discord_id TEXT NOT NULL,
    item_id TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    total_cost INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    discord_id TEXT NOT NULL,
    amount INTEGER NOT NULL,
    reason TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS processed_events (
    event_id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

// Migrate existing databases without deleting existing records.
const purchaseColumns = db.prepare(
  "PRAGMA table_info(purchases)"
).all();

if (!purchaseColumns.some(column => column.name === "server_id")) {
  db.exec(`
    ALTER TABLE purchases
    ADD COLUMN server_id TEXT NOT NULL DEFAULT 'dayz-1'
  `);
}

db.exec(`
  CREATE TABLE IF NOT EXISTS delivery_jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    purchase_id INTEGER NOT NULL UNIQUE,
    server_id TEXT NOT NULL,
    discord_id TEXT NOT NULL,
    item_id TEXT NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 10),
    status TEXT NOT NULL DEFAULT 'pending'
      CHECK (status IN (
        'pending', 'processing', 'delivered', 'failed'
      )),
    attempts INTEGER NOT NULL DEFAULT 0,
    error TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (purchase_id) REFERENCES purchases(id)
  );

  CREATE INDEX IF NOT EXISTS idx_delivery_jobs_status
  ON delivery_jobs(server_id, status);
`);

const ensurePlayer = db.prepare(`
  INSERT OR IGNORE INTO players (discord_id, coins)
  VALUES (?, ?)
`);

const getPlayer = db.prepare(`
  SELECT * FROM players WHERE discord_id = ?
`);

const addTransaction = db.prepare(`
  INSERT INTO transactions (discord_id, amount, reason)
  VALUES (?, ?, ?)
`);

const grantCoins = db.transaction((id, amount, reason) => {
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new Error("Amount must be a positive whole number.");
  }

  ensurePlayer.run(id, 100);

  db.prepare(`
    UPDATE players SET coins = coins + ?
    WHERE discord_id = ?
  `).run(amount, id);

  addTransaction.run(id, amount, reason);
});

const purchase = db.transaction(
  (id, item, quantity, serverId = "dayz-1") => {
    if (!Number.isSafeInteger(quantity) ||
        quantity < 1 || quantity > 10) {
      throw new Error("Quantity must be between 1 and 10.");
    }

    if (typeof serverId !== "string" ||
        !/^[a-z0-9-]+$/.test(serverId)) {
      throw new Error("Invalid server ID.");
    }

    if (!item || typeof item.id !== "string" ||
        !Number.isSafeInteger(item.price) || item.price <= 0) {
      throw new Error("Invalid shop item.");
    }

    const total = item.price * quantity;

    if (!Number.isSafeInteger(total)) {
      throw new Error("Invalid purchase total.");
    }

    ensurePlayer.run(id, 100);

    const player = getPlayer.get(id);

  /*  if (player.coins < total) {
      throw new Error("You do not have enough coins.");
    }*/

    db.prepare(`
      UPDATE players SET coins = coins - ?
      WHERE discord_id = ?
    `).run(total, id);

    const result = db.prepare(`
      INSERT INTO purchases
        (discord_id, item_id, quantity, total_cost, server_id)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, item.id, quantity, total, serverId);

    const purchaseId = Number(result.lastInsertRowid);

    addTransaction.run(
      id,
      -total,
      `Purchase #${purchaseId} (${serverId})`
    );

    // Create a persistent job; this does not spawn an item.
    db.prepare(`
      INSERT INTO delivery_jobs (
        purchase_id, server_id, discord_id,
        item_id, quantity, status
      )
      VALUES (?, ?, ?, ?, ?, 'pending')
    `).run(
      purchaseId,
      serverId,
      id,
      item.id,
      quantity
    );

    return {
      id: purchaseId,
      total,
      serverId,
      deliveryStatus: "pending"
    };
  }
);

module.exports = {
  db,
  ensurePlayer,
  getPlayer,
  grantCoins,
  purchase
};
