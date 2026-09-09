import { db } from './db.js';
import { slugify } from './lib/validate.js';

const CATEGORIES = ['Điện thoại', 'Laptop', 'Phụ kiện', 'Đồng hồ'];

const PRODUCTS = [
  {
    category: 'Điện thoại',
    name: 'Điện thoại Aurora X5',
    price: 12_990_000,
    stock: 25,
    description: 'Màn hình OLED 6.7 inch 120Hz, camera 50MP, pin 5000mAh sạc nhanh 67W.',
    image_url: 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=800&q=80',
  },
  {
    category: 'Điện thoại',
    name: 'Điện thoại Nova Lite',
    price: 5_490_000,
    stock: 40,
    description: 'Lựa chọn phổ thông: chip 8 nhân, RAM 8GB, pin 5000mAh, hỗ trợ 5G.',
    image_url: 'https://images.unsplash.com/photo-1598327105666-5b89351aff97?w=800&q=80',
  },
  {
    category: 'Laptop',
    name: 'Laptop Zenith Pro 14',
    price: 28_900_000,
    stock: 12,
    description: 'CPU 10 nhân, 16GB RAM, SSD 512GB, màn hình 14 inch 2.8K, nặng 1.2kg.',
    image_url: 'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=800&q=80',
  },
  {
    category: 'Laptop',
    name: 'Laptop Vega Gaming 15',
    price: 34_500_000,
    stock: 7,
    description: 'Card đồ hoạ rời 8GB, màn hình 165Hz, tản nhiệt buồng hơi, bàn phím RGB.',
    image_url: 'https://images.unsplash.com/photo-1603302576837-37561b2e2302?w=800&q=80',
  },
  {
    category: 'Phụ kiện',
    name: 'Tai nghe Echo Buds 2',
    price: 1_890_000,
    stock: 60,
    description: 'Chống ồn chủ động, thời lượng 28 giờ kèm hộp sạc, kháng nước IPX4.',
    image_url: 'https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=800&q=80',
  },
  {
    category: 'Phụ kiện',
    name: 'Bàn phím cơ Kaze 68',
    price: 1_290_000,
    stock: 33,
    description: 'Layout 65%, switch êm, kết nối Bluetooth và USB-C, keycap PBT.',
    image_url: 'https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=800&q=80',
  },
  {
    category: 'Phụ kiện',
    name: 'Sạc dự phòng Volt 20.000mAh',
    price: 690_000,
    stock: 0,
    description: 'Công suất 22.5W, hai cổng USB-C, màn hình hiển thị phần trăm pin.',
    image_url: 'https://images.unsplash.com/photo-1609091839311-d5365f9ff1c5?w=800&q=80',
  },
  {
    category: 'Đồng hồ',
    name: 'Đồng hồ thông minh Pulse S3',
    price: 3_290_000,
    stock: 18,
    description: 'Đo nhịp tim và SpO2, GPS tích hợp, pin 14 ngày, hơn 100 chế độ tập.',
    image_url: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800&q=80',
  },
];

/**
 * Nạp dữ liệu mẫu nếu CSDL còn trống.
 * @returns {{categories: number, products: number} | null}
 */
export function seedIfEmpty() {
  const existing = db.prepare('SELECT COUNT(*) AS n FROM products').get().n;
  if (existing > 0) return null;

  const insertCategory = db.prepare('INSERT INTO categories (name, slug) VALUES (?, ?)');
  const insertProduct = db.prepare(`
    INSERT INTO products (name, slug, description, price, stock, image_url, category_id, active)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1)
  `);

  db.exec('BEGIN');
  try {
    const categoryIds = new Map();
    for (const name of CATEGORIES) {
      const slug = slugify(name);
      const existingCategory = db.prepare('SELECT id FROM categories WHERE slug = ?').get(slug);
      const id = existingCategory?.id ?? Number(insertCategory.run(name, slug).lastInsertRowid);
      categoryIds.set(name, id);
    }

    for (const product of PRODUCTS) {
      insertProduct.run(
        product.name,
        slugify(product.name),
        product.description,
        product.price,
        product.stock,
        product.image_url,
        categoryIds.get(product.category) ?? null,
      );
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  return { categories: CATEGORIES.length, products: PRODUCTS.length };
}

const isMain = process.argv[1]?.endsWith('seed.js');
if (isMain) {
  const result = seedIfEmpty();
  console.log(result ? `Đã nạp ${result.products} sản phẩm mẫu.` : 'CSDL đã có sản phẩm, bỏ qua.');
}
