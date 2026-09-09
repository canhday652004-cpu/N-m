import { db, ORDER_STATUSES } from '../db.js';
import { badRequest, notFound } from '../lib/http.js';
import { int, oneOf, str } from '../lib/validate.js';

function generateCode() {
  const stamp = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  const random = Math.floor(Math.random() * 90_000) + 10_000;
  return `DH${stamp}-${random}`;
}

function withItems(order) {
  if (!order) return null;
  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ? ORDER BY id').all(order.id);
  return { ...order, items };
}

export function listOrders({ status = '' } = {}) {
  const sql = `
    SELECT o.*, (SELECT COUNT(*) FROM order_items i WHERE i.order_id = o.id) AS item_count
    FROM orders o
    ${status ? 'WHERE o.status = ?' : ''}
    ORDER BY o.created_at DESC, o.id DESC
  `;
  return status ? db.prepare(sql).all(status) : db.prepare(sql).all();
}

export function getOrder(id) {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  if (!order) throw notFound('Đơn hàng không tồn tại');
  return withItems(order);
}

/**
 * Tạo đơn từ giỏ hàng của khách.
 * Giá luôn lấy từ CSDL chứ không tin giá client gửi lên, và tồn kho được trừ trong cùng transaction.
 */
export function createOrder(body) {
  const customer = {
    customer_name: str(body, 'customer_name', { required: true, max: 120 }),
    phone: str(body, 'phone', { required: true, max: 30 }),
    email: str(body, 'email', { max: 160 }),
    address: str(body, 'address', { required: true, max: 400 }),
    note: str(body, 'note', { max: 1000 }),
  };

  const rawItems = body.items;
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    throw badRequest('Giỏ hàng đang trống');
  }
  if (rawItems.length > 100) throw badRequest('Đơn hàng có quá nhiều dòng sản phẩm');

  const productStmt = db.prepare('SELECT * FROM products WHERE id = ?');
  const lines = [];
  let total = 0;

  for (const raw of rawItems) {
    if (raw === null || typeof raw !== 'object') throw badRequest('Dòng sản phẩm không hợp lệ');

    const productId = int(raw, 'product_id', { required: true, min: 1 });
    const quantity = int(raw, 'quantity', { required: true, min: 1, max: 1000 });

    const product = productStmt.get(productId);
    if (!product) throw notFound(`Sản phẩm #${productId} không tồn tại`);
    if (!product.active) throw badRequest(`Sản phẩm "${product.name}" đã ngừng bán`);
    if (product.stock < quantity) {
      throw badRequest(`Sản phẩm "${product.name}" chỉ còn ${product.stock} trong kho`);
    }

    lines.push({ product, quantity });
    total += product.price * quantity;
  }

  const insertOrder = db.prepare(`
    INSERT INTO orders (code, customer_name, phone, email, address, note, total)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const insertItem = db.prepare(`
    INSERT INTO order_items (order_id, product_id, name, price, quantity)
    VALUES (?, ?, ?, ?, ?)
  `);
  const reduceStock = db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?');

  db.exec('BEGIN');
  try {
    const { lastInsertRowid } = insertOrder.run(
      generateCode(),
      customer.customer_name,
      customer.phone,
      customer.email,
      customer.address,
      customer.note,
      total,
    );
    const orderId = Number(lastInsertRowid);

    for (const { product, quantity } of lines) {
      insertItem.run(orderId, product.id, product.name, product.price, quantity);
      reduceStock.run(quantity, product.id);
    }

    db.exec('COMMIT');
    return getOrder(orderId);
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function updateOrderStatus(id, body) {
  const existing = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  if (!existing) throw notFound('Đơn hàng không tồn tại');

  const status = oneOf(body, 'status', ORDER_STATUSES, { required: true });
  db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(status, id);

  return getOrder(id);
}

export function deleteOrder(id) {
  const { changes } = db.prepare('DELETE FROM orders WHERE id = ?').run(id);
  if (changes === 0) throw notFound('Đơn hàng không tồn tại');
}

export function getStats() {
  const revenueRow = db.prepare(`SELECT COALESCE(SUM(total), 0) AS revenue FROM orders WHERE status != 'cancelled'`).get();

  return {
    products: db.prepare('SELECT COUNT(*) AS n FROM products').get().n,
    active_products: db.prepare('SELECT COUNT(*) AS n FROM products WHERE active = 1').get().n,
    categories: db.prepare('SELECT COUNT(*) AS n FROM categories').get().n,
    orders: db.prepare('SELECT COUNT(*) AS n FROM orders').get().n,
    pending_orders: db.prepare(`SELECT COUNT(*) AS n FROM orders WHERE status = 'pending'`).get().n,
    out_of_stock: db.prepare('SELECT COUNT(*) AS n FROM products WHERE stock = 0').get().n,
    revenue: revenueRow.revenue,
  };
}
