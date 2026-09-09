import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

async function statFile(path) {
  try {
    const info = await stat(path);
    return info.isFile() ? info : null;
  } catch {
    return null;
  }
}

/**
 * Trả file tĩnh trong thư mục public.
 * @returns {Promise<boolean>} true nếu đã gửi response.
 */
export async function serveStatic(req, res, rootDir, urlPath) {
  const decoded = decodeURIComponent(urlPath);

  // Chặn path traversal: chuẩn hoá rồi ép đường dẫn phải nằm trong rootDir.
  const safeSuffix = normalize(decoded).replace(/^(\.\.[/\\])+/, '');
  const base = resolve(rootDir);
  let filePath = resolve(join(base, safeSuffix));

  if (filePath !== base && !filePath.startsWith(base + sep)) return false;

  let info = await statFile(filePath);

  if (!info && !extname(filePath)) {
    const asHtml = `${filePath}.html`;
    info = await statFile(asHtml);
    if (info) filePath = asHtml;
  }

  if (!info) {
    const asIndex = join(filePath, 'index.html');
    info = await statFile(asIndex);
    if (info) filePath = asIndex;
  }

  if (!info) return false;

  const type = MIME_TYPES[extname(filePath).toLowerCase()] ?? 'application/octet-stream';
  const isHtml = type.startsWith('text/html');

  res.writeHead(200, {
    'Content-Type': type,
    'Content-Length': info.size,
    'Cache-Control': isHtml ? 'no-cache' : 'public, max-age=3600',
  });

  if (req.method === 'HEAD') {
    res.end();
    return true;
  }

  await new Promise((resolveDone, rejectDone) => {
    const stream = createReadStream(filePath);
    stream.on('error', rejectDone);
    stream.on('end', resolveDone);
    stream.pipe(res);
  });

  return true;
}
