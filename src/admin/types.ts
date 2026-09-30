// Formes renvoyées par les RPC de l'espace dirigeant (admin_*).
// Voir supabase/migrations/20260926100800_admin_rpc.sql et 20260930100000_admin_read_api.sql.
import type { BookingDetails, BookingStatus, OpeningHours, PackInfo, ProductKind, ProductMetadata, RequestType, TrackAccessStatus, TrackUsage } from '@/lib/data/types';

export type StaffRole = 'owner' | 'staff';
export type BookingSource = 'online' | 'phone' | 'counter' | 'admin';
export type PaymentMethod = 'cash' | 'card' | 'check' | 'ancv' | 'transfer' | 'stripe' | 'other';
export type RequestStatus = 'new' | 'quoted' | 'confirmed' | 'paid' | 'cancelled' | 'lost';
export type GiftCardStatus = 'pending_payment' | 'active' | 'exhausted' | 'expired' | 'disabled';
export type BlockType = 'full_day' | 'morning' | 'afternoon' | 'custom';
export type BlockReason = 'private_event' | 'team_building' | 'trackday' | 'competition' | 'maintenance' | 'weather' | 'other';
export type ConflictAction = 'keep' | 'reschedule' | 'cancel';
export type CancelOutcome = 'full_refund' | 'credit' | 'none';
export type EventKind = 'trackday' | 'competition' | 'event';
export type EventCategory = 'auto' | 'moto' | 'kart' | 'mixed';

export interface AdminMe {
  user_id: string;
  role: StaffRole;
  display_name: string;
}

export interface Paged<T> {
  total: number;
  rows: T[];
}

// -----------------------------------------------------------------------------
// Tableau de bord
// -----------------------------------------------------------------------------
export interface Revenue {
  collected_cents: number;
  gift_cards_redeemed_cents: number;
  gift_cards_sold_cents: number;
  booked_value_cents: number;
}

export interface Dashboard {
  day: string;
  bookings_count: number;
  participants_count: number;
  checked_in_count: number;
  fill_rate: number;
  slots: Array<{
    slot_id: string;
    track: string;
    starts_at: string;
    blocked: boolean;
    capacity: number;
    booked: number;
    bookings: Array<{ id: string; reference: string; status: BookingStatus; karts: number; customer: string }>;
  }>;
  pending_requests: number;
  reschedule_required: number;
  refunds_due: number;
  upcoming_blocks: Array<{ id: string; starts_at: string; ends_at: string; reason: BlockReason; public_label: string | null; all_tracks: boolean }>;
  upcoming_events: Array<{ id: string; title: string; starts_at: string; capacity: number }>;
  revenue?: { day: Revenue; week: Revenue; month: Revenue };
}

// -----------------------------------------------------------------------------
// Planning
// -----------------------------------------------------------------------------
export interface PlanningSlot {
  id: string;
  track_id: string;
  starts_at: string;
  ends_at: string;
  is_active: boolean;
  capacities: Array<{ vehicle_type_id: string; capacity: number; online_capacity: number; is_override: boolean; booked: number; held: number }>;
}

export interface PlanningBooking {
  id: string;
  reference: string;
  status: BookingStatus;
  source: BookingSource;
  karts: number;
  participants_count: number;
  product: string | null;
  vehicle_type_id: string | null;
  customer: string;
  phone: string;
  sessions: Array<{ session_id: string; slot_id: string; seq: number }>;
}

export interface AdminBlock {
  id: string;
  series_id: string;
  starts_at: string;
  ends_at: string;
  block_type: BlockType;
  reason: BlockReason;
  public_label: string | null;
  is_public: boolean;
  all_tracks: boolean;
  recurrence_rule: string | null;
  event_id?: string | null;
  request_id?: string | null;
  customer_id?: string | null;
  internal_note: string;
  track_ids: string[];
}

export interface AdminEvent {
  id: string;
  slug: string;
  title: string;
  kind: EventKind;
  category: EventCategory;
  description: string;
  starts_at: string;
  ends_at: string;
  capacity: number;
  price_cents: number | null;
  vat_rate_bp: number;
  requires_own_vehicle: boolean;
  is_published: boolean;
  is_bookable: boolean;
  image_path: string | null;
  track_ids?: string[];
  booked?: number;
  bookings_count?: number;
  block_id?: string | null;
}

export interface Planning {
  slots: PlanningSlot[];
  bookings: PlanningBooking[];
  blocks: AdminBlock[];
  events: AdminEvent[];
}

export interface PlanningDay {
  day: string;
  capacity: number;
  booked: number;
  bookings_count: number;
  blocks: Array<Pick<AdminBlock, 'id' | 'starts_at' | 'ends_at' | 'block_type' | 'reason' | 'public_label' | 'all_tracks' | 'track_ids'>>;
  events: Array<{ id: string; title: string; capacity: number; booked: number }>;
}

export interface AdminSlotOption {
  slot_id: string;
  track_id: string;
  track_name: string;
  starts_at: string;
  ends_at: string;
  remaining: number;
  blocked: boolean;
  available: boolean;
}

// -----------------------------------------------------------------------------
// Réservations
// -----------------------------------------------------------------------------
export interface BookingRow {
  id: string;
  reference: string;
  status: BookingStatus;
  source: BookingSource;
  starts_at: string;
  booking_date: string;
  product: string | null;
  event: string | null;
  event_id: string | null;
  customer: { id: string; name: string; email: string | null; phone: string };
  karts: number;
  participants_count: number;
  total_cents: number;
  gift_card_applied_cents: number;
  paid_cents: number;
  amount_due_cents: number;
  cancellation_outcome: string | null;
  created_at: string;
  tracks: string[];
}

export interface AdminParticipant {
  id: string;
  role: 'driver' | 'passenger';
  first_name: string;
  last_name: string;
  waiver_signed: boolean;
  checked_in: boolean;
  birth_date: string;
  height_cm: number | null;
  height_certified: boolean;
  waiver_signed_by: string | null;
  extra: Record<string, unknown>;
}

export interface AdminBooking extends Omit<BookingDetails, 'participants' | 'customer' | 'source'> {
  source: BookingSource;
  customer: { id: string; first_name: string; last_name: string; email: string | null; phone: string };
  customer_id: string;
  customer_note: string;
  internal_note: string;
  chrono_validated: boolean;
  created_at: string;
  checked_in_at: string | null;
  participants: AdminParticipant[];
  product_id: string | null;
  vehicle_type_id: string | null;
  sessions_required: number;
  vat_rate_bp: number;
  cancel_reason: string | null;
  cancelled_at: string | null;
  terms_accepted_at: string | null;
  waiver_version: number | null;
  request_id: string | null;
  payments: Array<{ id: string; kind: 'payment' | 'refund'; method: PaymentMethod; amount_cents: number; note: string; paid_at: string; recorded_by: string | null }>;
  gift_card_transactions: Array<{ code: string; kind: string; amount_cents: number; created_at: string }>;
  history: Array<{ action: string; created_at: string; actor: string }>;
  is_today?: boolean;
}

// -----------------------------------------------------------------------------
// Demandes, bons, clients
// -----------------------------------------------------------------------------
export interface AdminRequest {
  id: string;
  reference: string;
  type: RequestType;
  status: RequestStatus;
  customer_id: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  company: string;
  preferred_date: string | null;
  alternative_date: string | null;
  participants_count: number | null;
  message: string;
  details: Record<string, unknown>;
  quote_amount_cents: number | null;
  deposit_cents: number | null;
  internal_note: string;
  product_id: string | null;
  product: string | null;
  assigned_to: string | null;
  assigned_name: string | null;
  status_changed_at: string;
  created_at: string;
  paid_cents: number;
  block: { id: string; starts_at: string; ends_at: string; reason: BlockReason; public_label: string | null } | null;
}

export interface AdminGiftCard {
  id: string;
  code: string;
  kind: 'amount' | 'product';
  source: 'sale' | 'manual' | 'credit';
  status: GiftCardStatus;
  product_id: string | null;
  product: string | null;
  initial_amount_cents: number;
  balance_cents: number;
  purchaser: { id: string; name: string; email: string | null; phone: string } | null;
  recipient_name: string;
  recipient_email: string | null;
  message: string;
  order_reference: string | null;
  deliver_to: 'buyer' | 'recipient';
  ordered_at: string | null;
  issued_at: string | null;
  expires_at: string | null;
  created_at: string;
}

export interface AdminGiftCardDetails extends AdminGiftCard {
  origin_booking: string | null;
  created_by: string | null;
  transactions: Array<{
    id: string;
    kind: 'issue' | 'redeem' | 'refund' | 'adjust' | 'expire';
    amount_cents: number;
    balance_after_cents: number;
    note: string;
    booking_reference: string | null;
    booking_id: string | null;
    created_at: string;
    created_by: string | null;
  }>;
  payments: Array<{ kind: 'payment' | 'refund'; method: PaymentMethod; amount_cents: number; paid_at: string }>;
}

export interface CustomerRow {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string;
  company: string;
  birth_date: string | null;
  chrono_validated: boolean;
  anonymized: boolean;
  has_account: boolean;
  created_at: string;
  bookings_count: number;
  last_booking_at: string | null;
}

export interface AdminCustomer {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string;
  company: string;
  birth_date: string | null;
  chrono_validated: boolean;
  chrono_validated_at: string | null;
  chrono_validated_by: string | null;
  marketing_opt_in: boolean;
  internal_notes: string;
  anonymized_at: string | null;
  has_account: boolean;
  created_at: string;
  paid_cents: number;
  bookings: Array<{ id: string; reference: string; status: BookingStatus; starts_at: string; product: string | null; karts: number; participants_count: number; total_cents: number; amount_due_cents: number }>;
  requests: Array<{ id: string; reference: string; type: RequestType; status: RequestStatus; preferred_date: string | null; created_at: string }>;
  gift_cards: Array<{ id: string; code: string; status: GiftCardStatus; kind: string; initial_amount_cents: number; balance_cents: number; recipient_name: string; order_reference: string | null; expires_at: string | null }>;
  lap_records: Array<{ id: string; track: string; category_label: string; lap_time_ms: number; recorded_on: string }>;
}

export interface BlockRow extends AdminBlock {
  series_count: number;
  series_future_count: number;
  event: { id: string; title: string; slug: string } | null;
  request: { id: string; reference: string; type: RequestType } | null;
  customer: { id: string; name: string; company: string } | null;
  created_by: string | null;
  created_at: string;
  kept_bookings: number;
}

export interface BlockConflict {
  booking_id: string;
  reference: string;
  status: BookingStatus;
  starts_at: string;
  product_name: string | null;
  karts: number;
  participants_count: number;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string;
  within_warning_window: boolean;
}

export interface BlockPreview {
  occurrences: Array<{ starts_at: string; ends_at: string }>;
  conflicts: BlockConflict[];
  warning_hours: number;
}

export interface BlockInput {
  block_type: BlockType;
  date?: string;
  starts_at?: string;
  ends_at?: string;
  all_tracks: boolean;
  track_ids: string[];
  reason: BlockReason;
  public_label: string;
  is_public: boolean;
  recurrence_rule: string;
  internal_note: string;
  customer_id?: string | null;
  request_id?: string | null;
  event_id?: string | null;
}

export interface ConflictActions {
  default: ConflictAction;
  overrides: Record<string, ConflictAction>;
}

// -----------------------------------------------------------------------------
// Catalogue, contenus, paramètres
// -----------------------------------------------------------------------------
export interface AdminTrack {
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
  enforce_run_groups: boolean;
  max_karts_on_track: number | null;
  slot_interval_min: number;
  session_min: number;
  display_on_circuits: boolean;
  image_path: string | null;
  sort_order: number;
  is_active: boolean;
}

export interface AdminVehicleType {
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
  run_group: string;
  fleet_count: number;
  image_path: string | null;
  sort_order: number;
  is_active: boolean;
}

export interface AdminProduct {
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
  vat_rate_bp: number;
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
  is_active: boolean;
  track_ids: string[];
  pack: PackInfo | null;
}

export interface TrackCapacity {
  track_id: string;
  vehicle_type_id: string;
  capacity: number;
  online_quota_pct: number | null;
}

export interface AdminOpeningHours extends OpeningHours {
  id: string;
}

export interface AdminCatalog {
  tracks: AdminTrack[];
  vehicle_types: AdminVehicleType[];
  products: AdminProduct[];
  capacities: TrackCapacity[];
  opening_hours: AdminOpeningHours[];
}

export interface TrackAccessDay {
  track_id: string;
  day: string;
  status: TrackAccessStatus;
  public_label: string;
}

export interface ContentRow {
  key: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  is_published: boolean;
  updated_at: string;
  updated_by: string | null;
}

export interface AdminReview {
  id: string;
  author_name: string;
  rating: number;
  body: string;
  source: 'google' | 'facebook' | 'site' | 'other';
  review_date: string | null;
  is_published: boolean;
  sort_order: number;
}

export interface AdminLapRecord {
  id: string;
  track_id: string;
  track: string;
  vehicle_type_id: string | null;
  category_label: string;
  driver_name: string;
  customer_id: string | null;
  customer_name: string | null;
  lap_time_ms: number;
  recorded_on: string;
  is_published: boolean;
}

export interface SettingRow {
  key: string;
  value: unknown;
  description: string;
  is_public: boolean;
  updated_at: string;
  updated_by: string | null;
}

export interface StaffMember {
  user_id: string;
  email: string | null;
  role: StaffRole;
  display_name: string;
  is_active: boolean;
  created_at: string;
  is_me: boolean;
}

export interface AuditRow {
  id: number;
  created_at: string;
  actor: string | null;
  actor_role: StaffRole | null;
  action: string;
  entity: string;
  entity_id: string | null;
  before: unknown;
  after: unknown;
}

export interface SalesLine {
  occurred_at: string;
  line_type: 'sale' | 'refund' | 'gift_card_sale' | 'gift_card_refund' | 'gift_card_redemption';
  reference: string | null;
  label: string;
  customer: string;
  payment_method: string;
  amount_ttc_cents: number;
  vat_rate_bp: number;
  vat_cents: number;
  amount_ht_cents: number;
  is_deferred: boolean;
  stripe_payment_intent: string | null;
}

export interface GiftCardSummary {
  issued_count: number;
  issued_cents: number;
  redeemed_cents: number;
  expired_cents: number;
  adjusted_cents: number;
  outstanding_cents: number;
  outstanding_count: number;
}

export interface EventParticipant {
  booking_reference: string;
  booking_status: BookingStatus;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string;
  first_name: string;
  last_name: string;
  birth_date: string;
  extra: Record<string, unknown>;
  waiver_signed: boolean;
  amount_due_cents: number;
}
