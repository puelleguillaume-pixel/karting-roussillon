import type { BookingStatus, RequestType, TrackAccessStatus } from '@/lib/data/types';
import { formatTime, TIME_ZONE } from '@/lib/format';
import type {
  BlockReason,
  BlockType,
  BookingSource,
  CancelOutcome,
  ConflictAction,
  EventCategory,
  GiftCardStatus,
  PaymentMethod,
  RequestStatus,
} from './types';

export type Tone = 'neutral' | 'red' | 'green' | 'yellow' | 'blue' | 'outline';

export const BOOKING_STATUS: Record<BookingStatus, { label: string; tone: Tone }> = {
  pending: { label: 'En attente', tone: 'yellow' },
  confirmed: { label: 'Confirmée', tone: 'blue' },
  checked_in: { label: 'Arrivée', tone: 'green' },
  completed: { label: 'Terminée', tone: 'outline' },
  cancelled: { label: 'Annulée', tone: 'red' },
  no_show: { label: 'Absent', tone: 'neutral' },
  reschedule_required: { label: 'À reporter', tone: 'yellow' },
};

export const BOOKING_SOURCE: Record<BookingSource, string> = {
  online: 'En ligne',
  phone: 'Téléphone',
  counter: 'Comptoir',
  admin: 'Admin',
};

export const PAYMENT_METHOD: Record<PaymentMethod, string> = {
  cash: 'Espèces',
  card: 'Carte bancaire',
  check: 'Chèque',
  ancv: 'Chèques-Vacances ANCV',
  transfer: 'Virement',
  stripe: 'Paiement en ligne',
  other: 'Autre',
};

/** Moyens proposés au comptoir (le paiement en ligne n'est pas activé) */
export const COUNTER_METHODS: PaymentMethod[] = ['card', 'cash', 'check', 'ancv', 'transfer', 'other'];

export const CANCEL_OUTCOME: Record<CancelOutcome, { label: string; hint: string }> = {
  full_refund: { label: 'Restitution intégrale', hint: 'Bons recrédités ; ce qui a été encaissé est à rembourser.' },
  credit: { label: 'Avoir', hint: 'Bons recrédités ; ce qui a été encaissé devient un avoir (bon cadeau).' },
  none: { label: 'Sans restitution', hint: 'Rien n’est restitué au client.' },
};

export const CANCELLATION_RESULT: Record<string, string> = {
  full_refund: 'Restitution intégrale',
  refund_due: 'Remboursement à effectuer',
  credit: 'Avoir émis',
  none: 'Sans restitution',
};

export const REQUEST_STATUS: Record<RequestStatus, { label: string; tone: Tone }> = {
  new: { label: 'À traiter', tone: 'red' },
  quoted: { label: 'Devis envoyé', tone: 'yellow' },
  confirmed: { label: 'Confirmée', tone: 'blue' },
  paid: { label: 'Réglée', tone: 'green' },
  cancelled: { label: 'Annulée', tone: 'neutral' },
  lost: { label: 'Perdue', tone: 'outline' },
};

/** Colonnes du pipeline, dans l'ordre */
export const REQUEST_PIPELINE: RequestStatus[] = ['new', 'quoted', 'confirmed', 'paid'];

export const REQUEST_TYPE: Record<RequestType, string> = {
  birthday: 'Anniversaire',
  bachelor_party: 'EVG / EVJF',
  team_building: 'Team building',
  school_kart: 'École de pilotage kart',
  school_moto: 'École de pilotage moto',
  alpine: 'Alpine A110S',
  other: 'Autre demande',
};

export const GIFT_STATUS: Record<GiftCardStatus, { label: string; tone: Tone }> = {
  pending_payment: { label: 'À encaisser', tone: 'yellow' },
  active: { label: 'Actif', tone: 'green' },
  exhausted: { label: 'Utilisé', tone: 'outline' },
  expired: { label: 'Expiré', tone: 'neutral' },
  disabled: { label: 'Désactivé', tone: 'red' },
};

export const GIFT_SOURCE: Record<string, string> = {
  sale: 'Vente',
  manual: 'Émis au comptoir',
  credit: 'Avoir',
};

export const GIFT_TX: Record<string, string> = {
  issue: 'Émission',
  redeem: 'Utilisation',
  refund: 'Recrédit',
  adjust: 'Ajustement',
  expire: 'Expiration',
};

export const BLOCK_TYPE: Record<BlockType, string> = {
  full_day: 'Journée',
  morning: 'Matin',
  afternoon: 'Après-midi',
  custom: 'Plage libre',
};

export const BLOCK_REASON: Record<BlockReason, string> = {
  private_event: 'Événement privé',
  team_building: 'Team building',
  trackday: 'Trackday',
  competition: 'Compétition',
  maintenance: 'Entretien',
  weather: 'Météo',
  other: 'Autre',
};

export const CONFLICT_ACTION: Record<ConflictAction, { label: string; hint: string }> = {
  keep: { label: 'Conserver', hint: 'La réservation est maintenue malgré le blocage.' },
  reschedule: { label: 'Faire reporter', hint: 'Le client reçoit un lien pour choisir un autre créneau ou annuler avec restitution intégrale.' },
  cancel: { label: 'Annuler', hint: 'Annulation par le circuit, restitution intégrale et email au client.' },
};

export const EVENT_CATEGORY: Record<EventCategory, string> = {
  auto: 'Auto',
  moto: 'Moto',
  kart: 'Kart',
  mixed: 'Mixte',
};

export const ACCESS_STATUS_LABEL: Record<TrackAccessStatus, string> = {
  open: 'Ouvert',
  restricted: 'Accès restreint',
  closed: 'Fermé au droit de piste',
  trackday: 'Trackday',
  private: 'Privatisé',
};

export const WEEKDAYS = ['', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
export const WEEKDAYS_SHORT = ['', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'];
export const MONTHS_SHORT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

// Libellés du journal d'audit (action → texte) ; les actions inconnues s'affichent telles quelles
export const AUDIT_ACTION: Record<string, string> = {
  booking_create: 'Réservation saisie',
  booking_move: 'Réservation déplacée',
  booking_cancel: 'Réservation annulée',
  booking_status: 'Statut modifié',
  booking_note: 'Note interne modifiée',
  booking_check_in: 'Arrivée enregistrée',
  participant_upsert: 'Participant modifié',
  waiver_sign: 'Décharge signée au comptoir',
  payment_payment: 'Encaissement',
  payment_refund: 'Remboursement',
  block_create: 'Blocage créé',
  block_update: 'Blocage modifié',
  block_delete: 'Blocage supprimé',
  block_convert_to_event: 'Blocage converti en événement',
  block_conflict_keep: 'Réservation conservée (blocage)',
  block_conflict_reschedule: 'Report demandé (blocage)',
  block_conflict_cancel: 'Annulée par blocage',
  event_create: 'Événement créé',
  event_update: 'Événement modifié',
  request_update: 'Demande mise à jour',
  gift_card_issue: 'Bon émis',
  gift_card_activate: 'Bon encaissé et activé',
  gift_card_status: 'Statut du bon modifié',
  gift_card_adjust: 'Solde du bon ajusté',
  customer_create: 'Fiche client créée',
  customer_update: 'Fiche client modifiée',
  customer_export: 'Export RGPD',
  customer_anonymize: 'Client anonymisé',
  chrono_validation: 'Validation chrono',
  lap_record_upsert: 'Chrono enregistré',
  lap_record_delete: 'Chrono supprimé',
  content_upsert: 'Contenu modifié',
  review_upsert: 'Avis enregistré',
  review_delete: 'Avis supprimé',
  setting_update: 'Paramètre modifié',
  staff_role_set: 'Équipe modifiée',
  product_create: 'Produit créé',
  product_update: 'Produit modifié',
  vehicle_type_create: 'Véhicule créé',
  vehicle_type_update: 'Véhicule modifié',
  track_create: 'Piste créée',
  track_update: 'Piste modifiée',
  track_capacity_set: 'Capacité modifiée',
  opening_hours_upsert: 'Horaires modifiés',
  opening_hours_delete: 'Horaires supprimés',
  slots_generate: 'Créneaux générés',
  slot_capacity_set: 'Capacité ponctuelle',
  slot_open: 'Créneau rouvert',
  slot_close: 'Créneau fermé',
  track_access_status_set: 'Statut droits de piste',
  track_access_status_clear: 'Statut droits de piste effacé',
  sales_export: 'Export comptable',
};

// -----------------------------------------------------------------------------
// Dates (heure de Paris)
// -----------------------------------------------------------------------------
const dayMonth = new Intl.DateTimeFormat('fr-FR', { timeZone: TIME_ZONE, day: 'numeric', month: 'short' });
const dayMonthYear = new Intl.DateTimeFormat('fr-FR', { timeZone: TIME_ZONE, day: 'numeric', month: 'short', year: 'numeric' });
const shortDate = new Intl.DateTimeFormat('fr-FR', { timeZone: TIME_ZONE, weekday: 'short', day: 'numeric', month: 'short' });

/** « 26 sept. · 14h30 » (année affichée si différente de l'année en cours) */
export function formatDateTime(iso: string): string {
  const sameYear = new Date(iso).getFullYear() === new Date().getFullYear();
  return `${(sameYear ? dayMonth : dayMonthYear).format(new Date(iso))} · ${formatTime(iso)}`;
}

/** « sam. 26 sept. » */
export function formatShortDate(iso: string): string {
  return shortDate.format(new Date(iso));
}

/** Heure de Paris « HH:MM » d'un instant ISO (pour les champs time) */
export function parisClock(iso: string): string {
  return new Intl.DateTimeFormat('fr-FR', { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));
}

/** Date + heure locales de Paris → valeur timestamptz acceptée par Postgres */
export function parisTimestamp(day: string, clock: string): string {
  return `${day} ${clock}:00 ${TIME_ZONE}`;
}

/** « 12,5 » € → 1250 centimes (null si vide ou invalide) */
export function eurosToCents(value: string): number | null {
  const normalized = value.replace(/\s/g, '').replace(',', '.');
  if (normalized === '') return null;
  const euros = Number(normalized);
  return Number.isFinite(euros) ? Math.round(euros * 100) : null;
}

/** 1250 → « 12,50 » (champ de saisie) */
export function centsToEuros(cents: number | null | undefined): string {
  if (cents == null) return '';
  return (cents / 100).toLocaleString('fr-FR', { minimumFractionDigits: cents % 100 === 0 ? 0 : 2, useGrouping: false });
}
