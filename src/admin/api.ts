import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth-context';
import { rpc, type RpcArgs } from '@/lib/data/source';
import type { CancellationResult } from '@/lib/data/types';
import type {
  AdminBlock,
  AdminBooking,
  AdminCatalog,
  AdminCustomer,
  AdminEvent,
  AdminGiftCard,
  AdminGiftCardDetails,
  AdminLapRecord,
  AdminMe,
  AdminRequest,
  AdminReview,
  AdminSlotOption,
  AuditRow,
  BlockInput,
  BlockPreview,
  BlockRow,
  BookingRow,
  CancelOutcome,
  ConflictActions,
  ContentRow,
  CustomerRow,
  Dashboard,
  EventParticipant,
  GiftCardSummary,
  Paged,
  PaymentMethod,
  Planning,
  PlanningDay,
  SalesLine,
  SettingRow,
  StaffMember,
  TrackAccessDay,
} from './types';

// Toutes les clés de l'espace dirigeant commencent par « admin » : une écriture
// invalide l'ensemble (volumes modestes, données toujours fraîches).
const k = {
  me: (uid: string | undefined) => ['admin', 'me', uid] as const,
  dashboard: (day: string) => ['admin', 'dashboard', day] as const,
  planning: (from: string, to: string, tracks: string[] | null) => ['admin', 'planning', from, to, tracks] as const,
  summary: (from: string, to: string, tracks: string[] | null) => ['admin', 'planning-summary', from, to, tracks] as const,
  bookings: (filters: RpcArgs) => ['admin', 'bookings', filters] as const,
  booking: (id: string) => ['admin', 'booking', id] as const,
  availability: (product: string, day: string, karts: number) => ['admin', 'availability', product, day, karts] as const,
  requests: (filters: RpcArgs) => ['admin', 'requests', filters] as const,
  giftCards: (filters: RpcArgs) => ['admin', 'gift-cards', filters] as const,
  giftCard: (id: string) => ['admin', 'gift-card', id] as const,
  customers: (filters: RpcArgs) => ['admin', 'customers', filters] as const,
  customer: (id: string) => ['admin', 'customer', id] as const,
  events: (past: boolean) => ['admin', 'events', past] as const,
  eventParticipants: (id: string) => ['admin', 'event-participants', id] as const,
  blocks: (from: string, to: string) => ['admin', 'blocks', from, to] as const,
  trackAccess: (from: string, to: string) => ['admin', 'track-access', from, to] as const,
  catalog: ['admin', 'catalog'] as const,
  content: ['admin', 'content'] as const,
  reviews: ['admin', 'reviews'] as const,
  laps: ['admin', 'laps'] as const,
  settings: ['admin', 'settings'] as const,
  staff: ['admin', 'staff'] as const,
  audit: (filters: RpcArgs) => ['admin', 'audit', filters] as const,
  sales: (from: string, to: string) => ['admin', 'sales', from, to] as const,
  giftSummary: (from: string, to: string) => ['admin', 'gift-summary', from, to] as const,
};

// -----------------------------------------------------------------------------
// Session
// -----------------------------------------------------------------------------
export function useAdminMe() {
  const { user, ready } = useAuth();
  return useQuery({
    queryKey: k.me(user?.id),
    queryFn: () => rpc<AdminMe | null>('admin_me'),
    enabled: ready && !!user,
    staleTime: 5 * 60_000,
  });
}

// Mutation générique : RPC puis rafraîchissement de l'espace dirigeant (et du
// site public quand le catalogue, les contenus ou le calendrier changent).
function useAdminMutation<TInput, TResult>(call: (input: TInput) => Promise<TResult>, alsoPublic = false) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: call,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin'] });
      if (alsoPublic) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['site-bundle'] }),
          queryClient.invalidateQueries({ queryKey: ['public-calendar'] }),
          queryClient.invalidateQueries({ queryKey: ['leaderboard'] }),
        ]);
      }
    },
  });
}

// -----------------------------------------------------------------------------
// Tableau de bord & planning
// -----------------------------------------------------------------------------
export function useDashboard(day: string) {
  return useQuery({
    queryKey: k.dashboard(day),
    queryFn: () => rpc<Dashboard>('admin_dashboard', { p_day: day }),
    refetchInterval: 60_000,
  });
}

export function usePlanning(from: string, to: string, trackIds: string[] | null) {
  return useQuery({
    queryKey: k.planning(from, to, trackIds),
    queryFn: () => rpc<Planning>('admin_planning', { p_from: from, p_to: to, p_track_ids: trackIds }),
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  });
}

export function usePlanningSummary(from: string, to: string, trackIds: string[] | null) {
  return useQuery({
    queryKey: k.summary(from, to, trackIds),
    queryFn: () => rpc<PlanningDay[]>('admin_planning_summary', { p_from: from, p_to: to, p_track_ids: trackIds }),
    placeholderData: keepPreviousData,
  });
}

export function useAdminAvailability(productId: string | undefined, day: string, karts: number) {
  return useQuery({
    queryKey: k.availability(productId ?? '', day, karts),
    queryFn: () => rpc<AdminSlotOption[]>('admin_availability', { p_product_id: productId, p_day: day, p_karts: karts }),
    enabled: !!productId && !!day,
  });
}

// -----------------------------------------------------------------------------
// Réservations
// -----------------------------------------------------------------------------
export function useBookings(filters: RpcArgs) {
  return useQuery({
    queryKey: k.bookings(filters),
    queryFn: () => rpc<Paged<BookingRow>>('admin_list_bookings', { p: filters }),
    placeholderData: keepPreviousData,
  });
}

export function useAdminBooking(id: string | null) {
  return useQuery({
    queryKey: k.booking(id ?? ''),
    queryFn: () => rpc<AdminBooking>('admin_get_booking', { p_booking_id: id }),
    enabled: !!id,
  });
}

export const lookupBooking = (code: string) => rpc<AdminBooking>('admin_lookup_booking', { p_code: code });

export interface ManualBookingInput {
  product_id: string;
  slot_ids: string[];
  karts: number;
  customer_id?: string;
  customer?: { first_name: string; last_name: string; email: string; phone: string };
  participants: unknown[];
  source: 'phone' | 'counter';
  internal_note: string;
  gift_card_code?: string | null;
  notify_customer: boolean;
}

export const useCreateBooking = () => useAdminMutation((p: ManualBookingInput) => rpc<AdminBooking>('admin_create_booking', { p }));
export const useMoveBooking = () =>
  useAdminMutation(({ id, slotIds, notify }: { id: string; slotIds: string[]; notify: boolean }) =>
    rpc<AdminBooking>('admin_move_booking', { p_booking_id: id, p_slot_ids: slotIds, p_notify: notify }),
  );
export const useCancelBookingAdmin = () =>
  useAdminMutation(({ id, outcome, reason, notify }: { id: string; outcome: CancelOutcome; reason: string; notify: boolean }) =>
    rpc<CancellationResult>('admin_cancel_booking', { p_booking_id: id, p_outcome: outcome, p_reason: reason, p_notify: notify }),
  );
export const useSetBookingStatus = () =>
  useAdminMutation(({ id, status }: { id: string; status: string }) => rpc<void>('admin_set_booking_status', { p_booking_id: id, p_status: status }));
export const useBookingNote = () =>
  useAdminMutation(({ id, note }: { id: string; note: string }) => rpc<void>('admin_update_booking_note', { p_booking_id: id, p_note: note }));
export const useCheckIn = () =>
  useAdminMutation(({ id, participantIds }: { id: string; participantIds: string[] | null }) =>
    rpc<AdminBooking>('admin_check_in', { p_booking_id: id, p_participant_ids: participantIds }),
  );
export const useSignWaiver = () =>
  useAdminMutation(({ participantId, signedBy }: { participantId: string; signedBy: string }) =>
    rpc<void>('admin_sign_waiver', { p_participant_id: participantId, p_signed_by: signedBy }),
  );
export const useUpsertParticipant = () =>
  useAdminMutation(({ bookingId, p }: { bookingId: string; p: Record<string, unknown> }) =>
    rpc<string>('admin_upsert_participant', { p_booking_id: bookingId, p }),
  );

export interface PaymentInput {
  booking_id?: string;
  request_id?: string;
  gift_card_id?: string;
  amount_cents: number;
  method: PaymentMethod;
  kind: 'payment' | 'refund';
  note: string;
}
export const useRecordPayment = () => useAdminMutation((p: PaymentInput) => rpc<string>('admin_record_payment', { p }));

// -----------------------------------------------------------------------------
// Blocages & événements
// -----------------------------------------------------------------------------
export function useBlocks(from: string, to: string) {
  return useQuery({
    queryKey: k.blocks(from, to),
    queryFn: () => rpc<BlockRow[]>('admin_list_blocks', { p_from: from, p_to: to }),
    placeholderData: keepPreviousData,
  });
}

export const previewBlock = (p: BlockInput, excludeSeries?: string) =>
  rpc<BlockPreview>('admin_preview_block', { p, p_exclude_series: excludeSeries ?? null });

export const useCreateBlock = () =>
  useAdminMutation(
    ({ p, actions }: { p: BlockInput; actions: ConflictActions | null }) =>
      rpc<{ series_id: string; block_ids: string[] }>('admin_create_block', { p, p_conflict_actions: actions }),
    true,
  );
export const useUpdateBlock = () =>
  useAdminMutation(
    ({ id, p, scope, actions }: { id: string; p: Partial<BlockInput>; scope: 'occurrence' | 'series'; actions: ConflictActions | null }) =>
      rpc<unknown>('admin_update_block', { p_block_id: id, p, p_scope: scope, p_conflict_actions: actions }),
    true,
  );
export const useDeleteBlock = () =>
  useAdminMutation(
    ({ id, scope }: { id: string; scope: 'occurrence' | 'series' }) => rpc<number>('admin_delete_block', { p_block_id: id, p_scope: scope }),
    true,
  );
export const useDuplicateBlock = () =>
  useAdminMutation(
    ({ id, date, actions }: { id: string; date: string; actions: ConflictActions | null }) =>
      rpc<unknown>('admin_duplicate_block', { p_block_id: id, p_target_date: date, p_conflict_actions: actions }),
    true,
  );
export const useConvertBlock = () =>
  useAdminMutation(
    ({ id, p }: { id: string; p: Record<string, unknown> }) => rpc<string>('admin_convert_block_to_event', { p_block_id: id, p }),
    true,
  );

export function useAdminEvents(includePast = false) {
  return useQuery({ queryKey: k.events(includePast), queryFn: () => rpc<AdminEvent[]>('admin_list_events', { p_include_past: includePast }) });
}
export function useEventParticipants(id: string | null) {
  return useQuery({
    queryKey: k.eventParticipants(id ?? ''),
    queryFn: () => rpc<EventParticipant[]>('admin_event_participants', { p_event_id: id }),
    enabled: !!id,
  });
}
export const useUpsertEvent = () => useAdminMutation((p: Record<string, unknown>) => rpc<string>('admin_upsert_event', { p }), true);

export function useTrackAccess(from: string, to: string) {
  return useQuery({ queryKey: k.trackAccess(from, to), queryFn: () => rpc<TrackAccessDay[]>('admin_track_access', { p_from: from, p_to: to }) });
}
export const useSetTrackAccess = () =>
  useAdminMutation(
    (a: { trackIds: string[]; from: string; to: string; status: string | null; label: string }) =>
      a.status
        ? rpc<number>('admin_set_track_access_status', {
            p_track_ids: a.trackIds,
            p_from: a.from,
            p_to: a.to,
            p_status: a.status,
            p_public_label: a.label,
          })
        : rpc<number>('admin_clear_track_access_status', { p_track_ids: a.trackIds, p_from: a.from, p_to: a.to }),
    true,
  );

// -----------------------------------------------------------------------------
// Demandes
// -----------------------------------------------------------------------------
export function useRequests(filters: RpcArgs) {
  return useQuery({ queryKey: k.requests(filters), queryFn: () => rpc<AdminRequest[]>('admin_list_requests', { p: filters }), placeholderData: keepPreviousData });
}
export const useUpdateRequest = () =>
  useAdminMutation(({ id, p }: { id: string; p: Record<string, unknown> }) => rpc<AdminRequest>('admin_update_request', { p_request_id: id, p }), true);

// -----------------------------------------------------------------------------
// Bons cadeaux
// -----------------------------------------------------------------------------
export function useGiftCards(filters: RpcArgs) {
  return useQuery({ queryKey: k.giftCards(filters), queryFn: () => rpc<Paged<AdminGiftCard>>('admin_list_gift_cards', { p: filters }), placeholderData: keepPreviousData });
}
export function useGiftCard(id: string | null) {
  return useQuery({ queryKey: k.giftCard(id ?? ''), queryFn: () => rpc<AdminGiftCardDetails>('admin_get_gift_card', { p_gift_card_id: id }), enabled: !!id });
}
export const useIssueGiftCard = () => useAdminMutation((p: Record<string, unknown>) => rpc<AdminGiftCard>('admin_issue_gift_card', { p }));
export const useActivateGiftCard = () =>
  useAdminMutation(({ id, method }: { id: string; method: PaymentMethod }) => rpc<AdminGiftCard>('admin_activate_gift_card', { p_gift_card_id: id, p_method: method }));
export const useSetGiftCardStatus = () =>
  useAdminMutation(({ id, status }: { id: string; status: 'active' | 'disabled' }) => rpc<void>('admin_set_gift_card_status', { p_gift_card_id: id, p_status: status }));
export const useAdjustGiftCard = () =>
  useAdminMutation(({ id, amount, note }: { id: string; amount: number; note: string }) =>
    rpc<number>('admin_adjust_gift_card', { p_gift_card_id: id, p_amount_cents: amount, p_note: note }),
  );

// -----------------------------------------------------------------------------
// Clients
// -----------------------------------------------------------------------------
export function useCustomers(filters: RpcArgs, enabled = true) {
  return useQuery({
    queryKey: k.customers(filters),
    queryFn: () => rpc<Paged<CustomerRow>>('admin_list_customers', { p: filters }),
    placeholderData: keepPreviousData,
    enabled,
  });
}
export function useCustomer(id: string | null) {
  return useQuery({ queryKey: k.customer(id ?? ''), queryFn: () => rpc<AdminCustomer>('admin_get_customer', { p_customer_id: id }), enabled: !!id });
}
export const useCreateCustomer = () => useAdminMutation((p: Record<string, unknown>) => rpc<string>('admin_create_customer', { p }));
export const useUpdateCustomer = () =>
  useAdminMutation(({ id, p }: { id: string; p: Record<string, unknown> }) => rpc<void>('admin_update_customer', { p_customer_id: id, p }));
export const useChronoValidation = () =>
  useAdminMutation(({ id, validated }: { id: string; validated: boolean }) =>
    rpc<void>('admin_set_chrono_validation', { p_customer_id: id, p_validated: validated }),
  );
export const exportCustomer = (id: string) => rpc<unknown>('admin_export_customer', { p_customer_id: id });
export const useAnonymizeCustomer = () => useAdminMutation((id: string) => rpc<void>('admin_anonymize_customer', { p_customer_id: id }));

// -----------------------------------------------------------------------------
// Chronos, contenu, avis
// -----------------------------------------------------------------------------
export function useLapRecords() {
  return useQuery({ queryKey: k.laps, queryFn: () => rpc<AdminLapRecord[]>('admin_list_lap_records') });
}
export const useUpsertLapRecord = () => useAdminMutation((p: Record<string, unknown>) => rpc<string>('admin_upsert_lap_record', { p }), true);
export const useImportLapRecords = () => useAdminMutation((rows: Record<string, unknown>[]) => rpc<number>('admin_import_lap_records', { p: rows }), true);
export const useDeleteLapRecord = () => useAdminMutation((id: string) => rpc<void>('admin_delete_lap_record', { p_id: id }), true);

export function useContent() {
  return useQuery({ queryKey: k.content, queryFn: () => rpc<ContentRow[]>('admin_list_content') });
}
export const useUpsertContent = () =>
  useAdminMutation(({ key, p }: { key: string; p: Partial<Omit<ContentRow, 'key'>> }) => rpc<void>('admin_upsert_site_content', { p_key: key, p }), true);

export function useReviews() {
  return useQuery({ queryKey: k.reviews, queryFn: () => rpc<AdminReview[]>('admin_list_reviews') });
}
export const useUpsertReview = () => useAdminMutation((p: Partial<AdminReview>) => rpc<string>('admin_upsert_review', { p }), true);
export const useDeleteReview = () => useAdminMutation((id: string) => rpc<void>('admin_delete_review', { p_id: id }), true);

// -----------------------------------------------------------------------------
// Catalogue & disponibilités
// -----------------------------------------------------------------------------
export function useAdminCatalog() {
  return useQuery({ queryKey: k.catalog, queryFn: () => rpc<AdminCatalog>('admin_catalog'), staleTime: 60_000 });
}
export const useUpsertProduct = () => useAdminMutation((p: Record<string, unknown>) => rpc<string>('admin_upsert_product', { p }), true);
export const useUpsertVehicle = () => useAdminMutation((p: Record<string, unknown>) => rpc<string>('admin_upsert_vehicle_type', { p }), true);
export const useUpsertTrack = () => useAdminMutation((p: Record<string, unknown>) => rpc<string>('admin_upsert_track', { p }), true);
export const useSetTrackCapacity = () =>
  useAdminMutation(
    (a: { trackId: string; vehicleTypeId: string; capacity: number; quota: number | null }) =>
      rpc<void>('admin_set_track_capacity', {
        p_track_id: a.trackId,
        p_vehicle_type_id: a.vehicleTypeId,
        p_capacity: a.capacity,
        p_online_quota_pct: a.quota,
        p_apply_future: true,
      }),
    true,
  );
export const useUpsertOpeningHours = () => useAdminMutation((p: Record<string, unknown>) => rpc<string>('admin_upsert_opening_hours', { p }), true);
export const useDeleteOpeningHours = () => useAdminMutation((id: string) => rpc<void>('admin_delete_opening_hours', { p_id: id }), true);
export const useGenerateSlots = () => useAdminMutation(({ from, to }: { from: string; to: string }) => rpc<number>('admin_generate_slots', { p_from: from, p_to: to }), true);

// -----------------------------------------------------------------------------
// Paramètres, équipe, journal, exports (dirigeant)
// -----------------------------------------------------------------------------
export function useSettings(enabled = true) {
  return useQuery({ queryKey: k.settings, queryFn: () => rpc<SettingRow[]>('admin_settings'), enabled });
}
export const useSetSetting = () => useAdminMutation(({ key, value }: { key: string; value: unknown }) => rpc<void>('admin_set_setting', { p_key: key, p_value: value }), true);

export function useStaff() {
  return useQuery({ queryKey: k.staff, queryFn: () => rpc<StaffMember[]>('admin_list_staff') });
}
export const useAddStaff = () =>
  useAdminMutation(({ email, role, name }: { email: string; role: string; name: string }) =>
    rpc<string>('admin_add_staff', { p_email: email, p_role: role, p_display_name: name }),
  );
export const useSetStaffRole = () =>
  useAdminMutation(({ userId, role, name, active }: { userId: string; role: string; name: string; active: boolean }) =>
    rpc<void>('admin_set_staff_role', { p_user_id: userId, p_role: role, p_display_name: name, p_active: active }),
  );

export function useAudit(filters: RpcArgs) {
  return useQuery({ queryKey: k.audit(filters), queryFn: () => rpc<Paged<AuditRow>>('admin_list_audit', { p: filters }), placeholderData: keepPreviousData });
}

export function useSalesExport(from: string, to: string, enabled: boolean) {
  return useQuery({ queryKey: k.sales(from, to), queryFn: () => rpc<SalesLine[]>('admin_sales_export', { p_from: from, p_to: to }), enabled });
}
export function useGiftCardSummary(from: string, to: string, enabled: boolean) {
  return useQuery({ queryKey: k.giftSummary(from, to), queryFn: () => rpc<GiftCardSummary>('admin_gift_card_summary', { p_from: from, p_to: to }), enabled });
}

export type { AdminBlock };
