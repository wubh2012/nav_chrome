// 开发专用：首页四个原型在同一 /newtab.html?variant=A-D 路径切换。
// 只使用演示数据和内存版 Chrome API；原型文件不包含在扩展打包清单中。
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const base = '/docs/prototypes/home';
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.woff': 'font/woff' };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  const variant = ['A', 'B', 'C', 'D'].includes(url.searchParams.get('variant')) ? url.searchParams.get('variant') : 'A';
  let name = decodeURIComponent(url.pathname);
  if (name === '/') name = `${base}/compare.html`;
  if (name === '/newtab.html' && variant !== 'A') name = `${base}/prototype.html`;
  const file = path.resolve(root, '.' + name);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404); res.end('Not found'); return;
  }
  let content = fs.readFileSync(file);
  if (name === '/newtab.html') {
    content = content.toString().replace('<head>', `<head><base href="/"><script src="${base}/chrome-preview.js"></script>`);
    if (url.searchParams.has('variant')) content = content.replace('</head>', `<link rel="stylesheet" href="${base}/switcher.css"></head>`)
      .replace('</body>', `<script src="${base}/switcher.js"></script></body>`);
  }
  if (name === '/options.html' || name === '/popup.html') content = content.toString().replace('<head>', `<head><script src="${base}/chrome-preview.js"></script>`);
  res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  res.end(content);
});
server.listen(8766, '127.0.0.1', () => console.log('首页原型选择页：http://127.0.0.1:8766/'));
server.on('error', error => { console.error(error.message); process.exitCode = 1; });
