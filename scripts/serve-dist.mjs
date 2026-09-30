// Sert dist/ comme Netlify, à partir de netlify.toml : redirections 301,
// réécriture de l'application monopage, en-têtes (CSP, cache, robots).
// Sert aux tests de bout en bout et à vérifier la version de production en local.
// Usage : node scripts/serve-dist.mjs [port]   (4173 par défaut)
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { constants, createBrotliCompress, createGzip } from 'node:zlib';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'smol-toml';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const dist = join(root, process.env.KR_DIST_DIR ?? 'dist');
const config = parse(readFileSync(join(root, 'netlify.toml'), 'utf8'));
const port = Number(process.argv[2] ?? process.env.PORT ?? 4173);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
  '.data': 'application/octet-stream',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.pdf': 'application/pdf',
};

/** Motif Netlify (« /assets/* », « /*.html ») → expression régulière */
function toRegExp(pattern) {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`);
}

const redirects = (config.redirects ?? []).map((r) => ({ ...r, test: toRegExp(r.from.replace(/\/\*$/, '/*')) }));
// KR_CSP_CONNECT : origine supplémentaire autorisée (faux Supabase local pour les mesures)
const extraConnect = process.env.KR_CSP_CONNECT;
const headers = (config.headers ?? []).map((h) => ({
  test: toRegExp(h.for),
  values: Object.fromEntries(
    Object.entries(h.values).map(([k, v]) => [k, k === 'Content-Security-Policy' && extraConnect ? String(v).replace('connect-src ', `connect-src ${extraConnect} `) : v]),
  ),
}));

/** Fichier servi pour un chemin : fichier exact, ou dossier/index.html (URL « propres ») */
function resolveFile(pathname) {
  const safe = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, '');
  const candidate = join(dist, safe);
  if (!candidate.startsWith(dist)) return null;
  if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  const index = join(candidate, 'index.html');
  return existsSync(index) ? index : null;
}

const COMPRESSIBLE = new Set(['.html', '.js', '.css', '.json', '.svg', '.xml', '.txt', '.wasm', '.data']);

function send(req, res, status, file, pathname) {
  for (const h of headers) if (h.test.test(pathname)) for (const [k, v] of Object.entries(h.values)) res.setHeader(k, v);
  res.setHeader('Content-Type', TYPES[extname(file)] ?? 'application/octet-stream');
  // Compression comme sur Netlify (brotli, sinon gzip)
  const accept = String(req.headers['accept-encoding'] ?? '');
  const encoder = !COMPRESSIBLE.has(extname(file)) ? null : accept.includes('br') ? 'br' : accept.includes('gzip') ? 'gzip' : null;
  if (encoder) {
    res.setHeader('Content-Encoding', encoder);
    res.setHeader('Vary', 'Accept-Encoding');
  }
  res.writeHead(status);
  const stream = createReadStream(file);
  if (encoder === 'br') stream.pipe(createBrotliCompress({ params: { [constants.BROTLI_PARAM_QUALITY]: 5 } })).pipe(res);
  else if (encoder === 'gzip') stream.pipe(createGzip()).pipe(res);
  else stream.pipe(res);
}

createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${port}`);
  const pathname = url.pathname;
  const file = resolveFile(pathname);
  // Comme Netlify : un fichier existant l'emporte sur une règle non forcée
  if (file) return send(req, res, 200, file, pathname);

  for (const rule of redirects) {
    const decoded = (() => {
      try {
        return decodeURIComponent(pathname);
      } catch {
        return pathname;
      }
    })();
    if (!rule.test.test(pathname) && !rule.test.test(decoded)) continue;
    if (rule.status === 301 || rule.status === 302) {
      res.writeHead(rule.status, { Location: rule.to });
      return res.end();
    }
    const target = resolveFile(rule.to);
    if (target) return send(req, res, rule.status ?? 200, target, pathname);
  }
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Introuvable');
}).listen(port, () => console.log(`dist/ servi comme sur Netlify : http://localhost:${port}`));
