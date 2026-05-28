import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, "..", "..", "data");
const DB_PATH = path.join(DATA_DIR, "database.sqlite");

fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS summaries (
    id TEXT PRIMARY KEY,
    original_text TEXT NOT NULL,
    summary_text TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`;
db.prepare(CREATE_TABLE_SQL).run();

const selectStmt = db.prepare(
  "SELECT id, original_text, summary_text, created_at FROM summaries WHERE id = ?"
);
const insertStmt = db.prepare(
  "INSERT OR REPLACE INTO summaries (id, original_text, summary_text) VALUES (?, ?, ?)"
);

export function getSummaryById(id) {
  return selectStmt.get(id);
}

export function saveSummary(id, originalText, summaryText) {
  insertStmt.run(id, originalText, summaryText);
}

export default db;
