
const { db } = require("./db");

db.exec(`
  CREATE TABLE IF NOT EXISTS delivery_jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    purchase_id INTEGER NOT NULL UNIQUE,
    discord_id TEXT NOT NULL,
    gamer_tag TEXT,
    item_class TEXT NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 10),
    x REAL NOT NULL,
    y REAL NOT NULL,
    z REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
      CHECK (status IN ('pending', 'queued', 'delivered', 'failed')),
    error TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (purchase_id) REFERENCES purchases(id)
  );
`);

const createJob = db.prepare(`
  INSERT INTO delivery_jobs (
    purchase_id, discord_id, gamer_tag,
    item_class, quantity, x, y, z
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

const getJob = db.prepare(`
  SELECT * FROM delivery_jobs WHERE purchase_id = ?
`);

function queueDelivery(order, player, item, coordinates) {
  if (!Number.isSafeInteger(order.id) || order.id < 1) {
    throw new Error("Invalid purchase ID.");
  }

  if (!item || typeof item.itemType !== "string" ||
      !/^[A-Za-z0-9_]+$/.test(item.itemType)) {
    throw new Error("Invalid DayZ item class.");
  }

  if (!Array.isArray(coordinates) || coordinates.length !== 3 ||
      !coordinates.every(Number.isFinite)) {
    throw new Error("Invalid delivery coordinates.");
  }

  const existing = getJob.get(order.id);
  if (existing) return existing;

  createJob.run(
    order.id,
    player.discord_id,
    player.gamer_tag || null,
    item.itemType,
    order.quantity,
    coordinates[0],
    coordinates[1],
    coordinates[2]
  );

  return getJob.get(order.id);
}

module.exports = { queueDelivery, getJob };
