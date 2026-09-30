// Pré-rendu SEO, exécuté après `vite build` (npm run build).
//
// Pour chaque page publique, écrit dist/<page>/index.html avec, dès le HTML
// initial : titre, description, URL canonique, Open Graph, données structurées
// schema.org et un contenu <noscript> lisible. Génère aussi sitemap.xml et
// robots.txt. Les données viennent de la base :
//   - Supabase (VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY) : API publique ;
//   - sinon (démo) : migrations + seed rejoués dans PGlite, comme le mode démo.
// Le site React remplace ces balises au démarrage (données toujours fraîches) ;
// relancer un build (hook Netlify quotidien) rafraîchit la version statique.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadEnv } from 'vite';
import { PRIVATE_PATH_PREFIXES, PUBLIC_ROUTES, breadcrumbTrail } from '../src/lib/seo/routes.ts';
import {
  breadcrumbJsonLd,
  businessJsonLd,
  eventsJsonLd,
  productsJsonLd,
  serializeJsonLd,
  websiteJsonLd,
} from '../src/lib/seo/structured-data.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, process.env.KR_DIST_DIR ?? 'dist');
// Rendu React des pages (vite build --ssr src/entry-server.tsx)
const ssrEntry = join(root, process.env.KR_SSR_DIR ?? 'dist-ssr', 'entry-server.js');
const env = { ...loadEnv('production', root, 'VITE_'), ...process.env };
const siteUrl = (env.VITE_SITE_URL?.trim() || 'https://www.kartingroussillon.com').replace(/\/$/, '');
const supabaseUrl = env.VITE_SUPABASE_URL?.trim();
const anonKey = env.VITE_SUPABASE_ANON_KEY?.trim();
const isDemo = env.VITE_DATA_SOURCE?.trim() === 'demo' || !supabaseUrl || !anonKey;

const today = new Date().toISOString().slice(0, 10);
const in180 = new Date(Date.now() + 180 * 86_400_000).toISOString().slice(0, 10);

// -----------------------------------------------------------------------------
// Données
// -----------------------------------------------------------------------------
async function loadFromSupabase() {
  const call = async (fn, args = {}) => {
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    });
    if (!response.ok) throw new Error(`${fn} : HTTP ${response.status} ${await response.text()}`);
    return response.json();
  };
  return { bundle: await call('get_site_bundle'), calendar: await call('get_public_calendar', { p_from: today, p_to: in180 }) };
}

async function loadFromDemo() {
  const { freshDb } = await import('../supabase/tests/apply.mjs');
  const db = await freshDb();
  await db.exec(readFileSync(join(root, 'supabase', 'seed_demo.sql'), 'utf8'));
  const bundle = (await db.query(`select public.get_site_bundle() as b`)).rows[0].b;
  const calendar = (
    await db.query(`select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) as c from public.get_public_calendar($1::date, $2::date) t`, [today, in180])
  ).rows[0].c;
  await db.close();
  return { bundle, calendar };
}

// -----------------------------------------------------------------------------
// HTML
// -----------------------------------------------------------------------------
const escapeHtml = (text) =>
  String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** Markdown léger → texte brut (description de repli, contenu noscript) */
const plain = (markdown) =>
  String(markdown ?? '')
    .replace(/[#*_>`[\]]/g, '')
    .replace(/\(https?:[^)]*\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();

function truncate(text, max) {
  return text.length <= max ? text : `${text.slice(0, max - 1).replace(/\s+\S*$/, '')}…`;
}

function jsonLdFor(path, bundle, calendar) {
  const blocks = [];
  if (path === '/') blocks.push(businessJsonLd(bundle, siteUrl), websiteJsonLd(bundle, siteUrl));
  if (path === '/contact') blocks.push(businessJsonLd(bundle, siteUrl));
  if (path === '/karts-tarifs') blocks.push(productsJsonLd(bundle, siteUrl));
  if (path === '/trackday') blocks.push(...eventsJsonLd(calendar, bundle, siteUrl));
  blocks.push(breadcrumbJsonLd(breadcrumbTrail(path), siteUrl));
  return blocks.filter(Boolean);
}

/** Balises que React place dans <head> : déjà écrites par ce script, retirées du corps rendu */
/** Vrai si la position est à l'intérieur d'un <svg> (titre d'illustration, à conserver) */
const insideSvg = (html, index) => html.lastIndexOf('<svg', index) > html.lastIndexOf('</svg>', index);

const stripHoisted = (html) =>
  html
    .replace(/<title>[\s\S]*?<\/title>/g, (match, offset, whole) => (insideSvg(whole, offset) ? match : ''))
    .replace(/<meta [^>]*?\/?>/g, '')
    .replace(/<link rel="canonical"[^>]*?\/?>/g, '');
// Les données structurées JSON-LD rendues par React restent dans le corps : React
// les attend à cet endroit pour reprendre la page (hydratation) sans écart.

function noscriptBody(route, page, bundle) {
  const contact = bundle.content['contact'];
  const lines = [`<h1>${escapeHtml(page?.title || route.label)}</h1>`];
  const intro = plain(page?.body);
  if (intro) lines.push(`<p>${escapeHtml(truncate(intro, 600))}</p>`);
  if (route.path === '/karts-tarifs') {
    lines.push('<ul>');
    for (const p of bundle.products.filter((x) => x.price_cents != null)) {
      lines.push(`<li>${escapeHtml(p.name)} : ${(p.price_cents / 100).toLocaleString('fr-FR')} € ${p.age_label ? `(${escapeHtml(p.age_label)})` : ''}</li>`);
    }
    lines.push('</ul>');
  }
  lines.push(
    '<nav><ul>',
    ...PUBLIC_ROUTES.filter((r) => r.priority >= 0.5).map((r) => `<li><a href="${r.path}">${escapeHtml(r.label)}</a></li>`),
    '</ul></nav>',
  );
  if (contact) {
    const d = contact.data;
    lines.push(`<p>${escapeHtml(contact.title)} — ${escapeHtml(d.address)}, ${escapeHtml(d.postal_code)} ${escapeHtml(d.city)} — <a href="tel:${escapeHtml(d.phone_e164)}">${escapeHtml(d.phone)}</a></p>`);
  }
  return `<noscript>\n      ${lines.join('\n      ')}\n    </noscript>`;
}

function renderPage(template, route, bundle, calendar, body) {
  const page = bundle.content[route.contentKey];
  const data = page?.data ?? {};
  const title = data.seo_title || `${page?.title || route.label} · Karting Roussillon`;
  const description = data.seo_description || truncate(plain(page?.body), 160);
  const canonical = `${siteUrl}${route.path}`;
  const brand = bundle.content['brand']?.data ?? {};
  const image = data.hero_image || bundle.content['page.home']?.data?.hero_image || brand.logo_path;
  const imageUrl = image ? (/^https?:/.test(image) ? image : `${siteUrl}/images/${String(image).replace(/^\/?(images\/)?/, '')}`) : null;

  const head = [
    `<title data-prerender>${escapeHtml(title)}</title>`,
    description && `<meta data-prerender name="description" content="${escapeHtml(description)}" />`,
    `<link data-prerender rel="canonical" href="${canonical}" />`,
    `<meta data-prerender property="og:type" content="website" />`,
    `<meta data-prerender property="og:locale" content="fr_FR" />`,
    `<meta data-prerender property="og:site_name" content="Karting Roussillon" />`,
    `<meta data-prerender property="og:title" content="${escapeHtml(title)}" />`,
    description && `<meta data-prerender property="og:description" content="${escapeHtml(description)}" />`,
    `<meta data-prerender property="og:url" content="${canonical}" />`,
    imageUrl && `<meta data-prerender property="og:image" content="${escapeHtml(imageUrl)}" />`,
    `<meta data-prerender name="twitter:card" content="${imageUrl ? 'summary_large_image' : 'summary'}" />`,
    // Sans rendu React (repli), les données structurées sont placées dans <head>
    ...(body ? [] : jsonLdFor(route.path, bundle, calendar).map((block) => `<script data-prerender type="application/ld+json">${serializeJsonLd(block)}</script>`)),
  ]
    .filter(Boolean)
    .join('\n    ');

  return template
    .replace(/<title data-prerender>[\s\S]*?<\/title>/, '')
    .replace(/<meta\s+data-prerender[\s\S]*?\/>/, '')
    .replace('</head>', () => `    ${head}\n  </head>`)
    .replace(/<noscript>[\s\S]*?<\/noscript>/, body ? '<noscript>Certaines fonctions (réservation, bons cadeaux) nécessitent JavaScript.</noscript>' : noscriptBody(route, page, bundle))
    .replace('<div id="root"></div>', () => `<div id="root">${body ?? ''}</div>`);
}

// -----------------------------------------------------------------------------
// Sitemap & robots
// -----------------------------------------------------------------------------
function sitemap(calendar) {
  const events = [...new Set(calendar.filter((i) => i.item_type === 'event' && i.event_slug).map((i) => i.event_slug))];
  const urls = [
    ...PUBLIC_ROUTES.map((r) => ({ loc: `${siteUrl}${r.path}`, changefreq: r.changefreq, priority: r.priority })),
    ...events.map((slug) => ({ loc: `${siteUrl}/reserver/evenement/${slug}`, changefreq: 'daily', priority: 0.6 })),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${u.loc}</loc><lastmod>${today}</lastmod><changefreq>${u.changefreq}</changefreq><priority>${u.priority.toFixed(1)}</priority></url>`).join('\n')}
</urlset>
`;
}

function robots() {
  if (isDemo) {
    // Déploiement de démonstration : jamais indexé
    return `# Version de démonstration (données d'exemple) : ne pas indexer\nUser-agent: *\nDisallow: /\n`;
  }
  return `User-agent: *\nAllow: /\n${PRIVATE_PATH_PREFIXES.map((p) => `Disallow: ${p}`).join('\n')}\n\nSitemap: ${siteUrl}/sitemap.xml\n`;
}

// -----------------------------------------------------------------------------
const started = Date.now();
const { bundle, calendar } = isDemo ? await loadFromDemo() : await loadFromSupabase();
// Gabarit vierge : index.html juste après vite build, ou app.html (coquille
// neutre) si le pré-rendu a déjà été exécuté sur ce dossier
const template = (existsSync(join(dist, 'app.html')) ? readFileSync(join(dist, 'app.html'), 'utf8') : readFileSync(join(dist, 'index.html'), 'utf8')).replace(
  /\s*<script id="kr-site-bundle"[\s\S]*?<\/script>/,
  '',
);
if (!template.includes('<div id="root"></div>')) throw new Error('Gabarit inattendu : relancez vite build avant le pré-rendu.');

// Données du site (catalogue, textes, horaires) embarquées dans chaque page :
// premier affichage sans attendre le réseau ; le site les rafraîchit ensuite.
const bundleScript = `<script id="kr-site-bundle" type="application/json" data-generated-at="${new Date().toISOString()}">${serializeJsonLd(bundle)}</script>`;
const withBundle = (html) => html.replace(/<div id="root">([\s\S]*?)<\/div>\s*(<noscript>|<script type="module")/, (_m, inner, next) => `<div id="root">${inner}</div>
    ${bundleScript}
    ${next}`);

// Coquille neutre pour les pages sans pré-rendu (réservation, compte, admin…)
writeFileSync(join(dist, 'app.html'), withBundle(template));

const { render } = await import(pathToFileURL(ssrEntry).href);

for (const route of PUBLIC_ROUTES) {
  const file = route.path === '/' ? join(dist, 'index.html') : join(dist, route.path.slice(1), 'index.html');
  mkdirSync(dirname(file), { recursive: true });
  const body = stripHoisted(await render(route.path, bundle));
  writeFileSync(file, withBundle(renderPage(template, route, bundle, calendar, body)));
}
writeFileSync(join(dist, 'sitemap.xml'), sitemap(calendar));
writeFileSync(join(dist, 'robots.txt'), robots());
console.log(
  `Pré-rendu SEO : ${PUBLIC_ROUTES.length} pages (données embarquées : ${Math.round(bundleScript.length / 1024)} Ko), sitemap et robots.txt (${isDemo ? 'données de démonstration, indexation bloquée' : 'Supabase'}) en ${Date.now() - started} ms`,
);
