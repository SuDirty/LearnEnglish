import { readFile, readdir, lstat, mkdir, mkdtemp, copyFile, rm, writeFile } from 'node:fs/promises';
import { resolve, join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'extension');
const manifest = JSON.parse(await readFile(join(source, 'manifest.json'), 'utf8'));
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
if (manifest.manifest_version !== 3 || manifest.version !== pkg.version) throw new Error('Manifest V3 and matching package version required.');
if (manifest.key || manifest.update_url) throw new Error('Store package must not contain a development key or external update URL.');
const files = [];
async function collect(directory, prefix = '') {
  for (const name of (await readdir(directory)).sort()) {
    if (name.startsWith('.')) continue;
    const relative = prefix + name, path = join(directory, name), stat = await lstat(path);
    if (stat.isSymbolicLink()) throw new Error(`Symlink is not allowed: ${relative}`);
    if (stat.isDirectory()) {
      if (!['dictionary', 'licenses', 'icons'].includes(relative)) throw new Error(`Unexpected extension directory: ${relative}`);
      await collect(path, relative + '/');
    } else {
      if (!['.js', '.json', '.html', '.css', '.txt', '.png', '.svg'].includes(extname(name))) throw new Error(`Unexpected extension file: ${relative}`);
      files.push(relative);
    }
  }
}
await collect(source);
const references = [manifest.background.service_worker, manifest.action.default_popup, manifest.options_page,
  ...Object.values(manifest.icons || {}), ...Object.values(manifest.action.default_icon || {}),
  ...manifest.content_scripts.flatMap(script => [...(script.js || []), ...(script.css || [])])];
if (!manifest.icons?.['128']) throw new Error('Store requires a 128px icon.');
for (const path of references) if (!files.includes(path)) throw new Error(`Missing manifest resource: ${path}`);
for (const size of [16, 32, 48, 128]) {
  const png = await readFile(join(source, manifest.icons[size]));
  if (png.toString('hex', 0, 8) !== '89504e470d0a1a0a' || png.readUInt32BE(16) !== size || png.readUInt32BE(20) !== size) throw new Error(`Invalid ${size}px icon.`);
}
const work = await mkdtemp(join(tmpdir(), 'subtitle-store-'));
const destination = join(root, 'releases', 'chrome-web-store');
await mkdir(destination, { recursive: true });
const name = `subtitle-pocket-v${manifest.version}-chrome-web-store.zip`;
try {
  const payload = join(work, 'payload');
  await mkdir(payload);
  for (const relative of files) {
    await mkdir(dirname(join(payload, relative)), { recursive: true });
    await copyFile(join(source, relative), join(payload, relative));
  }
  // A fresh staging directory prevents old ZIP entries from surviving rebuilds.
  await exec('zip', ['-X', '-q', '-9', join(work, name), ...files], { cwd: payload });
  await exec('unzip', ['-tq', join(work, name)]);
  const listing = (await exec('unzip', ['-Z1', join(work, name)])).stdout.trim().split('\n').sort();
  if (JSON.stringify(listing) !== JSON.stringify([...files].sort())) throw new Error('ZIP file list differs from staged extension.');
  for (const relative of files) {
    const zipped = (await exec('unzip', ['-p', join(work, name), relative], { encoding: 'buffer', maxBuffer: 50 * 1024 * 1024 })).stdout;
    if (!zipped.equals(await readFile(join(payload, relative)))) throw new Error(`ZIP payload mismatch: ${relative}`);
  }
  await copyFile(join(work, name), join(destination, name));
  const bytes = await readFile(join(destination, name));
  const hash = createHash('sha256').update(bytes).digest('hex');
  await writeFile(join(destination, name + '.sha256'), `${hash}  ${name}\n`);
  console.log(`Verified ${files.length} extension files; manifest.json is at ZIP root.\n${join(destination, name)}\n${bytes.length} bytes\nSHA-256 ${hash}`);
} finally { await rm(work, { recursive: true, force: true }); }
