import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const here = path.dirname(fileURLToPath(import.meta.url));
export const DB_DIR = path.join(here, '..', 'data', 'pgdata');
const SCHEMA = path.join(here, '..', 'db', 'schema.sql');

let db;

/** Opens the embedded Postgres cluster, creating it on first run. */
export async function getDb() {
  if (db) return db;
  fs.mkdirSync(DB_DIR, { recursive: true });
  db = await PGlite.create(DB_DIR);
  return db;
}

/** Runs schema.sql; safe to call on every boot because everything is IF-not-exists by construction. */
export async function migrate(database = db) {
  const sql = fs.readFileSync(SCHEMA, 'utf8');
  await database.exec(sql);
}

export async function isSeeded(database = db) {
  const { rows } = await database.query('select count(*)::int as n from app_user');
  return rows[0].n > 0;
}

export async function resetDatabase() {
  if (db) { await db.close(); db = undefined; }
  fs.rmSync(DB_DIR, { recursive: true, force: true });
}

/** q('select * from t where id = $1', [7]) -> rows */
export async function q(sql, params = []) {
  const res = await db.query(sql, params);
  return res.rows;
}

export async function q1(sql, params = []) {
  const rows = await q(sql, params);
  return rows[0] ?? null;
}

/** Runs an INSERT/UPDATE/DELETE and returns the affected row when possible. */
export async function write(sql, params = [], returning = '*') {
  const hasReturn = /returning/i.test(sql);
  if (hasReturn) return q(sql, params);
  await db.query(sql, params);
  return true;
}

export async function tx(fn) {
  await db.exec('BEGIN');
  try {
    const out = await fn();
    await db.exec('COMMIT');
    return out;
  } catch (err) {
    await db.exec('ROLLBACK');
    throw err;
  }
}
