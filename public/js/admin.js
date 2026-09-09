import { $, $$, api, ApiError, escapeHtml, formatDate, formatPrice, toast } from './common.js';

const state = {
  user: null,
  tab: 'dashboard',
  products: [],
  categories: [],
  orders: [],
  statuses: [],
  editingProduct: null,
  editingCategory: null,
};

/* ---------- Đăng nhập / đăng xuất ---------- */

async function checkSession() {
  try {
    const { user } = await api('/api/auth/me');
    state.user = user;
  } catch {
    state.user = null;
  }
  renderShell();
}

async function handleLogin(event) {
  event.preventDefault();

  const form = event.target;
  const button = $('button[type="submit"]', form);
  const error = $('#login-error');

  error.classList.add('hidden');
  button.disabled = true;

  try {
    const { user } = await api('/api/auth/login', {
      method: 'POST',
      body: Object.fromEntries(new FormData(form).entries()),
    });
    state.user = user;
    form.reset();
    renderShell();
    loadAll();
  } catch (err) {
    error.textContent = err.message;
    error.classList.remove('hidden');
  } finally {
    button.disabled = false;
  }
}

async function handleLogout() {
  await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
  state.user = null;
  renderShell();
}

function renderShell() {
  const loggedIn = Boolean(state.user);
  $('#login-view').classList.toggle('hidden', loggedIn);
  $('#admin-view').classList.toggle('hidden', !loggedIn);
  if (loggedIn) $('#current-user').textContent = state.user.username;
}

/** Phiên hết hạn giữa chừng: đưa người dùng về màn hình đăng nhập thay vì báo lỗi khó hiểu. */
function handleApiError(err) {
  if (err instanceof ApiError && err.status === 401) {
    state.user = null;
    renderShell();
    toast('Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại', 'error');
    return;
  }
  toast(err.message, 'error');
}

/* ---------- Điều hướng tab ---------- */

function switchTab(tab) {
  state.tab = tab;
  $$('.tab-btn').forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === tab));
  $$('.tab-panel').forEach((panel) => panel.classList.toggle('hidden', panel.id !== `tab-${tab}`));
}

/* ---------- Bảng điều khiển ---------- */

function renderStats(stats) {
  const cards = [
    { label: 'Sản phẩm', value: stats.products, hint: `${stats.active_products} đang bán` },
    { label: 'Danh mục', value: stats.categories },
    { label: 'Đơn hàng', value: stats.orders, hint: `${stats.pending_orders} chờ xử lý` },
    { label: 'Doanh thu', value: formatPrice(stats.revenue), hint: 'Không tính đơn đã huỷ' },
    { label: 'Hết hàng', value: stats.out_of_stock, hint: 'Sản phẩm tồn kho = 0' },
  ];

  $('#stat-grid').innerHTML = cards.map((card) => `
    <div class="stat">
      <div class="stat-value">${escapeHtml(card.value)}</div>
      <div class="stat-label">${escapeHtml(card.label)}</div>
      ${card.hint ? `<div class="small muted">${escapeHtml(card.hint)}</div>` : ''}
    </div>`).join('');
}

/* ---------- Sản phẩm ---------- */

function renderProducts() {
  const keyword = $('#product-search').value.trim().toLowerCase();
  const rows = state.products.filter((p) => !keyword || p.name.toLowerCase().includes(keyword));

  const tbody = $('#product-rows');
  if (rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty">Chưa có sản phẩm nào.</td></tr>';
    return;
  }

  tbody.innerHTML = rows.map((p) => `
    <tr>
      <td>
        <div class="row">
          ${p.image_url ? `<img class="cell-thumb" src="${escapeHtml(p.image_url)}" alt="">` : ''}
          <div>
            <div><strong>${escapeHtml(p.name)}</strong></div>
            <div class="small muted">${escapeHtml(p.slug)}</div>
          </div>
        </div>
      </td>
      <td>${p.category ? escapeHtml(p.category.name) : '<span class="muted">—</span>'}</td>
      <td>${formatPrice(p.price)}</td>
      <td>${p.stock === 0 ? '<span class="badge badge-danger">Hết hàng</span>' : p.stock}</td>
      <td>${p.active ? '<span class="badge badge-success">Đang bán</span>' : '<span class="badge">Ẩn</span>'}</td>
      <td class="actions">
        <button class="btn btn-sm" data-edit-product="${p.id}">Sửa</button>
        <button class="btn btn-sm btn-danger" data-delete-product="${p.id}">Xoá</button>
      </td>
    </tr>`).join('');
}

function openProductModal(product = null) {
  state.editingProduct = product;

  $('#product-modal-title').textContent = product ? 'Sửa sản phẩm' : 'Thêm sản phẩm';
  $('#pf-category').innerHTML = '<option value="">— Không có danh mục —</option>'
    + state.categories.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');

  const form = $('#product-form');
  form.reset();
  form.elements.name.value = product?.name ?? '';
  form.elements.price.value = product?.price ?? 0;
  form.elements.stock.value = product?.stock ?? 0;
  form.elements.image_url.value = product?.image_url ?? '';
  form.elements.description.value = product?.description ?? '';
  form.elements.category_id.value = product?.category_id ?? '';
  form.elements.active.checked = product ? product.active : true;

  $('#product-modal').classList.remove('hidden');
  form.elements.name.focus();
}

async function saveProduct(event) {
  event.preventDefault();

  const form = event.target;
  const button = $('button[type="submit"]', form);
  const data = Object.fromEntries(new FormData(form).entries());

  const payload = {
    name: data.name,
    description: data.description,
    price: Number(data.price) || 0,
    stock: Number(data.stock) || 0,
    image_url: data.image_url,
    category_id: data.category_id ? Number(data.category_id) : 0,
    active: form.elements.active.checked,
  };

  button.disabled = true;
  try {
    const editing = state.editingProduct;
    await api(editing ? `/api/admin/products/${editing.id}` : '/api/admin/products', {
      method: editing ? 'PUT' : 'POST',
      body: payload,
    });

    $('#product-modal').classList.add('hidden');
    toast(editing ? 'Đã cập nhật sản phẩm' : 'Đã thêm sản phẩm', 'success');
    await loadAll();
  } catch (err) {
    handleApiError(err);
  } finally {
    button.disabled = false;
  }
}

async function deleteProduct(id) {
  const product = state.products.find((p) => p.id === id);
  if (!confirm(`Xoá sản phẩm "${product?.name ?? id}"? Thao tác này không thể hoàn tác.`)) return;

  try {
    await api(`/api/admin/products/${id}`, { method: 'DELETE' });
    toast('Đã xoá sản phẩm', 'success');
    await loadAll();
  } catch (err) {
    handleApiError(err);
  }
}

/* ---------- Danh mục ---------- */

function renderCategories() {
  const tbody = $('#category-rows');

  if (state.categories.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="empty">Chưa có danh mục nào.</td></tr>';
    return;
  }

  tbody.innerHTML = state.categories.map((c) => `
    <tr>
      <td><strong>${escapeHtml(c.name)}</strong></td>
      <td class="muted">${escapeHtml(c.slug)}</td>
      <td>${c.product_count}</td>
      <td class="actions">
        <button class="btn btn-sm" data-edit-category="${c.id}">Sửa</button>
        <button class="btn btn-sm btn-danger" data-delete-category="${c.id}">Xoá</button>
      </td>
    </tr>`).join('');
}

function openCategoryModal(category = null) {
  state.editingCategory = category;
  $('#category-modal-title').textContent = category ? 'Sửa danh mục' : 'Thêm danh mục';

  const form = $('#category-form');
  form.reset();
  form.elements.name.value = category?.name ?? '';

  $('#category-modal').classList.remove('hidden');
  form.elements.name.focus();
}

async function saveCategory(event) {
  event.preventDefault();

  const form = event.target;
  const button = $('button[type="submit"]', form);
  const payload = { name: form.elements.name.value };

  button.disabled = true;
  try {
    const editing = state.editingCategory;
    await api(editing ? `/api/admin/categories/${editing.id}` : '/api/admin/categories', {
      method: editing ? 'PUT' : 'POST',
      body: payload,
    });

    $('#category-modal').classList.add('hidden');
    toast(editing ? 'Đã cập nhật danh mục' : 'Đã thêm danh mục', 'success');
    await loadAll();
  } catch (err) {
    handleApiError(err);
  } finally {
    button.disabled = false;
  }
}

async function deleteCategory(id) {
  const category = state.categories.find((c) => c.id === id);
  if (!confirm(`Xoá danh mục "${category?.name ?? id}"?`)) return;

  try {
    await api(`/api/admin/categories/${id}`, { method: 'DELETE' });
    toast('Đã xoá danh mục', 'success');
    await loadAll();
  } catch (err) {
    handleApiError(err);
  }
}

/* ---------- Đơn hàng ---------- */

const statusLabel = (value) => state.statuses.find((s) => s.value === value)?.label ?? value;

const STATUS_BADGE = {
  pending: 'badge-warn',
  confirmed: 'badge-brand',
  shipping: 'badge-brand',
  done: 'badge-success',
  cancelled: 'badge-danger',
};

function renderOrders() {
  const filter = $('#order-filter').value;
  const rows = state.orders.filter((o) => !filter || o.status === filter);
  const tbody = $('#order-rows');

  if (rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty">Chưa có đơn hàng nào.</td></tr>';
    return;
  }

  tbody.innerHTML = rows.map((o) => `
    <tr>
      <td><strong>${escapeHtml(o.code)}</strong><div class="small muted">${o.item_count} sản phẩm</div></td>
      <td>${escapeHtml(o.customer_name)}<div class="small muted">${escapeHtml(o.phone)}</div></td>
      <td>${formatPrice(o.total)}</td>
      <td>
        <select class="btn-sm" data-status-for="${o.id}">
          ${state.statuses.map((s) => `<option value="${s.value}" ${s.value === o.status ? 'selected' : ''}>${escapeHtml(s.label)}</option>`).join('')}
        </select>
      </td>
      <td class="small muted">${escapeHtml(formatDate(o.created_at))}</td>
      <td class="actions">
        <button class="btn btn-sm" data-view-order="${o.id}">Xem</button>
        <button class="btn btn-sm btn-danger" data-delete-order="${o.id}">Xoá</button>
      </td>
    </tr>`).join('');
}

async function updateOrderStatus(id, status) {
  try {
    await api(`/api/admin/orders/${id}/status`, { method: 'PUT', body: { status } });
    toast(`Đơn hàng đã chuyển sang "${statusLabel(status)}"`, 'success');
    await loadAll();
  } catch (err) {
    handleApiError(err);
  }
}

async function viewOrder(id) {
  try {
    const { order } = await api(`/api/admin/orders/${id}`);

    $('#order-detail-title').textContent = `Đơn hàng ${order.code}`;
    $('#order-detail-body').innerHTML = `
      <div class="field-row">
        <div><div class="small muted">Khách hàng</div><strong>${escapeHtml(order.customer_name)}</strong></div>
        <div><div class="small muted">Điện thoại</div><strong>${escapeHtml(order.phone)}</strong></div>
      </div>
      <div class="field"><div class="small muted">Email</div>${escapeHtml(order.email || '—')}</div>
      <div class="field"><div class="small muted">Địa chỉ giao hàng</div>${escapeHtml(order.address)}</div>
      ${order.note ? `<div class="field"><div class="small muted">Ghi chú</div>${escapeHtml(order.note)}</div>` : ''}
      <div class="field">
        <span class="badge ${STATUS_BADGE[order.status] ?? ''}">${escapeHtml(statusLabel(order.status))}</span>
        <span class="small muted"> · Đặt lúc ${escapeHtml(formatDate(order.created_at))}</span>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Sản phẩm</th><th>Đơn giá</th><th>SL</th><th>Thành tiền</th></tr></thead>
          <tbody>
            ${order.items.map((item) => `
              <tr>
                <td>${escapeHtml(item.name)}</td>
                <td>${formatPrice(item.price)}</td>
                <td>${item.quantity}</td>
                <td>${formatPrice(item.price * item.quantity)}</td>
              </tr>`).join('')}
          </tbody>
          <tfoot>
            <tr><th colspan="3">Tổng cộng</th><th>${formatPrice(order.total)}</th></tr>
          </tfoot>
        </table>
      </div>`;

    $('#order-modal').classList.remove('hidden');
  } catch (err) {
    handleApiError(err);
  }
}

async function deleteOrder(id) {
  if (!confirm('Xoá đơn hàng này? Thao tác này không thể hoàn tác.')) return;

  try {
    await api(`/api/admin/orders/${id}`, { method: 'DELETE' });
    toast('Đã xoá đơn hàng', 'success');
    await loadAll();
  } catch (err) {
    handleApiError(err);
  }
}

/* ---------- Tải dữ liệu ---------- */

async function loadAll() {
  if (!state.user) return;

  try {
    const [{ stats }, { products }, { categories }, { orders }, meta] = await Promise.all([
      api('/api/admin/stats'),
      api('/api/admin/products'),
      api('/api/admin/categories'),
      api('/api/admin/orders'),
      api('/api/meta'),
    ]);

    state.products = products;
    state.categories = categories;
    state.orders = orders;
    state.statuses = meta.order_statuses;

    renderStats(stats);
    renderProducts();
    renderCategories();
    renderOrders();
    renderStatusFilter();
  } catch (err) {
    handleApiError(err);
  }
}

function renderStatusFilter() {
  const select = $('#order-filter');
  const current = select.value;
  select.innerHTML = '<option value="">Tất cả trạng thái</option>'
    + state.statuses.map((s) => `<option value="${s.value}">${escapeHtml(s.label)}</option>`).join('');
  select.value = current;
}

/* ---------- Sự kiện ---------- */

function bindEvents() {
  $('#login-form').addEventListener('submit', handleLogin);
  $('#logout-btn').addEventListener('click', handleLogout);
  $$('.tab-btn').forEach((btn) => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));

  $('#add-product-btn').addEventListener('click', () => openProductModal());
  $('#add-category-btn').addEventListener('click', () => openCategoryModal());
  $('#product-form').addEventListener('submit', saveProduct);
  $('#category-form').addEventListener('submit', saveCategory);
  $('#product-search').addEventListener('input', renderProducts);
  $('#order-filter').addEventListener('change', renderOrders);

  $('#product-rows').addEventListener('click', (event) => {
    const { editProduct, deleteProduct: toDelete } = event.target.dataset;
    if (editProduct) openProductModal(state.products.find((p) => p.id === Number(editProduct)));
    else if (toDelete) deleteProduct(Number(toDelete));
  });

  $('#category-rows').addEventListener('click', (event) => {
    const { editCategory, deleteCategory: toDelete } = event.target.dataset;
    if (editCategory) openCategoryModal(state.categories.find((c) => c.id === Number(editCategory)));
    else if (toDelete) deleteCategory(Number(toDelete));
  });

  $('#order-rows').addEventListener('click', (event) => {
    const { viewOrder: toView, deleteOrder: toDelete } = event.target.dataset;
    if (toView) viewOrder(Number(toView));
    else if (toDelete) deleteOrder(Number(toDelete));
  });

  $('#order-rows').addEventListener('change', (event) => {
    const id = event.target.dataset.statusFor;
    if (id) updateOrderStatus(Number(id), event.target.value);
  });

  $$('[data-close-modal]').forEach((btn) => {
    btn.addEventListener('click', () => $(`#${btn.dataset.closeModal}`).classList.add('hidden'));
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') $$('.modal').forEach((modal) => modal.classList.add('hidden'));
  });
}

bindEvents();
await checkSession();
await loadAll();
