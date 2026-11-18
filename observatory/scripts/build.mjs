import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';

const root = new URL('../', import.meta.url);
const files = [
  ['/', 'public/index.html', 'text/html; charset=utf-8'],
  ['/style.css', 'public/style.css', 'text/css; charset=utf-8'],
  ['/app.mjs', 'public/app.mjs', 'text/javascript; charset=utf-8'],
  ['/sky.mjs', 'public/sky.mjs', 'text/javascript; charset=utf-8'],
  ['/catalog.json', 'public/catalog.json', 'application/json; charset=utf-8'],
  ['/astronomy.js', 'node_modules/astronomy-engine/astronomy.browser.min.js', 'text/javascript; charset=utf-8']
];
const entries = await Promise.all(files.map(async ([path, file, type]) => {
  const bytes = await readFile(new URL(file, root));
  return [path, { type, gzip: gzipSync(bytes, { level: 9 }).toString('base64') }];
}));
const source = (await readFile(new URL('src/worker.mjs', root), 'utf8')).replace(
  "import { assets } from './assets.mjs';",
  'const assets = new Map(' + JSON.stringify(entries) + ');'
);
await mkdir(new URL('dist/', root), { recursive: true });
await writeFile(new URL('dist/worker.mjs', root), source);
