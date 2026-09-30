// Formes renvoyées par les RPC (voir supabase/migrations). Les dates sont des
// chaînes ISO (timestamptz) ou AAAA-MM-JJ (date), identiques en mode Supabase
// et en mode démo.

export type TrackUsage = 'leisure' | 'track_access' | 'events' | 'baby';
export type ProductKind = 'session' | 'pack' | 'experience' | 'on_request';
export type RequestType =
  | 'birthday'
  | 'bachelor_party'
  | 'team_building'
  | 'school_kart'
  | 'school_moto'
  | 'alpine'
  | 'other';
export type TrackAccessStatus = 'open' | 'restricted' | 'closed' | 'trackday' | 'private';

export interface Track {
  id: string;
  slug: string;
  name: string;
  short_name: string;
  length_m: number | null;
  usage: TrackUsage;
  min_age: number | null;
  description: string;
  requires_booking: boolean;
  online_booking_enabled: boolean;
  display_on_circuits: boolean;
  image_path: string | null;
  sort_order: number;
}

export interface VehicleType {
  id: string;
  slug: string;
  name: string;
  short_label: string;
  engine: string;
  description: string;
  min_age: number;
  min_height_cm: number | null;
  seats: number;
  passenger_min_age: number | null;
  passenger_min_height_cm: number | null;
  is_adapted: boolean;
  image_path: string | null;
  sort_order: number;
}

export interface PackInfo {
  sessions_count: number;
  session_min: number;
  min_gap_min: number;
  same_day: boolean;
}

export interface Product {
  id: string;
  slug: string;
  kind: ProductKind;
  name: string;
  short_description: string;
  description: string;
  vehicle_type_id: string | null;
  request_type: RequestType | null;
  price_cents: number | null;
  price_label: string | null;
  duration_min: number | null;
  min_age: number | null;
  min_height_cm: number | null;
  age_label: string;
  requires_chrono_validation: boolean;
  is_online_bookable: boolean;
  active_months: number[] | null;
  metadata: ProductMetadata;
  image_path: string | null;
  is_featured: boolean;
  sort_order: number;
  track_ids: string[];
  pack: PackInfo | null;
}

export interface ProductMetadata {
  laps?: number;
  track_length_m?: number;
  extra_lap_cents?: number;
  extra_lap_note?: string;
  includes?: string[];
  [key: string]: unknown;
}

export interface OpeningHours {
  track_id: string | null;
  weekday: number;
  opens_at: string;
  closes_at: string;
  is_closed: boolean;
  valid_from: string | null;
  valid_to: string | null;
  priority: number;
  label: string;
}

export interface Review {
  id: string;
  author_name: string;
  rating: number;
  body: string;
  source: 'google' | 'facebook' | 'site' | 'other';
  review_date: string | null;
}

export interface ContentBlock<D = Record<string, unknown>> {
  title: string;
  body: string;
  data: D;
}

export interface SectionText {
  title: string;
  body: string;
}

export interface PageContentData {
  eyebrow?: string;
  seo_title?: string;
  seo_description?: string;
  sections?: Record<string, SectionText | undefined>;
  request_type?: RequestType;
  form_title?: string;
  hero_image?: string | null;
  hero_video?: string | null;
  hero_poster?: string | null;
  cta_primary?: string;
  cta_secondary?: string;
  steps?: SectionText[];
}

export interface ContactData {
  address: string;
  postal_code: string;
  city: string;
  area?: string;
  phone: string;
  phone_e164: string;
  opening: string;
  maps_query?: string;
  /** Coordonnées approchées (météo du tableau de bord, données structurées) */
  geo?: { lat: number; lng: number };
  socials?: Partial<Record<'facebook' | 'instagram' | 'youtube' | 'tiktok', string>>;
}

export interface BrandData {
  logo_path?: string | null;
  logo_alt?: string;
}

export interface BannerData {
  level?: 'info' | 'warning' | 'alert';
}

export interface PublicSettings {
  hold_minutes?: number;
  booking_min_lead_minutes?: number;
  booking_horizon_days?: number;
  max_karts_per_booking?: number;
  cancel_full_refund_hours?: number;
  cancel_credit_hours?: number;
  gift_card_validity_months?: number;
  online_payment_enabled?: boolean;
  [key: string]: unknown;
}

export interface SiteBundle {
  settings: PublicSettings;
  content: Record<string, ContentBlock | undefined>;
  tracks: Track[];
  vehicle_types: VehicleType[];
  products: Product[];
  opening_hours: OpeningHours[];
  reviews: Review[];
}

export interface CalendarItem {
  item_type: 'event' | 'block' | 'track_status';
  title: string | null;
  starts_at: string | null;
  ends_at: string | null;
  day: string;
  status: string;
  track_slugs: string[];
  event_slug: string | null;
  places_left: number | null;
}

export interface LeaderboardRecord {
  rank: number;
  driver_name: string;
  lap_time_ms: number;
  recorded_on: string;
}

export interface LeaderboardGroup {
  track_id: string;
  track_slug: string;
  track_name: string;
  track_length_m: number | null;
  category_label: string;
  records: LeaderboardRecord[];
}

export interface RequestContact {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  company?: string;
}

export interface SubmitRequestResult {
  request_id: string;
  reference: string;
}

// -----------------------------------------------------------------------------
// Réservation
// -----------------------------------------------------------------------------
export interface AvailabilitySlot {
  slot_id: string;
  track_id: string;
  track_name: string;
  starts_at: string;
  ends_at: string;
  remaining: number;
  available: boolean;
}

export interface AvailableDay {
  day: string;
  available_slots: number;
}

export interface HoldResult {
  hold_token: string;
  expires_at: string;
}

export type BookingStatus = 'pending' | 'confirmed' | 'checked_in' | 'completed' | 'cancelled' | 'no_show' | 'reschedule_required';

export interface BookingDetails {
  id: string;
  reference: string;
  qr_token: string;
  status: BookingStatus;
  source: string;
  starts_at: string;
  booking_date: string;
  karts: number;
  participants_count: number;
  unit_price_cents: number;
  total_cents: number;
  gift_card_applied_cents: number;
  paid_cents: number;
  amount_due_cents: number;
  cancellation_outcome: string | null;
  product: { id: string; slug: string; name: string; kind: ProductKind } | null;
  event: { id: string; slug: string; title: string; starts_at: string; ends_at: string } | null;
  customer: { first_name: string; last_name: string; email: string | null; phone: string };
  sessions: Array<{ slot_id: string; track_id: string; track: string; starts_at: string; ends_at: string; karts: number }>;
  participants: Array<{ id: string; role: 'driver' | 'passenger'; first_name: string; last_name: string; waiver_signed: boolean; checked_in: boolean }>;
}

export interface ManagedBooking extends BookingDetails {
  can_cancel: boolean;
  can_reschedule: boolean;
  cancel_outcome_if_now: 'full_refund' | 'credit' | 'none';
}

export interface ConfirmBookingResult {
  booking_id: string;
  reference: string;
  qr_token: string;
  starts_at: string;
  total_cents: number;
  gift_card_applied_cents: number;
  amount_due_cents: number;
}

export interface CancellationResult {
  booking_id: string;
  reference: string;
  outcome: 'full_refund' | 'credit' | 'none' | 'refund_due';
  gift_card_recredited_cents: number;
  paid_cents: number;
  credit_code: string | null;
  credit_amount_cents: number | null;
}

export interface ParticipantInput {
  role: 'driver' | 'passenger';
  first_name: string;
  last_name: string;
  birth_date: string;
  height_cm?: number | null;
  height_certified?: boolean;
  guardian_name?: string;
  extra?: Record<string, string>;
}

export interface CustomerInput {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
}

export interface PublicEvent {
  id: string;
  slug: string;
  title: string;
  kind: string;
  category: string;
  description: string;
  starts_at: string;
  ends_at: string;
  capacity: number;
  price_cents: number | null;
  requires_own_vehicle: boolean;
  is_bookable: boolean;
  places_left: number;
  tracks: Array<{ slug: string; name: string; length_m: number | null }>;
}

export interface Waiver {
  version: number;
  title: string;
  body: string;
}

export interface CustomerProfile {
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string;
}

export interface MyGiftCard {
  code: string | null; // null tant que le bon n'est pas réglé
  order_reference: string | null;
  kind: 'amount' | 'product';
  status: 'pending_payment' | 'active' | 'exhausted' | 'expired' | 'disabled';
  initial_amount_cents: number;
  balance_cents: number;
  issued_at: string | null;
  expires_at: string | null;
  recipient_name: string;
  message: string;
  product: string | null;
}

export interface GiftCardOrderInput {
  kind: 'amount' | 'product';
  amount_cents?: number;
  product_id?: string;
  recipient_name: string;
  recipient_email?: string;
  deliver_to: 'buyer' | 'recipient';
  message: string;
  buyer: CustomerInput;
  accept_terms: boolean;
}

export interface GiftCardOrderResult {
  order_reference: string;
  amount_cents: number;
  kind: 'amount' | 'product';
  product: string | null;
  recipient_name: string;
  deliver_to: 'buyer' | 'recipient';
}

export interface ActivatedGiftCard {
  code: string;
  kind: 'amount' | 'product';
  initial_amount_cents: number;
  expires_at: string;
  recipient_name: string;
  message: string;
  product_id: string | null;
}

export interface OutboxEmail {
  id: string;
  template: string;
  to_email: string;
  payload: unknown;
  status: string;
  created_at: string;
}

export interface GiftCardCheck {
  status: 'active' | 'exhausted' | 'expired';
  kind: 'amount' | 'product';
  balance_cents: number;
  expires_at: string;
  product: { id: string; name: string; slug: string } | null;
}
