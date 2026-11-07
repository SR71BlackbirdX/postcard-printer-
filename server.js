/**
 * server.js — tiny, dependency-free development server.
 *
 * Start:   node server.js
 * URL:     http://127.0.0.1:5173/
 * Stop:    Ctrl+C
 *
 * Uses only Node built-ins (http, fs, path) — no npm install, no framework.
 * Safety: binds to 127.0.0.1 only (never the public network), serves files
 * from this folder only, returns 404 for missing files, 403 for anything
 * trying to escape the project directory.
 * If the port is occupied the server exits with a clear error instead of
 * silently picking a different port.
 */

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const HOST = '127.0.0.1';
const PORT = Number(process.env.PORT) || 5173;
const ROOT = __dirname;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

function send(res, status, message, method) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(method === 'HEAD' ? undefined : message);
}

const server = http.createServer((req, res) => {
  // Only GET/HEAD make sense for a static dev server.
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    send(res, 405, '405 Method Not Allowed', req.method);
    return;
  }

  // Parse and decode the requested path.
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch (err) {
    send(res, 400, '400 Bad Request', req.method);
    return;
  }

  // Resolve the file and make sure it stays inside the project folder.
  const filePath = path.normalize(path.join(ROOT, pathname));
  if (filePath !== ROOT && !filePath.startsWith(ROOT + path.sep)) {
    send(res, 403, '403 Forbidden', req.method);
    return;
  }

  fs.stat(filePath, (err, stat) => {
    if (err) {
      send(res, 404, '404 Not Found', req.method);
      return;
    }

    // A directory gets its index.html (if any).
    const target = stat.isDirectory() ? path.join(filePath, 'index.html') : filePath;

    fs.readFile(target, (readErr, data) => {
      if (readErr) {
        send(res, 404, '404 Not Found', req.method);
        return;
      }
      const type = MIME_TYPES[path.extname(target).toLowerCase()] || 'application/octet-stream';
      res.writeHead(200, {
        'Content-Type': type,
        'Content-Length': data.length,
        // Development server: never let the browser keep a stale copy —
        // this avoids "my edits don't show up" confusion.
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        'Pragma': 'no-cache',
        'Expires': '0'
      });
      res.end(req.method === 'HEAD' ? undefined : data);
    });
  });
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error('ERROR: port ' + PORT + ' is already in use.');
    console.error('Free that port (close the program using it) and run "node server.js" again.');
    console.error('Or choose another port:  $env:PORT=5174; node server.js');
  } else {
    console.error('Server error:', err.message);
  }
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log('Indian Postcard Printer — local dev server');
  console.log('  URL:  http://' + HOST + ':' + PORT + '/');
  console.log('  Stop: press Ctrl+C');
});
