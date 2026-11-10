import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import jwt from 'jsonwebtoken';
import { q1 } from './db.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const SECRET_FILE = path.join(here, '..', 'data', 'jwt.key');

function secret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  if (!fs.existsSync(SECRET_FILE)) {
    fs.mkdirSync(path.dirname(SECRET_FILE), { recursive: true });
    fs.writeFileSync(SECRET_FILE, crypto.randomBytes(32).toString('hex'));
  }
  return fs.readFileSync(SECRET_FILE, 'utf8').trim();
}

export function signToken(user) {
  return jwt.sign({ sub: String(user.id), role: user.role, name: user.full_name }, secret(), { expiresIn: '12h' });
}

/** Wraps async route handlers so thrown errors reach the error middleware. */
export const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const bad = (status, message, details) => { throw new HttpError(status, message, details); };

/** Verifies the bearer token and loads the current user row. */
export async function authRequired(req, res, next) {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : req.query.token;
  if (!token) return next(new HttpError(401, 'Authentication required'));
  let payload;
  try {
    payload = jwt.verify(token, secret());
  } catch {
    return next(new HttpError(401, 'Session expired - please sign in again'));
  }
  const user = await q1('select * from v_user where id = $1', [Number(payload.sub)]);
  if (!user || !user.is_active) return next(new HttpError(403, 'Account is not active'));
  req.user = { ...user, id: Number(user.id) };
  next();
}

/** Same as authRequired but a missing or stale token is simply treated as anonymous. */
export async function authOptional(req, res, next) {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : undefined;
  if (!token) return next();
  try {
    const payload = jwt.verify(token, secret());
    const user = await q1('select * from v_user where id = $1', [Number(payload.sub)]);
    if (user?.is_active) req.user = { ...user, id: Number(user.id) };
  } catch { /* anonymous view */ }
  next();
}

export const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) return next(new HttpError(401, 'Authentication required'));
  if (!roles.includes(req.user.role)) return next(new HttpError(403, `This action needs the ${roles.join(' or ')} role`));
  next();
};

export function sendError(err, res) {
  const status = err.status ?? 500;
  if (status >= 500) console.error('[interniq]', err);
  res.status(status).json({ error: err.message ?? 'Internal error', details: err.details });
}
