// SEO et hébergement : HTML pré-rendu, sitemap, robots, redirections Wix, en-têtes.
// Requêtes HTTP brutes (ce que voit un robot sans JavaScript).
import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { parse } from 'smol-toml';

const netlify = parse(readFileSync('netlify.toml', 'utf8')) as { redirects: Array<{ from: string; to: string; status: number }> };

test.describe('HTML pré-rendu', () => {
  for (const [path, keyword] of [
    ['/', 'Rivesaltes'],
    ['/karts-tarifs', 'Perpignan'],
    ['/trackday', 'Trackday'],
    ['/formules/anniversaire', 'Anniversaire'],
    ['/contact', 'Claira'],
  ] as const) {
    test(`${path} : titre, description, canonique et contenu sans JavaScript`, async ({ request }) => {
      const response = await request.get(path);
      expect(response.status()).toBe(200);
      const html = await response.text();
      const title = html.match(/<title data-prerender>([^<]+)<\/title>/)?.[1] ?? '';
      const description = html.match(/<meta data-prerender name="description" content="([^"]*)"/)?.[1] ?? '';
      expect(`${title} ${description}`).toContain(keyword);
      expect(description.length).toBeGreaterThanOrEqual(50);
      expect(description.length).toBeLessThanOrEqual(170);
      expect(html).toContain(`rel="canonical" href="https://www.kartingroussillon.com${path}"`);
      // Page réelle rendue au build : titre principal présent sans JavaScript
      expect(html).toMatch(/<div id="root">[\s\S]*<h1[^>]*>[\s\S]*<\/h1>/);
      const blocks = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)].map((m) => JSON.parse(m[1]!));
      if (path !== '/') expect(blocks.some((b) => b['@type'] === 'BreadcrumbList')).toBe(true);
    });
  }

  test('données structurées : établissement local et offres', async ({ request }) => {
    const home = await (await request.get('/')).text();
    const business = [...home.matchAll(/application\/ld\+json">(.*?)<\/script>/g)].map((m) => JSON.parse(m[1]!)).find((b) => Array.isArray(b['@type']));
    expect(business['@type']).toEqual(['LocalBusiness', 'SportsActivityLocation']);
    expect(business.address.postalCode).toBe('66600');
    expect(business.openingHoursSpecification.length).toBeGreaterThan(0);
    const karts = await (await request.get('/karts-tarifs')).text();
    const list = [...karts.matchAll(/application\/ld\+json">(.*?)<\/script>/g)].map((m) => JSON.parse(m[1]!)).find((b) => b['@type'] === 'ItemList');
    const prices = list.itemListElement.map((i: { item: { name: string; offers: { price: string } } }) => [i.item.name, i.item.offers.price]);
    expect(prices).toContainEqual(['SodiKart 2T 30 CV', '50.00']);
    expect(prices).toContainEqual(['Kart 160 cc', '20.00']);
  });

  test('sitemap et robots (démo : indexation bloquée)', async ({ request }) => {
    const sitemap = await (await request.get('/sitemap.xml')).text();
    for (const path of ['/', '/karts-tarifs', '/bon-cadeau', '/formules/team-building', '/cgv']) {
      expect(sitemap).toContain(`<loc>https://www.kartingroussillon.com${path}</loc>`);
    }
    expect(sitemap).not.toContain('/admin');
    expect(await (await request.get('/robots.txt')).text()).toContain('Disallow: /');
  });
});

test.describe('Hébergement', () => {
  test('toutes les anciennes URL Wix redirigent (301) vers une page existante', async ({ request }) => {
    const rules = netlify.redirects.filter((r) => r.status === 301);
    expect(rules.length).toBeGreaterThanOrEqual(25);
    for (const rule of rules) {
      const from = rule.from.replace('/*', '/exemple');
      const response = await request.get(encodeURI(from), { maxRedirects: 0 });
      expect(response.status(), from).toBe(301);
      expect(response.headers().location).toBe(rule.to);
      expect((await request.get(rule.to)).status(), rule.to).toBe(200);
    }
  });

  test('en-têtes de sécurité et de cache', async ({ request }) => {
    const page = await request.get('/');
    const h = page.headers();
    expect(h['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(h['x-content-type-options']).toBe('nosniff');
    expect(h['strict-transport-security']).toContain('max-age=');
    const html = await page.text();
    const asset = html.match(/src="(\/assets\/index-[^"]+\.js)"/)![1]!;
    expect((await request.get(asset)).headers()['cache-control']).toContain('immutable');
    expect((await request.get('/admin')).headers()['x-robots-tag']).toContain('noindex');
  });

  test('URL inconnue : application servie (page 404 gérée par le site)', async ({ page }) => {
    await page.goto('/page-qui-n-existe-pas');
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/introuvable|hors piste/i);
  });
});
