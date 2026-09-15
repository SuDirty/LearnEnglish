import { createServer } from 'node:http';
import { readFile, mkdtemp, rm, mkdir } from 'node:fs/promises';
import { dirname, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
const base = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const server = createServer(async (req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  const file = /^\/watch\/\d+$/.test(path) ? resolve(base, 'scripts/fixtures/review.html') : resolve(base, '.' + path);
  if (!file.startsWith(base + '/')) { res.writeHead(403).end(); return; }
  try { res.setHeader('Content-Type', extname(file) === '.html' ? 'text/html' : 'text/javascript'); res.end(await readFile(file)); }
  catch { res.writeHead(404).end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const profile = await mkdtemp(resolve(tmpdir(), 'subtitle-pocket-test-'));
await mkdir(resolve(base, 'artifacts'), { recursive: true });
try {
  const child = spawn(process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
    '--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-background-networking',
    '--disable-gpu', '--disable-dev-shm-usage', '--no-proxy-server', '--user-data-dir=' + profile,
    '--window-size=1440,1000', '--virtual-time-budget=15000', '--dump-dom',
    '--screenshot=' + resolve(base, 'artifacts/review.png'), `http://127.0.0.1:${server.address().port}/watch/123`
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '', cleanedUp = false;
  function finish() {
    // Some Chrome builds stay alive after --dump-dom and --screenshot complete.
    if (!cleanedUp && stdout.includes('</html>') && /bytes written to file/.test(stderr)) {
      cleanedUp = true; child.kill('SIGTERM');
    }
  }
  child.stdout.on('data', c => { stdout += c; finish(); });
  child.stderr.on('data', c => { stderr += c; finish(); });
  const timer = setTimeout(() => child.kill('SIGKILL'), 45000);
  const code = await new Promise((r, reject) => { child.on('exit', r); child.on('error', reject); }); clearTimeout(timer);
  const result = /<pre id="results">([\s\S]*?)<\/pre>/.exec(stdout)?.[1];
  console.log(result || stderr.slice(-3000));
  if ((!cleanedUp && code !== 0) || !stdout.includes('data-result="pass"')) process.exitCode = 1;
} finally { server.close(); await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); }
