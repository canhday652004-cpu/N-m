const MAX_BODY_BYTES = 1_000_000;

/** Lỗi có kèm HTTP status, được router bắt và trả về JSON. */
export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const badRequest = (message, details) => new HttpError(400, message, details);
export const unauthorized = (message = 'Bạn cần đăng nhập') => new HttpError(401, message);
export const notFound = (message = 'Không tìm thấy') => new HttpError(404, message);
export const conflict = (message) => new HttpError(409, message);

export function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

export function sendEmpty(res, status = 204) {
  res.writeHead(status);
  res.end();
}

/** Đọc và parse JSON body, giới hạn kích thước để tránh chiếm hết bộ nhớ. */
export async function readJsonBody(req) {
  const chunks = [];
  let size = 0;

  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw badRequest('Dữ liệu gửi lên quá lớn');
    chunks.push(chunk);
  }

  if (size === 0) return {};

  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw badRequest('Body phải là một JSON object');
    }
    return parsed;
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw badRequest('JSON không hợp lệ');
  }
}

export function parseCookies(req) {
  const header = req.headers.cookie;
  if (!header) return {};

  const out = {};
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    out[part.slice(0, eq).trim()] = decodeURIComponent(part.slice(eq + 1).trim());
  }
  return out;
}

export function setCookie(res, name, value, { maxAge } = {}) {
  const attrs = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax'];
  if (maxAge !== undefined) attrs.push(`Max-Age=${maxAge}`);
  res.setHeader('Set-Cookie', attrs.join('; '));
}
