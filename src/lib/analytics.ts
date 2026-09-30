// Suivi des conversions Google Ads, uniquement avec le consentement « publicité ».
// Consent Mode v2 : tout est refusé par défaut ; la balise gtag.js n'est même
// pas chargée tant que le visiteur n'a pas accepté. Sans VITE_GOOGLE_ADS_ID,
// rien n'est chargé ni envoyé.

type Gtag = (...args: unknown[]) => void;
declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: Gtag;
  }
}

const adsId = import.meta.env.VITE_GOOGLE_ADS_ID?.trim() || '';
const labels = {
  booking: import.meta.env.VITE_GOOGLE_ADS_BOOKING_LABEL?.trim() || '',
  event: import.meta.env.VITE_GOOGLE_ADS_BOOKING_LABEL?.trim() || '',
  gift_card: import.meta.env.VITE_GOOGLE_ADS_GIFT_LABEL?.trim() || '',
};

let granted = false;
let loaded = false;

function gtag(...args: unknown[]) {
  window.dataLayer = window.dataLayer ?? [];
  // gtag.js attend l'objet « arguments », pas un tableau
  // eslint-disable-next-line prefer-rest-params
  window.dataLayer.push(arguments);
  void args;
}

function load() {
  if (loaded || !adsId) return;
  loaded = true;
  window.gtag = gtag;
  gtag('consent', 'default', { ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', analytics_storage: 'denied' });
  gtag('js', new Date());
  gtag('config', adsId);
  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(adsId)}`;
  document.head.append(script);
}

/** À appeler à chaque changement de consentement */
export function applyAdsConsent(adsGranted: boolean) {
  granted = adsGranted;
  if (!adsId) return;
  if (adsGranted) load();
  if (loaded) {
    const state = adsGranted ? 'granted' : 'denied';
    gtag('consent', 'update', { ad_storage: state, ad_user_data: state, ad_personalization: state });
  }
}

export type ConversionKind = keyof typeof labels;

/** Conversion (réservation, inscription, commande de bon) : envoyée seulement si consentie */
export function trackConversion(kind: ConversionKind, { valueCents, transactionId }: { valueCents: number; transactionId: string }) {
  if (!granted || !loaded || !labels[kind]) return;
  gtag('event', 'conversion', {
    send_to: `${adsId}/${labels[kind]}`,
    value: valueCents / 100,
    currency: 'EUR',
    transaction_id: transactionId,
  });
}

export const analyticsConfigured = !!adsId;
