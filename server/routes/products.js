import { db } from '../db.js';
import { conflict, notFound } from '../lib/http.js';
import { bool, int, slugify, str, uniqueSlug } from '../lib/validate.js';

const SELECT_PRODUCT = `
  SELECT p.*, c.name AS category_name, c.slug AS category_slug
  FROM products p
  LEFT JOIN categories c ON c.id = p.category_id
`;

function toProduct(row) {
  if (!row) return null;
  const { category_name, category_slug, ...product } = row;
  return {
    ...product,
    active: Boolean(product.active),
    category: product.category_id ? { id: product.category_id, name: category_name, slug: category_slug } : null,
  };
}

/**
 * Danh sách sản phẩm.
 * @param {{ q?: string, category?: string, onlyActive?: boolean }} filters
 */
export function listProducts({ q = '', category = '', onlyActive = false } = {}) {
  const where = [];
  const params = [];

  if (onlyActive) where.push('p.active = 1');

  if (q) {
    where.push('(p.name LIKE ? OR p.description LIKE ?)');
    params.push(`%${q}%`, `%${q}%`);
  }

  if (category) {
    where.push('c.slug = ?');
    params.push(category);
  }

  const sql = `${SELECT_PRODUCT}
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY p.created_at DESC, p.id DESC`;

  return db.prepare(sql).all(...params).map(toProduct);
}

export function getProduct(idOrSlug) {
  const byId = Number(idOrSlug);
  const row = Number.isInteger(byId) && byId > 0
    ? db.prepare(`${SELECT_PRODUCT} WHERE p.id = ?`).get(byId)
    : db.prepare(`${SELECT_PRODUCT} WHERE p.slug = ?`).get(String(idOrSlug));

  return toProduct(row);
}

function readCategoryId(body) {
  const categoryId = int(body, 'category_id', { fallback: 0 });
  if (categoryId === 0) return null;

  const exists = db.prepare('SELECT id FROM categories WHERE id = ?').get(categoryId);
  if (!exists) throw notFound('Danh mục không tồn tại');

  return categoryId;
}

function readProductFields(body, { partial = false } = {}) {
  return {
    name: str(body, 'name', { required: !partial, max: 200 }),
    description: str(body, 'description', { max: 5000 }),
    price: int(body, 'price', { required: !partial, min: 0, max: 10_000_000_000 }),
    stock: int(body, 'stock', { min: 0, max: 1_000_000 }),
    image_url: str(body, 'image_url', { max: 1000 }),
    category_id: readCategoryId(body),
    active: bool(body, 'active', true),
  };
}

export function createProduct(body) {
  const fields = readProductFields(body);
  const slug = uniqueSlug(db, 'products', slugify(str(body, 'slug', { max: 200 }) || fields.name));

  const { lastInsertRowid } = db.prepare(`
    INSERT INTO products (name, slug, description, price, stock, image_url, category_id, active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    fields.name,
    slug,
    fields.description,
    fields.price,
    fields.stock,
    fields.image_url,
    fields.category_id,
    fields.active ? 1 : 0,
  );

  return getProduct(Number(lastInsertRowid));
}

export function updateProduct(id, body) {
  const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
  if (!existing) throw notFound('Sản phẩm không tồn tại');

  const fields = readProductFields({ ...existing, ...body }, { partial: true });
  const slugSource = str(body, 'slug', { max: 200 }) || fields.name || existing.name;
  const slug = uniqueSlug(db, 'products', slugify(slugSource), id);

  db.prepare(`
    UPDATE products
    SET name = ?, slug = ?, description = ?, price = ?, stock = ?, image_url = ?,
        category_id = ?, active = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(
    fields.name || existing.name,
    slug,
    fields.description,
    fields.price,
    fields.stock,
    fields.image_url,
    fields.category_id,
    fields.active ? 1 : 0,
    id,
  );

  return getProduct(id);
}

export function deleteProduct(id) {
  const { changes } = db.prepare('DELETE FROM products WHERE id = ?').run(id);
  if (changes === 0) throw notFound('Sản phẩm không tồn tại');
}

export function listCategories() {
  return db.prepare(`
    SELECT c.*, (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id) AS product_count
    FROM categories c
    ORDER BY c.name COLLATE NOCASE
  `).all();
}

export function createCategory(body) {
  const name = str(body, 'name', { required: true, max: 120 });
  const slug = uniqueSlug(db, 'categories', slugify(str(body, 'slug', { max: 120 }) || name));

  const { lastInsertRowid } = db.prepare('INSERT INTO categories (name, slug) VALUES (?, ?)').run(name, slug);
  return db.prepare('SELECT * FROM categories WHERE id = ?').get(Number(lastInsertRowid));
}

export function updateCategory(id, body) {
  const existing = db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
  if (!existing) throw notFound('Danh mục không tồn tại');

  const name = str(body, 'name', { max: 120 }) || existing.name;
  const slug = uniqueSlug(db, 'categories', slugify(str(body, 'slug', { max: 120 }) || name), id);

  db.prepare('UPDATE categories SET name = ?, slug = ? WHERE id = ?').run(name, slug, id);
  return db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
}

export function deleteCategory(id) {
  const existing = db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
  if (!existing) throw notFound('Danh mục không tồn tại');

  const inUse = db.prepare('SELECT COUNT(*) AS n FROM products WHERE category_id = ?').get(id).n;
  if (inUse > 0) throw conflict(`Còn ${inUse} sản phẩm thuộc danh mục này, hãy chuyển chúng sang danh mục khác trước`);

  db.prepare('DELETE FROM categories WHERE id = ?').run(id);
}
