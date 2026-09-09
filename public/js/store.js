import { $, api, escapeHtml, formatPrice, toast } from './common.js';

const CART_KEY = 'shop_cart_v1';

const state = {
  products: [],
  categories: [],
  cart: loadCart(),
};

/* ---------- Giỏ hàng (lưu trong localStorage) ---------- */

function loadCart() {
  try {
    const raw = JSON.parse(localStorage.getItem(CART_KEY) ?? '[]');
    if (!Array.isArray(raw)) return [];
    return raw.filter((line) => Number.isInteger(line?.id) && Number.isInteger(line?.quantity) && line.quantity > 0);
  } catch {
    return [];
  }
}

function saveCart() {
  try {
    localStorage.setItem(CART_KEY, JSON.stringify(state.cart));
  } catch {
    /* localStorage có thể bị chặn — giỏ hàng vẫn hoạt động trong phiên hiện tại */
  }
}

function cartTotal() {
  return state.cart.reduce((sum, line) => sum + line.price * line.quantity, 0);
}

function cartCount() {
  return state.cart.reduce((sum, line) => sum + line.quantity, 0);
}

function addToCart(product) {
  const line = state.cart.find((item) => item.id === product.id);
  const inCart = line?.quantity ?? 0;

  if (product.stock <= inCart) {
    toast(`"${product.name}" chỉ còn ${product.stock} sản phẩm`, 'error');
    return;
  }

  if (line) line.quantity += 1;
  else state.cart.push({ id: product.id, name: product.name, price: product.price, image_url: product.image_url, quantity: 1 });

  saveCart();
  renderCart();
  toast(`Đã thêm "${product.name}" vào giỏ`, 'success');
}

function changeQuantity(id, delta) {
  const line = state.cart.find((item) => item.id === id);
  if (!line) return;

  const product = state.products.find((item) => item.id === id);
  const nextQuantity = line.quantity + delta;

  if (product && delta > 0 && nextQuantity > product.stock) {
    toast(`Chỉ còn ${product.stock} sản phẩm trong kho`, 'error');
    return;
  }

  if (nextQuantity <= 0) state.cart = state.cart.filter((item) => item.id !== id);
  else line.quantity = nextQuantity;

  saveCart();
  renderCart();
}

function removeFromCart(id) {
  state.cart = state.cart.filter((item) => item.id !== id);
  saveCart();
  renderCart();
}

/* ---------- Hiển thị ---------- */

function productCard(product) {
  const soldOut = product.stock <= 0;

  return `
    <article class="product-card">
      <img class="product-thumb" src="${escapeHtml(product.image_url || placeholder(product.name))}"
           alt="${escapeHtml(product.name)}" loading="lazy"
           onerror="this.src='${placeholder(product.name)}'">
      <div class="product-body">
        ${product.category ? `<span class="badge badge-brand">${escapeHtml(product.category.name)}</span>` : ''}
        <div class="product-name">${escapeHtml(product.name)}</div>
        <div class="product-price">${formatPrice(product.price)}</div>
        <div class="small muted">${soldOut ? 'Hết hàng' : `Còn ${product.stock} sản phẩm`}</div>
        <button class="btn btn-primary" data-add="${product.id}" ${soldOut ? 'disabled' : ''}>
          ${soldOut ? 'Hết hàng' : 'Thêm vào giỏ'}
        </button>
      </div>
    </article>`;
}

function placeholder(name) {
  const letter = String(name || '?').trim().charAt(0).toUpperCase() || '?';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300">`
    + `<rect width="400" height="300" fill="#e2e5ea"/>`
    + `<text x="50%" y="50%" font-size="90" font-family="sans-serif" fill="#8b95a3"`
    + ` text-anchor="middle" dominant-baseline="central">${escapeHtml(letter)}</text></svg>`;
  // encodeURIComponent loại bỏ dấu nháy nên chuỗi này an toàn khi nhúng vào thuộc tính HTML.
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function renderProducts() {
  const host = $('#product-grid');

  if (state.products.length === 0) {
    host.innerHTML = '<div class="empty">Không tìm thấy sản phẩm nào phù hợp.</div>';
    return;
  }

  host.innerHTML = state.products.map(productCard).join('');
}

function renderCart() {
  const count = cartCount();
  $('#cart-count').textContent = count;
  $('#cart-count').classList.toggle('hidden', count === 0);

  const body = $('#cart-body');

  if (state.cart.length === 0) {
    body.innerHTML = '<div class="empty">Giỏ hàng đang trống.</div>';
  } else {
    body.innerHTML = state.cart.map((line) => `
      <div class="cart-line">
        <img src="${escapeHtml(line.image_url || placeholder(line.name))}" alt=""
             onerror="this.src='${placeholder(line.name)}'">
        <div class="grow">
          <div><strong>${escapeHtml(line.name)}</strong></div>
          <div class="small muted">${formatPrice(line.price)}</div>
          <div class="row" style="margin-top:.35rem">
            <span class="qty">
              <button data-qty="-1" data-id="${line.id}" aria-label="Giảm">−</button>
              <span>${line.quantity}</span>
              <button data-qty="1" data-id="${line.id}" aria-label="Tăng">+</button>
            </span>
            <button class="btn btn-sm btn-danger" data-remove="${line.id}">Xoá</button>
          </div>
        </div>
        <div><strong>${formatPrice(line.price * line.quantity)}</strong></div>
      </div>`).join('');
  }

  $('#cart-total').textContent = formatPrice(cartTotal());
  $('#checkout-btn').disabled = state.cart.length === 0;
}

function renderCategories() {
  const select = $('#filter-category');
  select.innerHTML = '<option value="">Tất cả danh mục</option>'
    + state.categories.map((c) => `<option value="${escapeHtml(c.slug)}">${escapeHtml(c.name)}</option>`).join('');
}

/* ---------- Tải dữ liệu ---------- */

async function loadProducts() {
  const params = new URLSearchParams();
  const q = $('#filter-search').value.trim();
  const category = $('#filter-category').value;

  if (q) params.set('q', q);
  if (category) params.set('category', category);

  try {
    const { products } = await api(`/api/products?${params}`);
    state.products = products;
    renderProducts();
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function loadCategories() {
  try {
    const { categories } = await api('/api/categories');
    state.categories = categories;
    renderCategories();
  } catch (err) {
    toast(err.message, 'error');
  }
}

/* ---------- Đặt hàng ---------- */

function openCart(open) {
  $('#cart-drawer').classList.toggle('hidden', !open);
  $('#cart-overlay').classList.toggle('hidden', !open);
}

function openCheckout(open) {
  $('#checkout-modal').classList.toggle('hidden', !open);
  if (open) openCart(false);
}

async function submitOrder(event) {
  event.preventDefault();

  const form = event.target;
  const submitButton = $('button[type="submit"]', form);
  const payload = Object.fromEntries(new FormData(form).entries());
  payload.items = state.cart.map((line) => ({ product_id: line.id, quantity: line.quantity }));

  submitButton.disabled = true;
  try {
    const { order } = await api('/api/orders', { method: 'POST', body: payload });

    state.cart = [];
    saveCart();
    renderCart();
    form.reset();
    openCheckout(false);

    $('#success-code').textContent = order.code;
    $('#success-total').textContent = formatPrice(order.total);
    $('#success-modal').classList.remove('hidden');

    loadProducts();
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    submitButton.disabled = false;
  }
}

/* ---------- Khởi động ---------- */

function bindEvents() {
  $('#product-grid').addEventListener('click', (event) => {
    const id = Number(event.target.dataset.add);
    if (!id) return;

    const product = state.products.find((item) => item.id === id);
    if (product) addToCart(product);
  });

  $('#cart-body').addEventListener('click', (event) => {
    const { qty, id, remove } = event.target.dataset;
    if (remove) removeFromCart(Number(remove));
    else if (qty) changeQuantity(Number(id), Number(qty));
  });

  $('#cart-toggle').addEventListener('click', () => openCart(true));
  $('#cart-close').addEventListener('click', () => openCart(false));
  $('#cart-overlay').addEventListener('click', () => openCart(false));
  $('#checkout-btn').addEventListener('click', () => openCheckout(true));
  $('#checkout-close').addEventListener('click', () => openCheckout(false));
  $('#success-close').addEventListener('click', () => $('#success-modal').classList.add('hidden'));
  $('#checkout-form').addEventListener('submit', submitOrder);

  let searchTimer;
  $('#filter-search').addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(loadProducts, 250);
  });
  $('#filter-category').addEventListener('change', loadProducts);

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    openCart(false);
    openCheckout(false);
    $('#success-modal').classList.add('hidden');
  });
}

bindEvents();
renderCart();
loadCategories();
loadProducts();
