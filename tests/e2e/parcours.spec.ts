// Parcours complets sur la version de production (mode démo : base PGlite dans
// le navigateur), servie avec la CSP de production. Une seule page partagée :
// la base de démonstration est construite une fois.
import { expect, test, type Page } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

let page: Page;
const problems: string[] = [];
let bookingReference = '';

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage({ viewport: { width: 1366, height: 900 }, locale: 'fr-FR', timezoneId: 'Europe/Paris' });
  page.on('pageerror', (error) => problems.push(`erreur JS : ${error.message}`));
  page.on('console', (message) => {
    // Les sondes que Playwright injecte dans l'aperçu d'email (iframe sans
    // droit d'exécution, voulu) sont bloquées : ce n'est pas une erreur du site.
    if (message.type() === 'error' && !message.text().includes("'about:srcdoc'")) problems.push(`console : ${message.text()}`);
  });
});

test.afterAll(async () => {
  await page.close();
});

/** Mode démo : attendre que la base locale soit prête (premier chargement) */
async function waitForSite(target: Page = page) {
  await expect(target.getByRole('heading', { name: /Préparation de la piste/ })).toHaveCount(0, { timeout: 90_000 });
  await expect(target.getByRole('heading', { level: 1 })).toBeVisible();
}

async function refuseCookies() {
  const refuse = page.getByRole('button', { name: 'Tout refuser' });
  if (await refuse.isVisible().catch(() => false)) await refuse.click();
}

test('accueil : chargement sans erreur ni violation de la CSP', async () => {
  await page.goto('/');
  await waitForSite();
  await refuseCookies();
  await expect(page).toHaveTitle(/Rivesaltes/);
  await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(2);
  expect(problems).toEqual([]);
});

test('réservation en ligne : activité, créneau, pilote, confirmation', async () => {
  await page.getByRole('link', { name: 'Réserver', exact: true }).first().click();
  await page.getByRole('button', { name: /SodiKart 390 cc/ }).first().click();
  await expect(page).toHaveURL(/etape=2/);

  // Troisième jour proposé, premier créneau libre
  await page.locator('main button[aria-pressed]').nth(2).click();
  await page.getByRole('button', { name: /^\d{1,2}h\d{2}\s*\d+ places?/ }).first().click();
  await page.getByRole('button', { name: 'Continuer' }).click();
  await expect(page).toHaveURL(/etape=3/);

  await page.getByRole('textbox', { name: 'Prénom', exact: true }).first().fill('Camille');
  await page.getByRole('textbox', { name: 'Nom', exact: true }).first().fill('Recette');
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill('camille.recette@example.com');
  await page.getByRole('textbox', { name: 'Téléphone', exact: true }).fill('0611223344');
  await page.getByRole('textbox', { name: 'Prénom', exact: true }).nth(1).fill('Camille');
  await page.getByRole('textbox', { name: 'Nom', exact: true }).nth(1).fill('Recette');
  await page.getByLabel('Date de naissance').fill('1994-05-20');
  await page.getByRole('button', { name: 'Continuer' }).click();
  await expect(page).toHaveURL(/etape=4/);

  for (const box of await page.getByRole('checkbox').all()) if (!(await box.isChecked())) await box.check();
  await page.getByRole('button', { name: 'Confirmer la réservation' }).click();

  await expect(page).toHaveURL(/\/reservation\/[0-9a-f-]{36}\?confirmee=1/);
  await expect(page.getByText(/C.est réservé/i)).toBeVisible();
  bookingReference = (await page.getByText(/KR-[A-Z0-9]{6}/).first().textContent())!.match(/KR-[A-Z0-9]{6}/)![0];
  expect(bookingReference).toMatch(/^KR-/);
});

test('email de confirmation (boîte de démonstration) avec QR code', async () => {
  await page.goto('/demo/emails');
  const item = page.getByRole('button').filter({ hasText: 'camille.recette@example.com' }).first();
  await expect(item).toBeVisible();
  await item.click();
  const preview = page.frameLocator('iframe[title^="Aperçu"]');
  await expect(preview.locator('body')).toContainText(bookingReference);
  await expect(preview.locator('img[src^="data:image/png"]')).toHaveCount(1);
});

test('accueil du circuit : connexion équipe, check-in de la réservation', async () => {
  await page.goto('/admin');
  await page.getByRole('button', { name: 'Accueil (exploitation)' }).click();
  await expect(page.getByRole('heading', { name: 'Tableau de bord' })).toBeVisible();
  await expect(page.getByText('Chiffre d’affaires TTC')).toHaveCount(0);

  await page.getByRole('link', { name: 'Check-in' }).click();
  await page.getByLabel('Référence de réservation').fill(bookingReference);
  await page.getByRole('button', { name: 'Chercher' }).click();
  await expect(page.getByText('Camille Recette').first()).toBeVisible();
  await page.getByRole('button', { name: /Tout le groupe est arrivé/ }).click();
  await expect(page.getByText(/est enregistré/)).toBeVisible();
  await expect(page.getByText('Arrivé', { exact: true }).first()).toBeVisible();
});

test('bon cadeau : commande en ligne, encaissement à l’accueil, utilisation', async () => {
  await page.getByRole('button', { name: 'Se déconnecter' }).first().click();
  await page.goto('/bon-cadeau');
  await page.getByRole('group', { name: 'Montants proposés' }).getByRole('button', { name: /30/ }).click();
  await page.getByLabel('Prénom du bénéficiaire').fill('Sacha');
  await page.getByRole('textbox', { name: 'Prénom', exact: true }).fill('Alex');
  await page.getByRole('textbox', { name: 'Nom', exact: true }).fill('Recette');
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill('alex.recette@example.com');
  await page.getByRole('textbox', { name: 'Téléphone', exact: true }).fill('0622334455');
  await page.getByLabel(/conditions générales de vente/).check();
  await page.getByRole('button', { name: /Commander le bon/ }).click();
  const order = (await page.getByText(/BC-[A-Z0-9]{6}/).first().textContent())!.match(/BC-[A-Z0-9]{6}/)![0];

  // L'équipe encaisse et active le bon depuis l'espace dirigeant
  await page.goto('/admin/bons');
  await page.getByRole('button', { name: 'Dirigeant (tous les accès)' }).click();
  await expect(page.getByRole('heading', { name: 'Bons cadeaux' })).toBeVisible();
  await expect(page.locator('tbody tr').first()).toBeVisible();
  await page.getByRole('searchbox').fill(order);
  await page.getByRole('button', { name: new RegExp(order) }).click();
  await page.getByRole('button', { name: /Encaissé : activer le bon/ }).click();
  const code = (await page.getByText(/KDO-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}/).first().textContent())!.match(/KDO-[A-Z0-9-]{14}/)![0];

  // Solde vérifiable sur le site par le QR code du bon
  await page.goto(`/bon-cadeau?bon=${code}`);
  await expect(page.getByText(/Solde disponible : 30/)).toBeVisible();
});

test('mobile : pas de défilement horizontal sur les pages clés @mobile', async ({ browser }) => {
  const mobile = await browser.newPage({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
  for (const path of ['/', '/karts-tarifs', '/bon-cadeau', '/trackday', '/contact']) {
    await mobile.goto(path);
    await waitForSite(mobile);
    const overflow = await mobile.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
  await mobile.close();
});

test('aucune erreur JavaScript ni violation de la CSP pendant les parcours', async () => {
  expect(problems).toEqual([]);
});
