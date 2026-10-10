// Captures d'écran de la démo (version de production servie comme sur Netlify).
// Prérequis : npm run build.  Usage : node scripts/demo-captures.mjs [dossier]
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium, devices } from '@playwright/test';

const PORT = 4173;
const BASE = `http://localhost:${PORT}`;
const OUT = process.argv[2] ?? 'demo-captures';
mkdirSync(OUT, { recursive: true });

const server = spawn('node', ['scripts/serve-dist.mjs', String(PORT)], { stdio: 'inherit' });
for (let i = 0; i < 50; i++) {
  if (await fetch(BASE).then((r) => r.ok, () => false)) break;
  await new Promise((r) => setTimeout(r, 200));
}

const problems = [];
const browser = await chromium.launch();

async function settle(page) {
  // Mode démo : la base locale est créée au premier chargement
  await page.getByRole('heading', { name: /Préparation de la piste/ }).waitFor({ state: 'detached', timeout: 120_000 });
  await page.getByRole('heading', { level: 1 }).first().waitFor({ timeout: 60_000 });
  const refuse = page.getByRole('button', { name: 'Tout refuser' });
  if (await refuse.isVisible().catch(() => false)) await refuse.click();
  await page.waitForLoadState('networkidle').catch(() => {});
  // Les sections hors écran ne sont pas peintes (content-visibility: auto) :
  // la capture pleine page les force
  await page.addStyleTag({ content: 'section { content-visibility: visible !important; }' });
  // Fait défiler la page pour déclencher les apparitions au défilement
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 400) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 60));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(900);
}

async function session(name, options, shots) {
  const context = await browser.newContext({ ...options, locale: 'fr-FR', timezoneId: 'Europe/Paris' });
  const page = await context.newPage();
  page.on('pageerror', (e) => problems.push(`[${name}] ${page.url()} : ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`[${name}] ${page.url()} : ${m.text()}`);
  });
  for (const [path, file, before] of shots) {
    try {
      await page.goto(BASE + path);
      await settle(page);
      if (before) await before(page);
      await page.screenshot({ path: `${OUT}/${name}-${file}.jpg`, type: 'jpeg', quality: 82, fullPage: true });
      console.log('capture', name, path);
    } catch (e) {
      problems.push(`[${name}] capture ${path} impossible : ${e.message.split('\n')[0]}`);
    }
  }
  await context.close();
}

await session('ordinateur', { viewport: { width: 1440, height: 900 } }, [
  ['/', '01-accueil'],
  ['/karts-tarifs', '02-karts-tarifs'],
  ['/circuits', '03-pistes'],
  ['/formules', '04-groupes'],
  ['/formules/anniversaire', '05-anniversaire'],
  ['/evenements', '06-evenements'],
  ['/reserver?produit=session-kart-270&etape=2', '07-reservation-creneau'],
  ['/bon-cadeau', '08-bon-cadeau'],
  ['/chronos', '09-chronos'],
  ['/contact', '10-contact'],
  [
    '/admin',
    '11-espace-dirigeant',
    async (page) => {
      const owner = page.getByRole('button', { name: 'Dirigeant (tous les accès)' });
      if (await owner.isVisible().catch(() => false)) await owner.click();
      await page.getByRole('heading', { name: 'Tableau de bord' }).waitFor({ timeout: 30_000 });
      await page.waitForTimeout(1500);
    },
  ],
]);

const pixel = { ...devices['Pixel 7'] };
delete pixel.defaultBrowserType;
await session('mobile', pixel, [
  ['/', '01-accueil'],
  ['/karts-tarifs', '02-karts-tarifs'],
  ['/reserver', '03-reserver'],
]);

await browser.close();
server.kill();
writeFileSync(`${OUT}/erreurs-navigateur.txt`, problems.length ? problems.join('\n') + '\n' : 'Aucune erreur JavaScript.\n');
console.log(problems.length ? problems.join('\n') : 'Aucune erreur JavaScript.');
