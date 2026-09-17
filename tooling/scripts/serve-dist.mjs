import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join, normalize, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8'
};

function isOpsStaticPath(pathname) {
  return pathname.startsWith('/assets/')
    || pathname.startsWith('/icons/')
    || pathname.startsWith('/admin/')
    || pathname === '/admin'
    || pathname === '/sw.js'
    || pathname === '/manifest.webmanifest'
    || pathname === '/favicon.svg'
    || pathname === '/_headers'
    || pathname === '/_redirects';
}

function resolveSafe(root, requestUrl, { opsMode = false } = {}) {
  const url = new URL(requestUrl, 'http://127.0.0.1');
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/admin') pathname = '/admin/';
  if (opsMode) {
    if (!isOpsStaticPath(pathname) || pathname === '/' || pathname === '' || pathname === '/index.html') {
      pathname = '/admin/';
    }
  }
  if (pathname.endsWith('/')) pathname += 'index.html';
  const resolved = normalize(join(root, pathname));
  const rel = relative(root, resolved);
  if (rel.startsWith('..') || rel.includes(`..${sep}`)) return null;
  return resolved;
}

export function startStaticServer(root, { host = '127.0.0.1', port = 0, opsMode = false } = {}) {
  const server = createServer(async (request, response) => {
    try {
      const filePath = resolveSafe(root, request.url || '/', { opsMode });
      if (!filePath) {
        response.writeHead(403).end('Forbidden');
        return;
      }
      const body = await readFile(filePath);
      response.writeHead(200, {
        'Content-Type': mimeTypes[extname(filePath)] || 'application/octet-stream',
        'Cache-Control': 'no-store'
      });
      response.end(body);
    } catch {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not Found');
    }
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      const address = server.address();
      const actualPort = typeof address === 'object' && address ? address.port : port;
      resolve({
        server,
        port: actualPort,
        url: `http://${host}:${actualPort}`,
        close: () => new Promise((done) => server.close(done))
      });
    });
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'dist');
  const memberPort = Number(process.env.PORT || 4173);
  const opsPort = Number(process.env.OPS_PORT || 4174);
  const member = await startStaticServer(root, { port: memberPort, opsMode: false });
  const ops = await startStaticServer(root, { port: opsPort, opsMode: true });
  console.log(`회원 dist: ${member.url}`);
  console.log(`운영자 dist: ${ops.url}/admin/`);
}
