/** « kdo abcd 2345 wxyz » → « KDO-ABCD-2345-WXYZ » */
export function normalizeGiftCode(input: string): string | null {
  const compact = input.toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^KDO/, '');
  if (compact.length !== 12) return null;
  return `KDO-${compact.slice(0, 4)}-${compact.slice(4, 8)}-${compact.slice(8)}`;
}

const PENDING_KEY = 'kr-gift-code';

/**
 * Bon cadeau à appliquer à la prochaine réservation : lu dans l'URL
 * (`?bon=…`, lien de l'email ou du vérificateur de solde) puis mémorisé
 * pour la session, le temps de choisir l'activité et le créneau.
 */
export function pendingGiftCode(): string {
  try {
    const fromUrl = normalizeGiftCode(new URLSearchParams(window.location.search).get('bon') ?? '');
    if (fromUrl) {
      window.sessionStorage.setItem(PENDING_KEY, fromUrl);
      return fromUrl;
    }
    return window.sessionStorage.getItem(PENDING_KEY) ?? '';
  } catch {
    return '';
  }
}

export function forgetPendingGiftCode() {
  try {
    window.sessionStorage.removeItem(PENDING_KEY);
  } catch {
    // rien à oublier
  }
}
