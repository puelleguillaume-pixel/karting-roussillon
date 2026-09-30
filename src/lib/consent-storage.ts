// Consentement cookies (recommandations CNIL) :
//  - rien n'est déposé hors cookies strictement nécessaires avant un choix ;
//  - « Tout refuser » aussi accessible que « Tout accepter » ;
//  - choix conservé 6 mois puis redemandé ;
//  - modifiable à tout moment (lien « Gérer les cookies » du pied de page).

export type ConsentCategory = 'analytics' | 'ads';

export interface ConsentState {
  version: number;
  decidedAt: string;
  choices: Record<ConsentCategory, boolean>;
}

const STORAGE_KEY = 'kr-consent';
export const CONSENT_VERSION = 1;
const MAX_AGE_MS = 1000 * 60 * 60 * 24 * 182;

export function readStoredConsent(): ConsentState | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ConsentState;
    if (parsed.version !== CONSENT_VERSION) return null;
    if (Date.now() - new Date(parsed.decidedAt).getTime() > MAX_AGE_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function storeConsent(state: ConsentState): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // stockage indisponible (navigation privée…) : le choix vaut pour la session
  }
}
