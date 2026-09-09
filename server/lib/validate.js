import { badRequest } from './http.js';

export function str(body, field, { required = false, max = 500, fallback = '' } = {}) {
  const raw = body[field];

  if (raw === undefined || raw === null || raw === '') {
    if (required) throw badRequest(`Thiếu trường "${field}"`);
    return fallback;
  }

  if (typeof raw !== 'string') throw badRequest(`Trường "${field}" phải là chuỗi`);

  const value = raw.trim();
  if (required && value === '') throw badRequest(`Trường "${field}" không được để trống`);
  if (value.length > max) throw badRequest(`Trường "${field}" tối đa ${max} ký tự`);

  return value;
}

export function int(body, field, { required = false, min = 0, max = Number.MAX_SAFE_INTEGER, fallback = 0 } = {}) {
  const raw = body[field];

  if (raw === undefined || raw === null || raw === '') {
    if (required) throw badRequest(`Thiếu trường "${field}"`);
    return fallback;
  }

  const value = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    throw badRequest(`Trường "${field}" phải là số nguyên`);
  }
  if (value < min || value > max) {
    throw badRequest(`Trường "${field}" phải nằm trong khoảng ${min}–${max}`);
  }

  return value;
}

export function bool(body, field, fallback = false) {
  const raw = body[field];
  if (raw === undefined || raw === null || raw === '') return fallback;
  if (typeof raw === 'boolean') return raw;
  if (raw === 1 || raw === '1' || raw === 'true') return true;
  if (raw === 0 || raw === '0' || raw === 'false') return false;
  throw badRequest(`Trường "${field}" phải là true/false`);
}

export function oneOf(body, field, allowed, { required = false, fallback = allowed[0] } = {}) {
  const value = str(body, field, { required, fallback });
  if (value === '' && !required) return fallback;
  if (!allowed.includes(value)) {
    throw badRequest(`Trường "${field}" phải là một trong: ${allowed.join(', ')}`);
  }
  return value;
}

const DIACRITICS = {
  a: 'àáạảãâầấậẩẫăằắặẳẵ',
  e: 'èéẹẻẽêềếệểễ',
  i: 'ìíịỉĩ',
  o: 'òóọỏõôồốộổỗơờớợởỡ',
  u: 'ùúụủũưừứựửữ',
  y: 'ỳýỵỷỹ',
  d: 'đ',
};

/** Chuyển tên tiếng Việt thành slug ASCII: "Áo thun Nam" -> "ao-thun-nam". */
export function slugify(input) {
  let text = String(input).toLowerCase();

  for (const [plain, accented] of Object.entries(DIACRITICS)) {
    text = text.replace(new RegExp(`[${accented}]`, 'g'), plain);
  }

  const slug = text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug || `muc-${Date.now()}`;
}

/** Thêm hậu tố -2, -3... cho tới khi slug không trùng (bỏ qua bản ghi đang sửa). */
export function uniqueSlug(db, table, base, excludeId = null) {
  const stmt = db.prepare(`SELECT id FROM ${table} WHERE slug = ? AND id IS NOT ?`);

  let candidate = base;
  let counter = 2;
  while (stmt.get(candidate, excludeId)) {
    candidate = `${base}-${counter++}`;
  }
  return candidate;
}
