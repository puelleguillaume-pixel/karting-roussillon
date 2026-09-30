// Mesures Lighthouse (mobile par défaut, --desktop pour ordinateur) sur une liste
// de pages, avec un délai maximal par page et fermeture garantie du navigateur.
// Usage : node scripts/lighthouse.mjs http://localhost:4175 / /karts-tarifs [--desktop]
// Navigateur : Chrome installé (CHROME_PATH pour en indiquer un autre).
import * as chromeLauncher from 'chrome-launcher';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import lighthouse from 'lighthouse';

const args = process.argv.slice(2);
const desktop = args.includes('--desktop');
const [base, ...paths] = args.filter((a) => !a.startsWith('--'));
const CATEGORIES = ['performance', 'accessibility', 'best-practices', 'seo'];
const TIMEOUT_MS = 120_000;

async function measure(url) {
  // Profil temporaire géré ici : sous Windows, sa suppression immédiate échoue
  // parfois (fichiers encore verrouillés) ; on réessaie sans interrompre la mesure
  const userDataDir = mkdtempSync(join(tmpdir(), 'kr-lh-'));
  const chrome = await chromeLauncher.launch({ chromeFlags: ['--headless=new', '--disable-gpu'], userDataDir });
  let timer;
  try {
    const run = lighthouse(
      url,
      { port: chrome.port, output: 'json', logLevel: 'error', onlyCategories: CATEGORIES },
      desktop ? (await import('lighthouse/core/config/desktop-config.js')).default : undefined,
    );
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('délai dépassé')), TIMEOUT_MS);
    });
    return (await Promise.race([run, timeout])).lhr;
  } finally {
    clearTimeout(timer);
    await chrome.kill();
    for (let i = 0; i < 10; i++) {
      try {
        rmSync(userDataDir, { recursive: true, force: true });
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 300));
      }
    }
  }
}

const rows = [];
for (const path of paths.length ? paths : ['/']) {
  let lhr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      lhr = await measure(`${base}${path}`);
      if (!lhr.runtimeError) break;
    } catch (e) {
      lhr = { runtimeError: { code: e.message } };
    }
  }
  const score = (k) => (lhr.categories?.[k] ? Math.round(lhr.categories[k].score * 100) : '—');
  const metric = (k) => lhr.audits?.[k]?.displayValue ?? '—';
  rows.push({
    page: path,
    perf: score('performance'),
    a11y: score('accessibility'),
    pratiques: score('best-practices'),
    seo: score('seo'),
    FCP: metric('first-contentful-paint'),
    LCP: metric('largest-contentful-paint'),
    TBT: metric('total-blocking-time'),
    CLS: metric('cumulative-layout-shift'),
    erreur: lhr.runtimeError?.code ?? '',
  });
}
console.log(`Lighthouse ${desktop ? 'ordinateur' : 'mobile (4G lente simulée, processeur ralenti ×4)'}`);
console.table(rows);
