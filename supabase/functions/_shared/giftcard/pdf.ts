// =============================================================================
// PDF du bon cadeau (A5 paysage, imprimable) — module partagé.
// Utilisé par l'Edge Function `send-emails` (pièce jointe) et par le site
// (téléchargement depuis « Mon compte », aperçu de la démo).
// Polices standard PDF (Helvetica / Courier) : aucun fichier de police à
// embarquer ; les textes sont ramenés au jeu de caractères WinAnsi.
// =============================================================================
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';

export interface GiftCardPdfInput {
  code: string;
  kind: 'amount' | 'product';
  amountCents: number;
  productName?: string | null;
  recipientName?: string | null;
  fromName?: string | null;
  message?: string | null;
  expiresAt?: string | null;
  business: { name: string; address: string; postalCode: string; city: string; phone: string; siteUrl: string };
  qrPng: Uint8Array;
}

const WIDTH = 595.28; // A5 paysage
const HEIGHT = 419.53;
const MARGIN = 32;
const INK = rgb(0.039, 0.039, 0.043);
const CHALK = rgb(0.949, 0.949, 0.933);
const RED = rgb(0.816, 0, 0.063);
const RED_LIGHT = rgb(1, 0.302, 0.302);
const MUTED = rgb(0.357, 0.376, 0.42);
const PAPER = rgb(0.965, 0.965, 0.953);

// Caractères WinAnsi au-delà de Latin-1 (guillemets, tirets, euro…)
const WIN_ANSI_EXTRA = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ');

/** Rend un texte encodable avec les polices standard PDF. */
export function winAnsiSafe(text: string): string {
  return Array.from(
    text
      .normalize('NFC')
      .replace(/[    ]/g, ' ')
      .replace(/[‐‑]/g, '-'),
  )
    .filter((char) => {
      const code = char.charCodeAt(0);
      return (code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff) || WIN_ANSI_EXTRA.has(char);
    })
    .join('');
}

export function giftCardFileName(code: string): string {
  return `bon-cadeau-${code}.pdf`;
}

function money(cents: number): string {
  const value = (cents / 100).toLocaleString('fr-FR', { minimumFractionDigits: cents % 100 === 0 ? 0 : 2, maximumFractionDigits: 2 });
  return `${value} €`;
}

function longDate(iso: string): string {
  return new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso));
}

/** Réduit la taille du texte jusqu'à ce qu'il tienne sur la largeur donnée. */
function fitSize(text: string, font: PDFFont, size: number, maxWidth: number, minSize: number): number {
  let current = size;
  while (current > minSize && font.widthOfTextAtSize(text, current) > maxWidth) current -= 0.5;
  return current;
}

/** Découpe en lignes (mots entiers), avec points de suspension si ça déborde. */
function wrap(text: string, font: PDFFont, size: number, maxWidth: number, maxLines: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    line = word;
    if (lines.length === maxLines) break;
  }
  if (line && lines.length < maxLines) lines.push(line);
  if (lines.length === maxLines && lines.join(' ').length < text.length) {
    let last = lines[maxLines - 1]!;
    while (last.length > 1 && font.widthOfTextAtSize(`${last}…`, size) > maxWidth) last = last.slice(0, -1);
    lines[maxLines - 1] = `${last.trimEnd()}…`;
  }
  return lines;
}

function drawSpaced(page: PDFPage, text: string, x: number, y: number, size: number, font: PDFFont, color: ReturnType<typeof rgb>, spacing: number) {
  let cursor = x;
  for (const char of text) {
    page.drawText(char, { x: cursor, y, size, font, color });
    cursor += font.widthOfTextAtSize(char, size) + spacing;
  }
}

function spacedWidth(text: string, size: number, font: PDFFont, spacing: number): number {
  return Array.from(text).reduce((width, char) => width + font.widthOfTextAtSize(char, size) + spacing, 0) - spacing;
}

export async function buildGiftCardPdf(input: GiftCardPdfInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const name = winAnsiSafe(input.business.name);
  pdf.setTitle(winAnsiSafe(`Bon cadeau ${name} ${input.code}`));
  pdf.setAuthor(name);
  pdf.setLanguage('fr-FR');
  pdf.setCreator(name);

  const page = pdf.addPage([WIDTH, HEIGHT]);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const italic = await pdf.embedFont(StandardFonts.HelveticaOblique);
  const mono = await pdf.embedFont(StandardFonts.CourierBold);

  // --- Bandeau ----------------------------------------------------------------
  page.drawRectangle({ x: 0, y: HEIGHT - 78, width: WIDTH, height: 78, color: INK });
  const [first = '', ...rest] = name.toUpperCase().split(' ');
  page.drawText(first, { x: MARGIN, y: HEIGHT - 47, size: 20, font: bold, color: CHALK });
  page.drawText(rest.join(' '), { x: MARGIN + bold.widthOfTextAtSize(`${first} `, 20), y: HEIGHT - 47, size: 20, font: bold, color: RED_LIGHT });
  const title = 'BON CADEAU';
  const titleWidth = spacedWidth(title, 12, bold, 2.2);
  drawSpaced(page, title, WIDTH - MARGIN - titleWidth, HEIGHT - 45, 12, bold, CHALK, 2.2);
  // Damier
  const cell = 6;
  const checkerX = WIDTH - MARGIN - titleWidth - 14 - cell * 4;
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 4; col++) {
      page.drawRectangle({
        x: checkerX + col * cell,
        y: HEIGHT - 50 + row * cell,
        width: cell,
        height: cell,
        color: (row + col) % 2 === 0 ? CHALK : INK,
        borderColor: CHALK,
        borderWidth: 0.3,
      });
    }
  }
  // Vibreur rouge / blanc
  page.drawRectangle({ x: 0, y: HEIGHT - 84, width: WIDTH, height: 6, color: RED });
  for (let x = 12; x < WIDTH; x += 24) page.drawRectangle({ x, y: HEIGHT - 84, width: 12, height: 6, color: CHALK });

  // --- Colonne gauche : bénéficiaire, message, valeur --------------------------
  const leftWidth = WIDTH - MARGIN * 2 - 132 - 36;
  let y = HEIGHT - 122;
  const recipient = winAnsiSafe(input.recipientName?.trim() || '');
  if (recipient) {
    drawSpaced(page, 'OFFERT À', MARGIN, y, 9, bold, MUTED, 1.6);
    y -= 32;
    const size = fitSize(recipient, bold, 28, leftWidth, 16);
    page.drawText(recipient, { x: MARGIN, y, size, font: bold, color: INK });
    y -= 20;
  }
  const from = winAnsiSafe(input.fromName?.trim() || '');
  if (from) {
    page.drawText(`de la part de ${from}`, { x: MARGIN, y, size: 11, font: regular, color: MUTED, maxWidth: leftWidth });
    y -= 22;
  }
  const message = winAnsiSafe(input.message?.trim() || '');
  if (message) {
    for (const line of wrap(`« ${message} »`, italic, 11, leftWidth, 4)) {
      page.drawText(line, { x: MARGIN, y, size: 11, font: italic, color: INK });
      y -= 15;
    }
  }

  drawSpaced(page, 'VALEUR', MARGIN, 150, 9, bold, MUTED, 1.6);
  if (input.kind === 'product' && input.productName) {
    const product = winAnsiSafe(input.productName);
    const size = fitSize(product, bold, 24, leftWidth, 14);
    page.drawText(product, { x: MARGIN, y: 120, size, font: bold, color: INK });
    page.drawText(winAnsiSafe(`soit ${money(input.amountCents)}`), { x: MARGIN, y: 101, size: 11, font: regular, color: MUTED });
  } else {
    page.drawText(winAnsiSafe(money(input.amountCents)), { x: MARGIN, y: 110, size: 40, font: bold, color: RED });
  }

  // --- Colonne droite : QR code, code, validité --------------------------------
  const qrSize = 132;
  const qrX = WIDTH - MARGIN - qrSize;
  const qrY = HEIGHT - 84 - 22 - qrSize;
  const qr = await pdf.embedPng(input.qrPng);
  page.drawRectangle({ x: qrX - 6, y: qrY - 6, width: qrSize + 12, height: qrSize + 12, color: rgb(1, 1, 1), borderColor: rgb(0.85, 0.85, 0.83), borderWidth: 0.8 });
  page.drawImage(qr, { x: qrX, y: qrY, width: qrSize, height: qrSize });
  const codeSize = fitSize(input.code, mono, 13, qrSize + 16, 9);
  const codeWidth = mono.widthOfTextAtSize(input.code, codeSize);
  page.drawText(input.code, { x: qrX + qrSize / 2 - codeWidth / 2, y: qrY - 26, size: codeSize, font: mono, color: INK });
  if (input.expiresAt) {
    const validity = winAnsiSafe(`Valable jusqu'au ${longDate(input.expiresAt)}`);
    const width = regular.widthOfTextAtSize(validity, 9);
    page.drawText(validity, { x: qrX + qrSize / 2 - width / 2, y: qrY - 42, size: 9, font: regular, color: MUTED });
  }

  // --- Pied de page -------------------------------------------------------------
  page.drawRectangle({ x: 0, y: 0, width: WIDTH, height: 58, color: PAPER });
  page.drawText(
    winAnsiSafe("À présenter lors de la réservation, en ligne ou à l'accueil. Utilisable en une ou plusieurs fois jusqu'à sa date de validité."),
    { x: MARGIN, y: 34, size: 8.5, font: regular, color: INK, maxWidth: WIDTH - MARGIN * 2 },
  );
  const b = input.business;
  page.drawText(
    winAnsiSafe(`${b.name} · ${b.address}, ${b.postalCode} ${b.city} · ${b.phone} · ${b.siteUrl.replace(/^https?:\/\//, '')}`),
    { x: MARGIN, y: 18, size: 8.5, font: regular, color: MUTED, maxWidth: WIDTH - MARGIN * 2 },
  );

  return pdf.save();
}
