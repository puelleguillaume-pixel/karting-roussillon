// Téléchargement du bon cadeau en PDF, généré dans le navigateur avec le même
// module que l'Edge Function (pièce jointe des emails). Bibliothèques chargées
// à la demande : elles ne pèsent pas sur les autres pages.

export interface GiftCardPdfCard {
  code: string;
  kind: 'amount' | 'product';
  amountCents: number;
  productName?: string | null;
  recipientName?: string | null;
  fromName?: string | null;
  message?: string | null;
  expiresAt?: string | null;
}

export interface PdfBusiness {
  name: string;
  address: string;
  postalCode: string;
  city: string;
  phone: string;
}

export async function downloadGiftCardPdf(card: GiftCardPdfCard, business: PdfBusiness): Promise<void> {
  const siteUrl = window.location.origin;
  const [{ buildGiftCardPdf, giftCardFileName }, { giftCardUrl }, { default: QRCode }] = await Promise.all([
    import('../../supabase/functions/_shared/giftcard/pdf.ts'),
    import('../../supabase/functions/_shared/email/render.ts'),
    import('qrcode'),
  ]);
  const dataUrl = await QRCode.toDataURL(giftCardUrl(siteUrl, card.code), { width: 360, margin: 1, errorCorrectionLevel: 'M' });
  const qrPng = Uint8Array.from(atob(dataUrl.split(',')[1] ?? ''), (char) => char.charCodeAt(0));
  const bytes = await buildGiftCardPdf({ ...card, business: { ...business, siteUrl }, qrPng });

  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = giftCardFileName(card.code);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
