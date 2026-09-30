// Erreurs métier : les RPC lèvent SQLSTATE P0001 avec message = code « KR_… »
// et hint = texte français prêt à afficher (voir supabase/README.md).

const FALLBACK_MESSAGES: Record<string, string> = {
  KR_RATE_LIMITED: 'Trop de demandes envoyées. Merci de réessayer un peu plus tard.',
  KR_EMAIL_INVALID: 'Adresse email invalide.',
  KR_CUSTOMER_INCOMPLETE: 'Nom, prénom, email et téléphone sont obligatoires.',
  KR_REQUEST_INVALID: 'Certaines informations de la demande sont invalides.',
  KR_GIFT_CARD_INVALID: 'Ce code de bon cadeau est inconnu.',
  KR_GIFT_CARD_EXPIRED: 'Ce bon cadeau a expiré.',
  KR_GIFT_CARD_EMPTY: 'Ce bon cadeau a déjà été entièrement utilisé.',
  KR_RANGE_INVALID: 'Période invalide.',
  NETWORK: 'Connexion impossible. Vérifiez votre réseau puis réessayez.',
  UNKNOWN: 'Une erreur inattendue est survenue. Réessayez ou appelez le circuit.',
};

export class RpcError extends Error {
  readonly code: string;
  readonly detail?: string;

  constructor(code: string, message: string, detail?: string) {
    super(message);
    this.name = 'RpcError';
    this.code = code;
    this.detail = detail;
  }

  /** Normalise une erreur PostgREST (supabase-js) ou Postgres (PGlite). */
  static from(raw: unknown): RpcError {
    if (raw instanceof RpcError) return raw;
    const e = (raw ?? {}) as { message?: string; hint?: string; detail?: string; details?: string; code?: string };
    const message = e.message ?? '';
    if (/^KR_[A-Z_]+$/.test(message)) {
      const hint = e.hint?.trim();
      return new RpcError(message, hint || FALLBACK_MESSAGES[message] || FALLBACK_MESSAGES.UNKNOWN!, e.detail ?? e.details);
    }
    if (raw instanceof TypeError || /fetch|network/i.test(message)) {
      return new RpcError('NETWORK', FALLBACK_MESSAGES.NETWORK!);
    }
    if (import.meta.env.DEV) console.error('[rpc]', raw);
    return new RpcError(e.code ?? 'UNKNOWN', FALLBACK_MESSAGES.UNKNOWN!);
  }
}

export function errorMessage(error: unknown): string {
  return RpcError.from(error).message;
}
