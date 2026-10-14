// 正式页面的隔离预览：只注入开发 Chrome API，不改写正式扩展存档。
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.woff':'font/woff','.woff2':'font/woff2','.json':'application/json; charset=utf-8','.ico':'image/x-icon'};
const server = http.createServer((req,res) => {
  let url,name;
  try { url=new URL(req.url,'http://127.0.0.1');name=decodeURIComponent(url.pathname); } catch { res.writeHead(400);res.end();return; }
  if(name==='/'){res.writeHead(302,{Location:'/newtab.html'});res.end();return;}
  const file=path.resolve(root,'.'+name),relative=path.relative(root,file);
  if(relative.startsWith('..')||path.isAbsolute(relative)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
  let content=fs.readFileSync(file);
  if(['/newtab.html','/options.html','/popup.html'].includes(name))content=content.toString('utf8').replace('<head>','<head><script src="/js/modules/orchard-core.js"></script><script src="/js/modules/orchard-service.js"></script><script src="/docs/prototypes/home/chrome-preview.js"></script>');
  res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(content);
});
server.listen(8851,'127.0.0.1',()=>console.log('正式果园隔离预览：http://127.0.0.1:8851/newtab.html'));
server.on('error',error=>{console.error(error.message);process.exitCode=1;});
