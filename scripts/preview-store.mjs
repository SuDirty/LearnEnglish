// Local screenshot fixture: renders the real library using explicitly labelled sample entries.
// No real Chrome profile, Netflix account, API key or AI service is used.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, extname } from 'node:path';
const root = fileURLToPath(new URL('../extension/', import.meta.url));
const samples = [
  ['word', 'curious', '好奇的', 'Stay curious and keep asking questions.'],
  ['phrase', 'take your time', '慢慢來；不用急', 'Take your time. We can start when you are ready.'],
  ['sentence', 'Every little step counts.', '每一小步都有意義。', 'Every little step counts.'],
  ['word', 'notice', '注意到；察覺', 'Did you notice anything different?'],
  ['phrase', 'give it a try', '試試看', 'You can give it a try tomorrow.'],
  ['sentence', 'Let’s figure it out together.', '我們一起想辦法。', 'Let’s figure it out together.'],
].map(([kind, text, translation, context], index) => ({ id: `store-example-${index}`, kind, text, translation, context,
  title: '教學示範資料', url: '', time: 60 + index * 35, createdAt: '2026-09-15T00:00:00Z' }));
const shim = `<style>html{width:1280px}</style><script>const demoEntries=${JSON.stringify(samples)};window.chrome={runtime:{sendMessage:async m=>m.type==='list'?{ok:true,entries:demoEntries}:{ok:false,error:'此頁為商店截圖用示範資料。'}},storage:{onChanged:{addListener(){}}}};</script>`;
const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
  const file = resolve(root, '.' + (path === '/' ? '/library.html' : path));
  if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
  try {
    let content = await readFile(file);
    if (file.endsWith('/library.html')) content = Buffer.from(content.toString().replace('<script src="library.js"', shim + '<script src="library.js"'));
    res.setHeader('Content-Type', { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' }[extname(file)] || 'application/octet-stream');
    res.end(content);
  } catch { res.writeHead(404).end(); }
});
server.listen(0, '127.0.0.1', () => console.log(`Screenshot preview: http://127.0.0.1:${server.address().port}/library.html`));
