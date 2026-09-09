import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { db } from '../db.js';
import { parseCookies, setCookie, unauthorized } from './http.js';

export const SESSION_COOKIE = 'shop_session';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 giờ

/** token -> { username, expiresAt }. Phiên nằm trong RAM nên restart server là phải đăng nhập lại. */
const sessions = new Map();

export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const derived = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password, stored) {
  const [salt, expected] = String(stored).split(':');
  if (!salt || !expected) return false;

  const actual = scryptSync(password, salt, 64);
  const expectedBuf = Buffer.from(expected, 'hex');
  if (actual.length !== expectedBuf.length) return false;

  return timingSafeEqual(actual, expectedBuf);
}

function purgeExpired() {
  const now = Date.now();
  for (const [token, session] of sessions) {
    if (session.expiresAt <= now) sessions.delete(token);
  }
}

export function createSession(username) {
  purgeExpired();
  const token = randomBytes(32).toString('hex');
  sessions.set(token, { username, expiresAt: Date.now() + SESSION_TTL_MS });
  return token;
}

export function destroySession(token) {
  sessions.delete(token);
}

export function getSession(req) {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (!token) return null;

  const session = sessions.get(token);
  if (!session) return null;

  if (session.expiresAt <= Date.now()) {
    sessions.delete(token);
    return null;
  }
  return { token, username: session.username };
}

/** Dùng cho mọi route /api/admin/*: ném 401 nếu chưa đăng nhập. */
export function requireAdmin(req) {
  const session = getSession(req);
  if (!session) throw unauthorized();
  return session;
}

export function attachSessionCookie(res, token) {
  setCookie(res, SESSION_COOKIE, token, { maxAge: SESSION_TTL_MS / 1000 });
}

export function clearSessionCookie(res) {
  setCookie(res, SESSION_COOKIE, '', { maxAge: 0 });
}

/** Tạo tài khoản quản trị mặc định nếu bảng users còn trống. */
export function ensureAdminUser() {
  const count = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  if (count > 0) return null;

  const username = process.env.ADMIN_USER ?? 'admin';
  const password = process.env.ADMIN_PASSWORD ?? 'admin123';

  db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)')
    .run(username, hashPassword(password));

  return { username, password };
}
