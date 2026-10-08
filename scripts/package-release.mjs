import { cp, mkdir, mkdtemp, readFile, rm, copyFile, access, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { createHash, createPublicKey } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
const exec = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(await readFile(join(root, 'extension/manifest.json'), 'utf8'));
const version = manifest.version;
const packageJson = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
if (packageJson.version !== version) throw new Error('Package and extension versions differ.');
const keyPath = resolve(process.env.EXTENSION_SIGNING_KEY || join(root, 'extension.pem'));
const publicKey = createPublicKey(await readFile(keyPath)).export({ type: 'spki', format: 'der' });
const id = createHash('sha256').update(publicKey).digest('hex').slice(0, 32).replace(/[0-9a-f]/g, c => String.fromCharCode(97 + parseInt(c, 16)));
const currentPath = join(root, 'extension.crx');
let old;
try { old = await readFile(currentPath); } catch (error) { if (error.code !== 'ENOENT') throw error; }
if (old && !old.includes(publicKey)) throw new Error('Signing key differs from the existing root extension.crx; refusing to change its identity.');
const chrome = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
await access(chrome, constants.X_OK);
const work = await mkdtemp(join(tmpdir(), 'subtitle-release-'));
const releaseDir = join(root, 'releases');
const base = `subtitle-pocket-v${version}`;
await mkdir(releaseDir, { recursive: true });
try {
  await cp(join(root, 'extension'), join(work, 'extension'), { recursive: true, filter: path => !path.endsWith('.DS_Store') });
  await exec(chrome, ['--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-background-networking',
    `--user-data-dir=${join(work, 'profile')}`, `--pack-extension=${join(work, 'extension')}`, `--pack-extension-key=${keyPath}`], { timeout: 60_000 });
  const packed = await readFile(join(work, 'extension.crx'));
  if (packed.toString('ascii', 0, 4) !== 'Cr24' || !packed.includes(publicKey)) throw new Error('Invalid package or unexpected signing identity.');
  // Python's ZIP reader supports prepended CRX headers. Verify every extension payload byte.
  await exec('python3', ['-c', `
import json, pathlib, sys, zipfile
root, work, dest, base = map(pathlib.Path, sys.argv[1:])
with zipfile.ZipFile(work/'extension.crx') as z:
    assert json.loads(z.read('manifest.json'))['version'] == '${version}'
    for p in (work/'extension').rglob('*'):
        if p.is_file(): assert z.read(p.relative_to(work/'extension').as_posix()) == p.read_bytes()
files = [root/'README.md', root/'package.json', root/'package-lock.json']
for folder in ['extension', 'bridge', 'providers', 'scripts', 'test', 'prototypes']:
    files += [p for p in (root/folder).rglob('*') if p.is_file() and not any(part.startswith('.') or part == 'node_modules' for part in p.relative_to(root).parts)]
files += [p for p in (root/'docs').rglob('*.md') if p.is_file() and not any(part.startswith('.') for part in p.relative_to(root).parts)]
assert not any(p.suffix in ['.pem','.crx'] for p in files)
with zipfile.ZipFile(dest/(str(base)+'.zip'), 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    for p in sorted(files): z.write(p, (base/p.relative_to(root)).as_posix())
with zipfile.ZipFile(dest/(str(base)+'.zip')) as z:
    assert z.testzip() is None
    for p in files: assert z.read((base/p.relative_to(root)).as_posix()) == p.read_bytes()
print(f'Verified CRX payload and {len(files)} release ZIP files.')
`, root, work, releaseDir, base], { timeout: 60_000 }).then(({ stdout }) => process.stdout.write(stdout));
  if (old) {
    await mkdir(join(releaseDir, 'backups'), { recursive: true });
    const digest = createHash('sha256').update(old).digest('hex').slice(0, 12);
    await writeFile(join(releaseDir, 'backups', `extension-${digest}.crx`), old);
  }
  await copyFile(join(work, 'extension.crx'), join(releaseDir, `${base}.crx`));
  await copyFile(join(work, 'extension.crx'), currentPath);
  const hashes = [];
  for (const suffix of ['crx', 'zip']) {
    const name = `${base}.${suffix}`;
    hashes.push(`${createHash('sha256').update(await readFile(join(releaseDir, name))).digest('hex')}  ${name}`);
  }
  await writeFile(join(releaseDir, `${base}.sha256`), hashes.join('\n') + '\n');
  console.log(`Packaged ${version}; extension ID ${id}. Outputs: releases/${base}.{crx,zip,sha256}`);
} finally { await rm(work, { recursive: true, force: true }); }
