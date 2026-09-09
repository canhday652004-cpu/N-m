import { db, ORDER_STATUSES, ORDER_STATUS_LABELS } from '../db.js';
import {
  attachSessionCookie, clearSessionCookie, createSession, destroySession,
  getSession, requireAdmin, verifyPassword,
} from '../lib/auth.js';
import { badRequest, HttpError, notFound, readJsonBody, sendJson, unauthorized } from '../lib/http.js';
import { str } from '../lib/validate.js';
import {
  createCategory, createProduct, deleteCategory, deleteProduct, getProduct,
  listCategories, listProducts, updateCategory, updateProduct,
} from './products.js';
import {
  createOrder, deleteOrder, getOrder, getStats, listOrders, updateOrderStatus,
} from './orders.js';

const LOGIN_MAX_ATTEMPTS = 10;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const loginAttempts = new Map(); // ip -> { count, resetAt }

function checkLoginThrottle(ip) {
  const now = Date.now();
  const entry = loginAttempts.get(ip);

  if (!entry || entry.resetAt <= now) {
    loginAttempts.set(ip, { count: 0, resetAt: now + LOGIN_WINDOW_MS });
    return;
  }
  if (entry.count >= LOGIN_MAX_ATTEMPTS) {
    throw new HttpError(429, 'Bạn đã đăng nhập sai quá nhiều lần, vui lòng thử lại sau 15 phút');
  }
}

function recordFailedLogin(ip) {
  const entry = loginAttempts.get(ip);
  if (entry) entry.count += 1;
}

function idFrom(segment) {
  const id = Number(segment);
  if (!Number.isInteger(id) || id <= 0) throw badRequest('ID không hợp lệ');
  return id;
}

/**
 * Định tuyến toàn bộ /api/*.
 * @returns {Promise<boolean>} true nếu request đã được xử lý.
 */
export async function handleApi(req, res, url) {
  const segments = url.pathname.split('/').filter(Boolean); // ['api', ...]
  if (segments[0] !== 'api') return false;

  const [, section, ...rest] = segments;
  const { method } = req;
  const query = url.searchParams;

  // ---------- Xác thực ----------
  if (section === 'auth') {
    if (rest[0] === 'login' && method === 'POST') {
      const ip = req.socket.remoteAddress ?? 'unknown';
      checkLoginThrottle(ip);

      const body = await readJsonBody(req);
      const username = str(body, 'username', { required: true, max: 60 });
      const password = str(body, 'password', { required: true, max: 200 });

      const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
      if (!user || !verifyPassword(password, user.password_hash)) {
        recordFailedLogin(ip);
        throw unauthorized('Tài khoản hoặc mật khẩu không đúng');
      }

      loginAttempts.delete(ip);
      attachSessionCookie(res, createSession(user.username));
      sendJson(res, 200, { user: { username: user.username } });
      return true;
    }

    if (rest[0] === 'logout' && method === 'POST') {
      const session = getSession(req);
      if (session) destroySession(session.token);
      clearSessionCookie(res);
      sendJson(res, 200, { ok: true });
      return true;
    }

    if (rest[0] === 'me' && method === 'GET') {
      const session = getSession(req);
      sendJson(res, 200, { user: session ? { username: session.username } : null });
      return true;
    }

    throw notFound('Endpoint không tồn tại');
  }

  // ---------- Public: sản phẩm ----------
  if (section === 'products' && method === 'GET') {
    if (rest.length === 0) {
      const products = listProducts({
        q: query.get('q') ?? '',
        category: query.get('category') ?? '',
        onlyActive: true,
      });
      sendJson(res, 200, { products });
      return true;
    }

    const product = getProduct(rest[0]);
    if (!product || !product.active) throw notFound('Sản phẩm không tồn tại');
    sendJson(res, 200, { product });
    return true;
  }

  if (section === 'categories' && method === 'GET' && rest.length === 0) {
    sendJson(res, 200, { categories: listCategories() });
    return true;
  }

  // ---------- Public: đặt hàng ----------
  if (section === 'orders' && method === 'POST' && rest.length === 0) {
    const order = createOrder(await readJsonBody(req));
    sendJson(res, 201, { order });
    return true;
  }

  if (section === 'meta' && method === 'GET') {
    const statuses = ORDER_STATUSES.map((value) => ({ value, label: ORDER_STATUS_LABELS[value] }));
    sendJson(res, 200, { order_statuses: statuses });
    return true;
  }

  // ---------- Khu vực quản trị ----------
  if (section === 'admin') {
    requireAdmin(req);

    const [resource, idSegment, action] = rest;

    if (resource === 'stats' && method === 'GET') {
      sendJson(res, 200, { stats: getStats() });
      return true;
    }

    if (resource === 'products') {
      if (!idSegment && method === 'GET') {
        sendJson(res, 200, { products: listProducts({ q: query.get('q') ?? '', category: query.get('category') ?? '' }) });
        return true;
      }
      if (!idSegment && method === 'POST') {
        sendJson(res, 201, { product: createProduct(await readJsonBody(req)) });
        return true;
      }
      if (idSegment && method === 'GET') {
        const product = getProduct(idFrom(idSegment));
        if (!product) throw notFound('Sản phẩm không tồn tại');
        sendJson(res, 200, { product });
        return true;
      }
      if (idSegment && (method === 'PUT' || method === 'PATCH')) {
        sendJson(res, 200, { product: updateProduct(idFrom(idSegment), await readJsonBody(req)) });
        return true;
      }
      if (idSegment && method === 'DELETE') {
        deleteProduct(idFrom(idSegment));
        sendJson(res, 200, { ok: true });
        return true;
      }
    }

    if (resource === 'categories') {
      if (!idSegment && method === 'GET') {
        sendJson(res, 200, { categories: listCategories() });
        return true;
      }
      if (!idSegment && method === 'POST') {
        sendJson(res, 201, { category: createCategory(await readJsonBody(req)) });
        return true;
      }
      if (idSegment && (method === 'PUT' || method === 'PATCH')) {
        sendJson(res, 200, { category: updateCategory(idFrom(idSegment), await readJsonBody(req)) });
        return true;
      }
      if (idSegment && method === 'DELETE') {
        deleteCategory(idFrom(idSegment));
        sendJson(res, 200, { ok: true });
        return true;
      }
    }

    if (resource === 'orders') {
      if (!idSegment && method === 'GET') {
        sendJson(res, 200, { orders: listOrders({ status: query.get('status') ?? '' }) });
        return true;
      }
      if (idSegment && !action && method === 'GET') {
        sendJson(res, 200, { order: getOrder(idFrom(idSegment)) });
        return true;
      }
      if (idSegment && action === 'status' && (method === 'PUT' || method === 'PATCH')) {
        sendJson(res, 200, { order: updateOrderStatus(idFrom(idSegment), await readJsonBody(req)) });
        return true;
      }
      if (idSegment && !action && method === 'DELETE') {
        deleteOrder(idFrom(idSegment));
        sendJson(res, 200, { ok: true });
        return true;
      }
    }
  }

  throw notFound('Endpoint không tồn tại');
}
