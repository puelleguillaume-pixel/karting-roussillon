// Images responsive : pour chaque photo de public/images (jpg, png, webp, avif),
// génère des variantes AVIF et WebP en 480, 960 et 1600 px de large dans
// public/images/_opt, et le manifeste src/generated/images.json lu par
// <MediaImage> (balise <picture> avec srcset). Exécuté avant chaque build ;
// les variantes déjà à jour ne sont pas recalculées.
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'public', 'images');
const output = join(source, '_opt');
const manifestFile = join(root, 'src', 'generated', 'images.json');
const WIDTHS = [480, 960, 1600];
const FORMATS = { avif: { quality: 55 }, webp: { quality: 78 } };
const EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif']);

function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (path === output) return [];
    if (statSync(path).isDirectory()) return walk(path);
    return EXTENSIONS.has(extname(name).toLowerCase()) ? [path] : [];
  });
}

const manifest = {};
let generated = 0;
for (const file of walk(source)) {
  const rel = relative(source, file).split('\\').join('/');
  const base = rel.slice(0, -extname(rel).length);
  const meta = await sharp(file).metadata();
  const widths = WIDTHS.filter((w) => w < (meta.width ?? 0));
  if (!widths.length || widths.at(-1) !== meta.width) widths.push(Math.min(meta.width ?? WIDTHS[0], WIDTHS.at(-1)));
  const unique = [...new Set(widths)].sort((a, b) => a - b);
  for (const width of unique) {
    for (const [format, options] of Object.entries(FORMATS)) {
      const target = join(output, `${base}-${width}.${format}`);
      if (existsSync(target) && statSync(target).mtimeMs >= statSync(file).mtimeMs) continue;
      mkdirSync(dirname(target), { recursive: true });
      await sharp(file).rotate().resize({ width, withoutEnlargement: true })[format](options).toFile(target);
      generated++;
    }
  }
  manifest[rel] = { width: meta.width, height: meta.height, widths: unique, base: `/images/_opt/${base}` };
}

mkdirSync(dirname(manifestFile), { recursive: true });
writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Images : ${Object.keys(manifest).length} photo(s), ${generated} variante(s) générée(s).`);
