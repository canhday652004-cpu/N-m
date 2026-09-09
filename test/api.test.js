import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

process.env.DB_PATH = ':memory:';
process.env.ADMIN_USER = 'tester';
process.env.ADMIN_PASSWORD = 'secret-pass';

const { ensureAdminUser } = await import('../server/lib/auth.js');
const { createApp } = await import('../server/index.js');
const { seedIfEmpty } = await import('../server/seed.js');

ensureAdminUser();
seedIfEmpty();

const server = createApp();
let baseUrl = '';
let cookie = '';

/** fetch tiện dụng: tự nối base URL, gửi JSON và giữ cookie phiên. */
async function request(path, { method = 'GET', body, auth = false } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth && cookie) headers.Cookie = cookie;

  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await res.text();
  return { status: res.status, headers: res.headers, data: text ? JSON.parse(text) : null };
}

before(async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

describe('Xác thực', () => {
  it('từ chối mật khẩu sai', async () => {
    const res = await request('/api/auth/login', { method: 'POST', body: { username: 'tester', password: 'sai' } });
    assert.equal(res.status, 401);
  });

  it('chặn truy cập khu vực admin khi chưa đăng nhập', async () => {
    const res = await request('/api/admin/products');
    assert.equal(res.status, 401);
  });

  it('đăng nhập thành công và trả về cookie phiên', async () => {
    const res = await request('/api/auth/login', {
      method: 'POST',
      body: { username: 'tester', password: 'secret-pass' },
    });

    assert.equal(res.status, 200);
    assert.equal(res.data.user.username, 'tester');

    cookie = res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
    assert.match(cookie, /shop_session=/);
  });
});

describe('Sản phẩm (CRUD)', () => {
  let productId = 0;

  it('cửa hàng chỉ trả về sản phẩm đang bán', async () => {
    const res = await request('/api/products');
    assert.equal(res.status, 200);
    assert.ok(res.data.products.length > 0);
    assert.ok(res.data.products.every((p) => p.active));
  });

  it('thêm sản phẩm mới và tự sinh slug không dấu', async () => {
    const res = await request('/api/admin/products', {
      method: 'POST',
      auth: true,
      body: { name: 'Áo thun Nam', price: 199000, stock: 5, description: 'Cotton 100%' },
    });

    assert.equal(res.status, 201);
    assert.equal(res.data.product.slug, 'ao-thun-nam');
    assert.equal(res.data.product.price, 199000);
    productId = res.data.product.id;
  });

  it('từ chối dữ liệu không hợp lệ', async () => {
    const missingName = await request('/api/admin/products', { method: 'POST', auth: true, body: { price: 1000 } });
    assert.equal(missingName.status, 400);

    const negativePrice = await request('/api/admin/products', {
      method: 'POST',
      auth: true,
      body: { name: 'Sai giá', price: -5 },
    });
    assert.equal(negativePrice.status, 400);
  });

  it('sửa sản phẩm', async () => {
    const res = await request(`/api/admin/products/${productId}`, {
      method: 'PUT',
      auth: true,
      body: { name: 'Áo thun Nam (mới)', price: 249000, stock: 8, active: false },
    });

    assert.equal(res.status, 200);
    assert.equal(res.data.product.price, 249000);
    assert.equal(res.data.product.active, false);
  });

  it('ẩn sản phẩm khỏi cửa hàng khi active = false', async () => {
    const res = await request(`/api/products/${productId}`);
    assert.equal(res.status, 404);
  });

  it('xoá sản phẩm', async () => {
    const removed = await request(`/api/admin/products/${productId}`, { method: 'DELETE', auth: true });
    assert.equal(removed.status, 200);

    const again = await request(`/api/admin/products/${productId}`, { method: 'DELETE', auth: true });
    assert.equal(again.status, 404);
  });
});

describe('Danh mục (CRUD)', () => {
  let categoryId = 0;

  it('thêm danh mục', async () => {
    const res = await request('/api/admin/categories', { method: 'POST', auth: true, body: { name: 'Đồ gia dụng' } });
    assert.equal(res.status, 201);
    assert.equal(res.data.category.slug, 'do-gia-dung');
    categoryId = res.data.category.id;
  });

  it('sửa danh mục', async () => {
    const res = await request(`/api/admin/categories/${categoryId}`, {
      method: 'PUT',
      auth: true,
      body: { name: 'Gia dụng thông minh' },
    });
    assert.equal(res.status, 200);
    assert.equal(res.data.category.name, 'Gia dụng thông minh');
  });

  it('không cho xoá danh mục còn sản phẩm', async () => {
    const product = await request('/api/admin/products', {
      method: 'POST',
      auth: true,
      body: { name: 'Nồi chiên không dầu', price: 1590000, stock: 3, category_id: categoryId },
    });
    assert.equal(product.status, 201);

    const blocked = await request(`/api/admin/categories/${categoryId}`, { method: 'DELETE', auth: true });
    assert.equal(blocked.status, 409);

    await request(`/api/admin/products/${product.data.product.id}`, { method: 'DELETE', auth: true });
    const removed = await request(`/api/admin/categories/${categoryId}`, { method: 'DELETE', auth: true });
    assert.equal(removed.status, 200);
  });
});

describe('Đơn hàng', () => {
  let orderId = 0;
  let product = null;

  before(async () => {
    const res = await request('/api/products');
    product = res.data.products.find((p) => p.stock > 2);
  });

  it('tạo đơn, tính tiền theo giá trong CSDL và trừ tồn kho', async () => {
    const stockBefore = product.stock;

    const res = await request('/api/orders', {
      method: 'POST',
      body: {
        customer_name: 'Nguyễn Văn A',
        phone: '0900000000',
        address: '12 Lê Lợi, Quận 1, TP.HCM',
        items: [{ product_id: product.id, quantity: 2, price: 1 }],
      },
    });

    assert.equal(res.status, 201);
    assert.equal(res.data.order.total, product.price * 2, 'giá client gửi lên phải bị bỏ qua');
    assert.match(res.data.order.code, /^DH\d{8}-\d{5}$/);
    orderId = res.data.order.id;

    const after = await request(`/api/products/${product.id}`);
    assert.equal(after.data.product.stock, stockBefore - 2);
  });

  it('từ chối đơn vượt tồn kho và không thay đổi dữ liệu', async () => {
    const before = await request(`/api/products/${product.id}`);

    const res = await request('/api/orders', {
      method: 'POST',
      body: {
        customer_name: 'Trần Thị B',
        phone: '0911111111',
        address: '5 Trần Hưng Đạo, Hà Nội',
        items: [{ product_id: product.id, quantity: 99999 }],
      },
    });
    assert.equal(res.status, 400);

    const after = await request(`/api/products/${product.id}`);
    assert.equal(after.data.product.stock, before.data.product.stock);
  });

  it('từ chối giỏ hàng trống', async () => {
    const res = await request('/api/orders', {
      method: 'POST',
      body: { customer_name: 'C', phone: '0922222222', address: 'Đâu đó', items: [] },
    });
    assert.equal(res.status, 400);
  });

  it('đổi trạng thái đơn hàng', async () => {
    const ok = await request(`/api/admin/orders/${orderId}/status`, {
      method: 'PUT',
      auth: true,
      body: { status: 'shipping' },
    });
    assert.equal(ok.status, 200);
    assert.equal(ok.data.order.status, 'shipping');

    const invalid = await request(`/api/admin/orders/${orderId}/status`, {
      method: 'PUT',
      auth: true,
      body: { status: 'bay-hoi' },
    });
    assert.equal(invalid.status, 400);
  });

  it('xem chi tiết và xoá đơn hàng', async () => {
    const detail = await request(`/api/admin/orders/${orderId}`, { auth: true });
    assert.equal(detail.status, 200);
    assert.equal(detail.data.order.items.length, 1);

    const removed = await request(`/api/admin/orders/${orderId}`, { method: 'DELETE', auth: true });
    assert.equal(removed.status, 200);
  });
});

describe('Trang tĩnh', () => {
  it('phục vụ trang cửa hàng và trang admin', async () => {
    for (const path of ['/', '/admin']) {
      const res = await fetch(`${baseUrl}${path}`);
      assert.equal(res.status, 200);
      assert.match(res.headers.get('content-type'), /text\/html/);
    }
  });

  it('chặn path traversal', async () => {
    const res = await fetch(`${baseUrl}/../package.json`, { redirect: 'manual' });
    assert.ok(res.status === 404 || res.status === 301, `nhận được ${res.status}`);
  });
});
