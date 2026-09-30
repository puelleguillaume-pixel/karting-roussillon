/**
 * Chemins d'images stockés en base : relatifs à /public/images
 * (ex. « karts/390.jpg ») ou URL absolues (Supabase Storage).
 */
export function assetUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (/^https?:\/\//.test(path) || path.startsWith('/')) return path;
  return `/images/${path.replace(/^\.?\/?(images\/)?/, '')}`;
}

interface ImageEntry {
  width: number;
  height: number;
  widths: number[];
  base: string;
}

// Manifeste des variantes responsive (scripts/optimize-images.mjs)
const manifest = import.meta.glob<Record<string, ImageEntry>>('/src/generated/images.json', { eager: true, import: 'default' });
const images: Record<string, ImageEntry> = Object.values(manifest)[0] ?? {};

/** Variantes AVIF / WebP d'une image de /public/images, si elles ont été générées */
export function responsiveVariants(path: string | null | undefined) {
  if (!path || /^https?:\/\//.test(path)) return null;
  const entry = images[path.replace(/^\/?(images\/)?/, '')];
  if (!entry) return null;
  return {
    width: entry.width,
    height: entry.height,
    srcSet: (format: 'avif' | 'webp') => entry.widths.map((w) => `${entry.base}-${w}.${format} ${w}w`).join(', '),
  };
}
