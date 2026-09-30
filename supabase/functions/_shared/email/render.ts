// =============================================================================
// Gabarits des emails transactionnels — module partagé, sans dépendance.
// Utilisé par l'Edge Function `send-emails` (Deno) et par l'aperçu du mode
// démo (navigateur). Entrée : le modèle + le payload JSON mis en file par la
// base (app.enqueue_email). Sortie : sujet, HTML (compatible clients mail),
// texte brut.
// =============================================================================

export interface EmailBusiness {
  name: string;
  address: string;
  postalCode: string;
  city: string;
  phone: string;
  phoneE164: string;
}

export interface EmailContext {
  siteUrl: string;
  business: EmailBusiness;
  /** Source de l'image QR : « cid:qr » (email) ou data: URL (aperçu) */
  qrSrc?: string;
  policy?: { fullRefundHours?: number; creditHours?: number; giftCardValidityMonths?: number };
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

// -----------------------------------------------------------------------------
// Formats (heure de Paris)
// -----------------------------------------------------------------------------
const TZ = 'Europe/Paris';

function money(cents: number | null | undefined): string {
  const value = (cents ?? 0) / 100;
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: (cents ?? 0) % 100 === 0 ? 0 : 2,
  }).format(value);
}

function day(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T12:00:00Z`) : new Date(iso);
  return new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(date);
}

function time(iso: string | null | undefined): string {
  if (!iso) return '';
  const parts = new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, hour: 'numeric', minute: '2-digit' }).formatToParts(new Date(iso));
  const h = parts.find((p) => p.type === 'hour')?.value ?? '';
  const m = parts.find((p) => p.type === 'minute')?.value ?? '00';
  return `${Number(h)}h${m}`;
}

function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// -----------------------------------------------------------------------------
// Payloads (formes produites par app.booking_json & co)
// -----------------------------------------------------------------------------
interface BookingPayload {
  id?: string;
  reference?: string;
  qr_token?: string;
  status?: string;
  starts_at?: string;
  karts?: number;
  participants_count?: number;
  total_cents?: number;
  gift_card_applied_cents?: number;
  paid_cents?: number;
  amount_due_cents?: number;
  product?: { name?: string } | null;
  event?: { title?: string; starts_at?: string; ends_at?: string } | null;
  customer?: { first_name?: string; last_name?: string; email?: string; phone?: string };
  sessions?: Array<{ track?: string; starts_at?: string; ends_at?: string; karts?: number }>;
  participants?: Array<{ first_name?: string; last_name?: string; role?: string }>;
  cancellation?: {
    outcome?: string;
    gift_card_recredited_cents?: number;
    paid_cents?: number;
    credit_code?: string | null;
    credit_amount_cents?: number | null;
  };
  reason?: string;
}

interface RequestPayload {
  reference?: string;
  type?: string;
  contact?: { first_name?: string; last_name?: string; email?: string; phone?: string; company?: string };
  contact_name?: string;
  details?: Record<string, unknown>;
  quote_amount_cents?: number | null;
  deposit_cents?: number | null;
  preferred_date?: string | null;
  participants_count?: number | null;
}

interface GiftCardPayload {
  code?: string;
  amount_cents?: number;
  kind?: string;
  product?: string | null;
  recipient_name?: string;
  recipient_email?: string | null;
  message?: string;
  expires_at?: string;
  order_reference?: string | null;
  audience?: 'buyer' | 'recipient';
  sent_to_recipient?: boolean;
  buyer_first_name?: string | null;
  buyer_name?: string | null;
  deliver_to?: 'buyer' | 'recipient';
  buyer?: { first_name?: string; last_name?: string; email?: string; phone?: string };
}

const REQUEST_LABELS: Record<string, string> = {
  birthday: 'anniversaire',
  bachelor_party: 'EVG / EVJF',
  team_building: 'team building',
  school_kart: 'école de pilotage kart',
  school_moto: 'école de pilotage moto',
  alpine: 'expérience Alpine A110S',
  other: 'demande',
};

// -----------------------------------------------------------------------------
// Briques HTML
// -----------------------------------------------------------------------------
const FONT = "Arial, 'Helvetica Neue', Helvetica, sans-serif";
const INK = '#1c1e23';
const MUTED = '#5b606b';
const RED = '#d00010';

const h1 = (text: string) =>
  `<h1 style="margin:0 0 16px;font-family:'Arial Narrow',${FONT};font-size:26px;line-height:1.15;font-weight:800;text-transform:uppercase;color:${INK};">${esc(text)}</h1>`;
const p = (html: string) => `<p style="margin:0 0 16px;">${html}</p>`;
const small = (html: string) => `<p style="margin:0 0 12px;font-size:13px;color:${MUTED};">${html}</p>`;

function button(label: string, href: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 24px;"><tr>
    <td style="background:${RED};"><a href="${esc(href)}" style="display:inline-block;padding:14px 26px;font-family:${FONT};font-size:15px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;color:#ffffff;text-decoration:none;">${esc(label)}</a></td>
  </tr></table>`;
}

function rows(items: Array<[string, string | undefined | null]>): string {
  const body = items
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(
      ([label, value]) => `<tr>
        <td style="padding:9px 12px 9px 0;border-bottom:1px solid #e6e6e1;font-size:13px;color:${MUTED};vertical-align:top;white-space:nowrap;">${esc(label)}</td>
        <td style="padding:9px 0;border-bottom:1px solid #e6e6e1;font-size:15px;color:${INK};vertical-align:top;">${value}</td>
      </tr>`,
    )
    .join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;border-top:2px solid ${INK};">${body}</table>`;
}

function notice(html: string, tone: 'info' | 'warning' | 'success' = 'info'): string {
  const color = tone === 'warning' ? '#c99a00' : tone === 'success' ? '#1f8f59' : '#2f6fd6';
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;"><tr>
    <td style="border-left:4px solid ${color};background:#f6f6f3;padding:14px 16px;font-size:14px;color:${INK};">${html}</td>
  </tr></table>`;
}

function qrBlock(ctx: EmailContext, reference: string | undefined): string {
  if (!ctx.qrSrc) return '';
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;"><tr>
    <td align="center" style="background:#f6f6f3;padding:20px;">
      <img src="${esc(ctx.qrSrc)}" width="180" height="180" alt="QR code de la réservation ${esc(reference)}" style="display:block;width:180px;height:180px;border:0;" />
      <p style="margin:12px 0 0;font-size:13px;color:${MUTED};">À présenter à l'accueil · Référence <strong style="color:${INK};font-size:16px;letter-spacing:1px;">${esc(reference)}</strong></p>
    </td>
  </tr></table>`;
}

function layout(ctx: EmailContext, subject: string, preheader: string, content: string): string {
  const [first = '', ...rest] = ctx.business.name.split(' ');
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#efefeb;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#efefeb;"><tr><td align="center" style="padding:24px 12px;">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;">
    <tr><td style="background:#0a0a0b;padding:22px 28px;font-family:'Arial Narrow',${FONT};font-size:20px;font-weight:800;letter-spacing:1px;text-transform:uppercase;">
      <span style="color:#f2f2ee;">${esc(first)}</span> <span style="color:#ff4d4d;">${esc(rest.join(' '))}</span>
    </td></tr>
    <tr><td style="height:6px;line-height:6px;font-size:0;background:${RED};">&nbsp;</td></tr>
    <tr><td style="padding:32px 28px 12px;font-family:${FONT};font-size:16px;line-height:1.55;color:${INK};">${content}</td></tr>
    <tr><td style="background:#f6f6f3;padding:20px 28px;font-family:${FONT};font-size:13px;line-height:1.5;color:${MUTED};">
      <strong style="color:${INK};">${esc(ctx.business.name)}</strong><br>
      ${esc(ctx.business.address)}, ${esc(ctx.business.postalCode)} ${esc(ctx.business.city)}<br>
      <a href="tel:${esc(ctx.business.phoneE164)}" style="color:${INK};">${esc(ctx.business.phone)}</a> · <a href="${esc(ctx.siteUrl)}" style="color:${INK};">${esc(ctx.siteUrl.replace(/^https?:\/\//, ''))}</a>
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;
}

/** Version texte : on retire les balises du contenu HTML. */
function toText(ctx: EmailContext, content: string): string {
  const text = content
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|h1|tr|table)>/gi, '\n')
    .replace(/<\/td>\s*<td[^>]*>/gi, ' : ')
    .replace(/<a [^>]*href="([^"]+)"[^>]*>([^<]*)<\/a>/gi, '$2 ($1)')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return `${text}\n\n--\n${ctx.business.name}\n${ctx.business.address}, ${ctx.business.postalCode} ${ctx.business.city}\n${ctx.business.phone}\n${ctx.siteUrl}`;
}

// -----------------------------------------------------------------------------
// Blocs métier
// -----------------------------------------------------------------------------
/** Page du site où le QR code d'un bon mène (vérification du solde). */
export function giftCardUrl(siteUrl: string, code: string): string {
  // « bon » et non « code » : ?code= est réservé au retour du lien de connexion Supabase
  return `${siteUrl}/bon-cadeau?bon=${encodeURIComponent(code)}`;
}

function giftValue(g: GiftCardPayload): string {
  return g.kind === 'product' && g.product ? `${g.product} (${money(g.amount_cents)})` : money(g.amount_cents);
}

function giftCodeBlock(g: GiftCardPayload, ctx: EmailContext): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;"><tr><td align="center" style="background:#0a0a0b;padding:24px;">
        <p style="margin:0 0 6px;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#8b909a;">Code du bon</p>
        <p style="margin:0;font-family:'Courier New',monospace;font-size:26px;font-weight:700;letter-spacing:3px;color:#f2f2ee;">${esc(g.code)}</p>
        ${ctx.qrSrc ? `<img src="${esc(ctx.qrSrc)}" width="150" height="150" alt="QR code du bon ${esc(g.code)}" style="display:block;margin:16px auto 0;width:150px;height:150px;border:0;background:#ffffff;padding:6px;" />` : ''}
      </td></tr></table>`;
}
function manageUrl(ctx: EmailContext, b: BookingPayload): string {
  return `${ctx.siteUrl}/reservation/${b.qr_token ?? ''}`;
}

function bookingTitle(b: BookingPayload): string {
  return b.product?.name ?? b.event?.title ?? 'Réservation';
}

function sessionsHtml(b: BookingPayload): string | undefined {
  if (b.event) return `${esc(capitalize(day(b.event.starts_at)))}<br>${time(b.event.starts_at)} – ${time(b.event.ends_at)}`;
  if (!b.sessions?.length) return undefined;
  const first = b.sessions[0]!;
  const list = b.sessions.map((s) => `${time(s.starts_at)} · ${esc(s.track)}`).join('<br>');
  return `${esc(capitalize(day(first.starts_at)))}<br>${list}`;
}

function participantsHtml(b: BookingPayload): string | undefined {
  if (!b.participants?.length) return undefined;
  return b.participants
    .map((x) => `${esc(x.first_name)} ${esc(x.last_name)}${x.role === 'passenger' ? ' <span style="color:#5b606b;">(passager)</span>' : ''}`)
    .join('<br>');
}

function amountsRows(b: BookingPayload): Array<[string, string | undefined]> {
  const lines: Array<[string, string | undefined]> = [['Total', money(b.total_cents)]];
  if (b.gift_card_applied_cents) lines.push(['Bon cadeau', `− ${money(b.gift_card_applied_cents)}`]);
  if (b.paid_cents) lines.push(['Déjà réglé', `− ${money(b.paid_cents)}`]);
  lines.push(['À régler sur place', `<strong>${money(b.amount_due_cents)}</strong>`]);
  return lines;
}

function bookingDetails(b: BookingPayload): string {
  return rows([
    ['Activité', esc(bookingTitle(b))],
    ['Date', sessionsHtml(b)],
    [b.event ? 'Pilotes' : 'Participants', participantsHtml(b) ?? String(b.participants_count ?? '')],
    ['Référence', `<strong>${esc(b.reference)}</strong>`],
    ...amountsRows(b),
  ]);
}

function policyNotice(ctx: EmailContext): string {
  const full = ctx.policy?.fullRefundHours;
  const credit = ctx.policy?.creditHours;
  if (!full || !credit) return '';
  return notice(
    `Report ou annulation sans frais jusqu'à ${full} h avant le départ ; entre ${full} h et ${credit} h, un avoir vous est proposé. En dessous, contactez le circuit.`,
  );
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function hello(name: string | undefined): string {
  return p(name ? `Bonjour ${esc(name)},` : 'Bonjour,');
}

function cancellationText(b: BookingPayload, ctx: EmailContext): string {
  const c = b.cancellation ?? {};
  const parts: string[] = [];
  if (c.gift_card_recredited_cents) parts.push(`Le montant réglé par bon cadeau (${money(c.gift_card_recredited_cents)}) a été recrédité sur votre bon.`);
  if (c.outcome === 'refund_due') parts.push(`Le circuit vous rembourse les ${money(c.paid_cents)} déjà réglés.`);
  if (c.credit_code) {
    const months = ctx.policy?.giftCardValidityMonths;
    parts.push(
      `Un avoir de <strong>${money(c.credit_amount_cents)}</strong> vous est attribué : code <strong style="letter-spacing:1px;">${esc(c.credit_code)}</strong>${months ? `, valable ${months} mois` : ''}.`,
    );
  }
  return parts.length ? notice(parts.join('<br>'), 'success') : '';
}

function requestLabel(type: string | undefined): string {
  return REQUEST_LABELS[type ?? 'other'] ?? 'demande';
}

// -----------------------------------------------------------------------------
// Modèles
// -----------------------------------------------------------------------------
type Builder = (payload: never, ctx: EmailContext) => { subject: string; preheader: string; content: string };

const TEMPLATES: Record<string, Builder> = {
  booking_confirmation: (b: BookingPayload, ctx) => ({
    subject: `Réservation confirmée · ${bookingTitle(b)} · ${day(b.starts_at)}`,
    preheader: `Référence ${b.reference} · ${time(b.starts_at)} · à présenter à l'accueil`,
    content:
      h1('Réservation confirmée') +
      hello(b.customer?.first_name) +
      p('Votre réservation est confirmée. Présentez ce QR code à l’accueil du circuit : le règlement se fait sur place.') +
      qrBlock(ctx, b.reference) +
      bookingDetails(b) +
      policyNotice(ctx) +
      button('Gérer ma réservation', manageUrl(ctx, b)),
  }),

  booking_reminder: (b: BookingPayload, ctx) => ({
    subject: `Rappel : ${bookingTitle(b)} demain à ${time(b.starts_at)}`,
    preheader: `On vous attend demain au circuit · Référence ${b.reference}`,
    content:
      h1('À demain sur la piste') +
      hello(b.customer?.first_name) +
      p(`Petit rappel : votre session <strong>${esc(bookingTitle(b))}</strong> a lieu demain à <strong>${time(b.starts_at)}</strong>.`) +
      qrBlock(ctx, b.reference) +
      bookingDetails(b) +
      button('Gérer ma réservation', manageUrl(ctx, b)),
  }),

  event_booking_confirmation: (b: BookingPayload, ctx) => ({
    subject: `Inscription confirmée · ${bookingTitle(b)}`,
    preheader: `Référence ${b.reference} · ${day(b.event?.starts_at)}`,
    content:
      h1('Inscription confirmée') +
      hello(b.customer?.first_name) +
      p(`Votre inscription à <strong>${esc(bookingTitle(b))}</strong> est enregistrée. Le règlement se fait sur place.`) +
      qrBlock(ctx, b.reference) +
      bookingDetails(b) +
      button('Gérer mon inscription', manageUrl(ctx, b)),
  }),

  event_reminder: (b: BookingPayload, ctx) => ({
    subject: `Rappel : ${bookingTitle(b)} demain`,
    preheader: `Référence ${b.reference}`,
    content:
      h1('À demain sur la piste') +
      hello(b.customer?.first_name) +
      p(`Petit rappel : <strong>${esc(bookingTitle(b))}</strong> a lieu demain à partir de <strong>${time(b.event?.starts_at)}</strong>.`) +
      qrBlock(ctx, b.reference) +
      bookingDetails(b) +
      button('Gérer mon inscription', manageUrl(ctx, b)),
  }),

  booking_rescheduled: (b: BookingPayload, ctx) => ({
    subject: `Réservation déplacée · ${bookingTitle(b)} · ${day(b.starts_at)}`,
    preheader: `Nouvel horaire : ${time(b.starts_at)} · Référence ${b.reference}`,
    content:
      h1('Nouvel horaire confirmé') +
      hello(b.customer?.first_name) +
      p('Votre réservation a bien été déplacée. Voici les nouvelles informations :') +
      qrBlock(ctx, b.reference) +
      bookingDetails(b) +
      button('Gérer ma réservation', manageUrl(ctx, b)),
  }),

  booking_cancelled: (b: BookingPayload, ctx) => ({
    subject: `Annulation de votre réservation ${b.reference}`,
    preheader: `Réservation ${b.reference} annulée`,
    content:
      h1('Réservation annulée') +
      hello(b.customer?.first_name) +
      p(`Votre réservation <strong>${esc(b.reference)}</strong> (${esc(bookingTitle(b))}, ${esc(day(b.starts_at))}) est annulée.`) +
      cancellationText(b, ctx) +
      button('Réserver une autre date', `${ctx.siteUrl}/reserver`),
  }),

  booking_cancelled_by_circuit: (b: BookingPayload, ctx) => ({
    subject: `Le circuit annule votre réservation ${b.reference}`,
    preheader: b.reason ?? 'Annulation par le circuit',
    content:
      h1('Réservation annulée par le circuit') +
      hello(b.customer?.first_name) +
      p(
        `Nous sommes désolés : le circuit doit annuler votre réservation <strong>${esc(b.reference)}</strong> du ${esc(day(b.starts_at))}.` +
          (b.reason ? `<br>Motif : ${esc(b.reason)}.` : ''),
      ) +
      cancellationText(b, ctx) +
      button('Réserver une autre date', `${ctx.siteUrl}/reserver`),
  }),

  booking_reschedule_required: (b: BookingPayload, ctx) => ({
    subject: `Votre réservation du ${day(b.starts_at)} doit être déplacée`,
    preheader: 'Choisissez une nouvelle date ou annulez sans frais',
    content:
      h1('Un changement est nécessaire') +
      hello(b.customer?.first_name) +
      p(
        `Le circuit a dû fermer le créneau de votre réservation <strong>${esc(b.reference)}</strong> (${esc(bookingTitle(b))}, ${esc(day(b.starts_at))} à ${time(b.starts_at)}).` +
          (b.reason ? `<br>Motif : ${esc(b.reason)}.` : ''),
      ) +
      notice('Choisissez une nouvelle date en ligne, ou annulez sans frais : les montants déjà réglés vous sont intégralement restitués.', 'warning') +
      button('Choisir une nouvelle date', manageUrl(ctx, b)),
  }),

  request_received: (r: RequestPayload, ctx) => ({
    subject: `Demande reçue · ${capitalize(requestLabel(r.type))} · ${r.reference}`,
    preheader: 'L’équipe du circuit vous recontacte',
    content:
      h1('Demande bien reçue') +
      hello(r.contact?.first_name) +
      p(`Merci ! Votre demande de <strong>${esc(requestLabel(r.type))}</strong> est enregistrée sous la référence <strong>${esc(r.reference)}</strong>. L’équipe du circuit revient vers vous pour organiser votre venue.`) +
      rows([
        ['Date souhaitée', r.details?.preferred_date ? esc(capitalize(day(String(r.details.preferred_date)))) : undefined],
        ['Participants', r.details?.participants_count ? esc(r.details.participants_count) : undefined],
        ['Référence', `<strong>${esc(r.reference)}</strong>`],
      ]) +
      small(`Une question ? Appelez le ${esc(ctx.business.phone)}.`),
  }),

  request_quoted: (r: RequestPayload, ctx) => ({
    subject: `Votre devis · ${capitalize(requestLabel(r.type))} · ${r.reference}`,
    preheader: r.quote_amount_cents ? `Montant : ${money(r.quote_amount_cents)}` : 'Votre devis',
    content:
      h1('Votre devis') +
      hello(r.contact_name) +
      p(`Voici notre proposition pour votre ${esc(requestLabel(r.type))} (référence <strong>${esc(r.reference)}</strong>).`) +
      rows([
        ['Date', r.preferred_date ? esc(capitalize(day(r.preferred_date))) : undefined],
        ['Participants', r.participants_count ? esc(r.participants_count) : undefined],
        ['Montant', r.quote_amount_cents != null ? `<strong>${money(r.quote_amount_cents)}</strong>` : undefined],
        ['Acompte', r.deposit_cents ? money(r.deposit_cents) : undefined],
      ]) +
      p(`Pour confirmer, répondez à cet email ou appelez le <strong>${esc(ctx.business.phone)}</strong>.`),
  }),

  request_confirmed: (r: RequestPayload, ctx) => ({
    subject: `Confirmé · ${capitalize(requestLabel(r.type))} · ${r.reference}`,
    preheader: r.preferred_date ? day(r.preferred_date) : 'Votre événement est confirmé',
    content:
      h1('C’est confirmé') +
      hello(r.contact_name) +
      p(`Votre demande (${esc(requestLabel(r.type))}) est confirmée${r.preferred_date ? ` pour le <strong>${esc(day(r.preferred_date))}</strong>` : ''}. Nous avons hâte de vous accueillir.`) +
      small(`Référence ${esc(r.reference)} · ${esc(ctx.business.phone)}`),
  }),

  request_cancelled: (r: RequestPayload, ctx) => ({
    subject: `Votre demande ${r.reference}`,
    preheader: 'Demande annulée',
    content:
      h1('Demande annulée') +
      hello(r.contact_name) +
      p(`Votre demande de ${esc(requestLabel(r.type))} (référence <strong>${esc(r.reference)}</strong>) est annulée. Pour toute question, appelez le ${esc(ctx.business.phone)}.`),
  }),

  gift_card_issued: (g: GiftCardPayload, ctx) => {
    const forRecipient = g.audience === 'recipient';
    const from = g.buyer_first_name || g.buyer_name;
    const intro = forRecipient
      ? `${from ? `<strong>${esc(from)}</strong> vous offre` : 'Vous recevez'} un bon cadeau <strong>${esc(giftValue(g))}</strong> à utiliser au ${esc(ctx.business.name)} !`
      : `Merci pour votre achat ! Voici le bon cadeau <strong>${esc(giftValue(g))}</strong>${g.recipient_name ? ` pour <strong>${esc(g.recipient_name)}</strong>` : ''}. Il est joint à cet email en PDF : imprimez-le ou transférez-le.`;
    return {
      subject: forRecipient
        ? `${from ? `${from} vous offre` : 'Voici'} un bon cadeau ${ctx.business.name}`
        : `Votre bon cadeau ${ctx.business.name} est prêt`,
      preheader: `Code ${g.code} · ${giftValue(g)}`,
      content:
        h1(forRecipient ? 'Un bon cadeau pour vous' : 'Votre bon cadeau') +
        hello(forRecipient ? g.recipient_name || undefined : g.buyer_first_name || undefined) +
        p(intro) +
        (!forRecipient && g.sent_to_recipient ? notice('Il a aussi été envoyé directement au bénéficiaire, comme demandé.', 'success') : '') +
        giftCodeBlock(g, ctx) +
        (g.message ? notice(`« ${esc(g.message)} »`) : '') +
        rows([
          ['Valeur', esc(giftValue(g))],
          ['Valable jusqu’au', g.expires_at ? esc(day(g.expires_at)) : undefined],
          ['Utilisation', 'En une ou plusieurs fois, lors de la réservation en ligne ou à l’accueil'],
        ]) +
        button('Réserver avec ce bon', g.code ? `${ctx.siteUrl}/reserver?bon=${encodeURIComponent(g.code)}` : `${ctx.siteUrl}/reserver`) +
        small(
          forRecipient
            ? 'Le bon est joint à cet email en PDF.'
            : `Le solde restant est consultable à tout moment sur ${esc(ctx.siteUrl.replace(/^https?:\/\//, ''))}/bon-cadeau.`,
        ),
    };
  },

  gift_card_ordered: (g: GiftCardPayload, ctx) => ({
    subject: `Commande de bon cadeau ${g.order_reference} reçue`,
    preheader: `Réglez ${money(g.amount_cents)} au circuit ou par téléphone pour recevoir le bon`,
    content:
      h1('Commande reçue') +
      hello(g.buyer?.first_name) +
      p(`Merci ! Votre commande de bon cadeau <strong>${esc(giftValue(g))}</strong> est enregistrée sous la référence <strong>${esc(g.order_reference)}</strong>.`) +
      notice(
        `Pour l’activer, réglez <strong>${money(g.amount_cents)}</strong> à l’accueil du circuit ou par téléphone au <strong>${esc(ctx.business.phone)}</strong>, en indiquant la référence ${esc(g.order_reference)}.`,
        'warning',
      ) +
      rows([
        ['Référence', `<strong>${esc(g.order_reference)}</strong>`],
        ['Valeur', esc(giftValue(g))],
        ['Pour', g.recipient_name ? esc(g.recipient_name) : undefined],
        ['Envoi du bon', g.deliver_to === 'recipient' ? `Directement au bénéficiaire (${esc(g.recipient_email)})` : 'À votre adresse email'],
      ]) +
      p('Dès le règlement, le bon vous est envoyé par email, en PDF avec son code unique.'),
  }),

  owner_gift_card_order: (g: GiftCardPayload, ctx) => ({
    subject: `Nouvelle commande de bon cadeau ${g.order_reference} · ${money(g.amount_cents)}`,
    preheader: `${g.buyer?.first_name ?? ''} ${g.buyer?.last_name ?? ''} · à encaisser`,
    content:
      h1('Bon cadeau à encaisser') +
      rows([
        ['Référence', `<strong>${esc(g.order_reference)}</strong>`],
        ['Valeur', esc(giftValue(g))],
        ['Acheteur', `${esc(g.buyer?.first_name)} ${esc(g.buyer?.last_name)}`],
        ['Email', g.buyer?.email ? esc(g.buyer.email) : undefined],
        ['Téléphone', g.buyer?.phone ? esc(g.buyer.phone) : undefined],
        ['Bénéficiaire', g.recipient_name ? esc(g.recipient_name) : undefined],
        ['Envoi', g.deliver_to === 'recipient' ? `Au bénéficiaire (${esc(g.recipient_email)})` : 'À l’acheteur'],
        ['Message', g.message ? esc(g.message) : undefined],
      ]) +
      p('Le bon sera envoyé automatiquement dès son activation dans l’espace dirigeant, après encaissement.') +
      button('Ouvrir l’espace dirigeant', `${ctx.siteUrl}/admin`),
  }),

  owner_new_booking: (b: BookingPayload, ctx) => ({
    subject: `Nouvelle réservation ${b.reference} · ${bookingTitle(b)} · ${day(b.starts_at)} ${time(b.starts_at)}`,
    preheader: `${b.customer?.first_name ?? ''} ${b.customer?.last_name ?? ''} · ${b.karts ?? b.participants_count} kart(s)`,
    content:
      h1('Nouvelle réservation') +
      bookingDetails(b) +
      rows([
        ['Client', `${esc(b.customer?.first_name)} ${esc(b.customer?.last_name)}`],
        ['Email', b.customer?.email ? esc(b.customer.email) : undefined],
        ['Téléphone', b.customer?.phone ? esc(b.customer.phone) : undefined],
      ]) +
      button('Ouvrir l’espace dirigeant', `${ctx.siteUrl}/admin`),
  }),

  owner_booking_cancelled: (b: BookingPayload, ctx) => ({
    subject: `Annulation ${b.reference} · ${bookingTitle(b)} · ${day(b.starts_at)}`,
    preheader: b.cancellation?.outcome === 'refund_due' ? 'Remboursement à effectuer' : 'Réservation annulée',
    content:
      h1('Réservation annulée') +
      (b.cancellation?.outcome === 'refund_due'
        ? notice(`Remboursement à effectuer : <strong>${money(b.cancellation.paid_cents)}</strong> déjà encaissés.`, 'warning')
        : '') +
      bookingDetails(b) +
      small(b.reason ? `Motif : ${esc(b.reason)}` : '') +
      button('Ouvrir l’espace dirigeant', `${ctx.siteUrl}/admin`),
  }),

  owner_booking_rescheduled: (b: BookingPayload, ctx) => ({
    subject: `Réservation déplacée ${b.reference} · ${day(b.starts_at)} ${time(b.starts_at)}`,
    preheader: `${b.customer?.first_name ?? ''} ${b.customer?.last_name ?? ''}`,
    content: h1('Réservation déplacée') + bookingDetails(b) + button('Ouvrir l’espace dirigeant', `${ctx.siteUrl}/admin`),
  }),

  owner_new_request: (r: RequestPayload, ctx) => {
    const details = Object.entries(r.details ?? {})
      .filter(([, value]) => value !== null && value !== '' && typeof value !== 'object')
      .map(([key, value]): [string, string] => [key.replace(/_/g, ' '), esc(value)]);
    return {
      subject: `Nouvelle demande ${requestLabel(r.type)} · ${r.reference}`,
      preheader: `${r.contact?.first_name ?? ''} ${r.contact?.last_name ?? ''}`,
      content:
        h1(`Nouvelle demande : ${requestLabel(r.type)}`) +
        rows([
          ['Référence', `<strong>${esc(r.reference)}</strong>`],
          ['Contact', `${esc(r.contact?.first_name)} ${esc(r.contact?.last_name)}${r.contact?.company ? ` (${esc(r.contact.company)})` : ''}`],
          ['Email', r.contact?.email ? esc(r.contact.email) : undefined],
          ['Téléphone', r.contact?.phone ? esc(r.contact.phone) : undefined],
          ...details,
        ]) +
        button('Traiter la demande', `${ctx.siteUrl}/admin`),
    };
  },
};

export const EMAIL_TEMPLATES = Object.keys(TEMPLATES);

/** Contenu du QR code d'un email (lien de gestion de la réservation), ou null. */
export function emailQrData(template: string, payload: unknown, siteUrl: string): string | null {
  if (template === 'gift_card_issued') {
    const code = (payload as GiftCardPayload | null)?.code;
    return code ? giftCardUrl(siteUrl, code) : null;
  }
  const needsQr = ['booking_confirmation', 'booking_reminder', 'event_booking_confirmation', 'event_reminder', 'booking_rescheduled'];
  const token = (payload as BookingPayload | null)?.qr_token;
  return needsQr.includes(template) && token ? `${siteUrl}/reservation/${token}` : null;
}

/** Rend un email ; null si le modèle est inconnu. */
export function renderEmail(template: string, payload: unknown, ctx: EmailContext): RenderedEmail | null {
  const builder = TEMPLATES[template];
  if (!builder) return null;
  const { subject, preheader, content } = builder((payload ?? {}) as never, ctx);
  return { subject, html: layout(ctx, subject, preheader, content), text: toText(ctx, content) };
}
