/** Tiện ích dùng chung cho cả trang bán hàng và trang quản trị. */

export const currency = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 });

export const formatPrice = (value) => currency.format(Number(value) || 0);

export function formatDate(value) {
  if (!value) return '';
  // SQLite trả về "YYYY-MM-DD HH:MM:SS" theo giờ UTC.
  const date = new Date(`${String(value).replace(' ', 'T')}Z`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** Chèn dữ liệu vào HTML template an toàn. */
export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** Gọi API JSON; ném ApiError kèm thông điệp từ máy chủ khi thất bại. */
export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await res.text();
  let data = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      throw new ApiError(res.status, 'Máy chủ trả về dữ liệu không hợp lệ');
    }
  }

  if (!res.ok) throw new ApiError(res.status, data.error || `Lỗi ${res.status}`);
  return data;
}

let toastHost = null;

export function toast(message, type = 'info') {
  if (!toastHost) {
    toastHost = document.createElement('div');
    toastHost.className = 'toasts';
    document.body.append(toastHost);
  }

  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  toastHost.append(el);

  // Chỉ giữ tối đa 4 thông báo để không che mất nội dung phía dưới.
  while (toastHost.children.length > 4) toastHost.firstElementChild.remove();

  setTimeout(() => el.remove(), 3800);
}

export const $ = (selector, scope = document) => scope.querySelector(selector);
export const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];
