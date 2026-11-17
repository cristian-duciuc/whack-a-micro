import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// Serves the page in web/ on this computer only, for trying changes before they go to
// GitHub Pages. Input ties its approval to the page's origin, so keep the same port to keep
// the same pairing.
const PORT = Number(process.env.PORT ?? 5174);
const folder = fileURLToPath(new URL('web', import.meta.url));
const TYPES = {
  '.html': 'text/html',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
};

createServer(async (request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  const file = normalize(join(folder, decodeURIComponent(pathname === '/' ? '/index.html' : pathname)));
  try {
    // Refuse anything outside web/ and any file type the page doesn't use.
    if (!file.startsWith(folder + sep) || !TYPES[extname(file)] || request.method !== 'GET') {
      throw Object.assign(new Error(), { code: 'ENOENT' });
    }
    const body = await readFile(file);
    response.writeHead(200, { 'Content-Type': `${TYPES[extname(file)]}; charset=utf-8`, 'Cache-Control': 'no-store' });
    response.end(body);
  } catch (error) {
    response.writeHead(error.code === 'ENOENT' || error.code === 'EISDIR' ? 404 : 500).end();
  }
}).listen(PORT, '127.0.0.1', () => {
  console.log(`Whack-a-Micro is at http://localhost:${PORT}  (Ctrl+C to stop)`);
});
