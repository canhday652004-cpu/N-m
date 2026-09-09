import { createServer } from 'node:http';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ensureAdminUser } from './lib/auth.js';
import { HttpError, sendJson } from './lib/http.js';
import { serveStatic } from './lib/static.js';
import { handleApi } from './routes/api.js';
import { seedIfEmpty } from './seed.js';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = join(rootDir, 'public');

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? '0.0.0.0';

export function createApp() {
  return createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);

    try {
      if (await handleApi(req, res, url)) return;
    } catch (err) {
      if (res.headersSent) return res.end();

      if (err instanceof HttpError) {
        return sendJson(res, err.status, { error: err.message, details: err.details });
      }

      console.error('Lỗi không mong đợi:', err);
      return sendJson(res, 500, { error: 'Lỗi máy chủ' });
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return sendJson(res, 405, { error: 'Phương thức không được hỗ trợ' });
    }

    try {
      if (await serveStatic(req, res, publicDir, url.pathname)) return;

      // Không khớp file nào: trả về trang 404 của cửa hàng.
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<h1>404 — Không tìm thấy trang</h1><p><a href="/">Về trang chủ</a></p>');
    } catch (err) {
      console.error('Lỗi khi gửi file tĩnh:', err);
      if (!res.headersSent) sendJson(res, 500, { error: 'Lỗi máy chủ' });
      else res.end();
    }
  });
}

/** Chỉ tự chạy khi được gọi trực tiếp (`node server/index.js`), không chạy khi bị import trong test. */
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isMain) {
  const created = ensureAdminUser();
  const seeded = seedIfEmpty();

  createApp().listen(PORT, HOST, () => {
    console.log(`\n  Cửa hàng   →  http://localhost:${PORT}`);
    console.log(`  Trang admin →  http://localhost:${PORT}/admin`);

    if (seeded) console.log(`\n  Đã tạo ${seeded.products} sản phẩm mẫu trong ${seeded.categories} danh mục.`);
    if (created) {
      console.log(`\n  Tài khoản quản trị: ${created.username} / ${created.password}`);
      console.log('  (Đổi bằng biến môi trường ADMIN_USER và ADMIN_PASSWORD trước lần chạy đầu tiên.)');
    }
    console.log('');
  });
}
