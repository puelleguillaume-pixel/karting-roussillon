import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth-context';
import { getDataSource, rpc } from '@/lib/data/source';
import type {
  AvailabilitySlot,
  AvailableDay,
  BookingDetails,
  CancellationResult,
  ConfirmBookingResult,
  CustomerInput,
  CustomerProfile,
  GiftCardOrderInput,
  GiftCardOrderResult,
  HoldResult,
  ManagedBooking,
  MyGiftCard,
  OutboxEmail,
  ParticipantInput,
  PublicEvent,
  Waiver,
} from '@/lib/data/types';

// -----------------------------------------------------------------------------
// Disponibilités (rafraîchies en continu pendant le choix du créneau)
// -----------------------------------------------------------------------------
export function useAvailableDays(productId: string | undefined, from: string, to: string, karts: number) {
  return useQuery({
    queryKey: ['available-days', productId, from, to, karts],
    queryFn: () => rpc<AvailableDay[]>('get_available_days', { p_product_id: productId, p_from: from, p_to: to, p_karts: karts }),
    enabled: !!productId,
    staleTime: 30_000,
    refetchInterval: 60_000,
    placeholderData: keepPreviousData,
  });
}

export function useAvailability(productId: string | undefined, day: string | null, karts: number) {
  return useQuery({
    queryKey: ['availability', productId, day, karts],
    queryFn: () => rpc<AvailabilitySlot[]>('get_availability', { p_product_id: productId, p_day: day, p_karts: karts }),
    enabled: !!productId && !!day,
    staleTime: 15_000,
    refetchInterval: 30_000,
    placeholderData: keepPreviousData,
  });
}

// -----------------------------------------------------------------------------
// Parcours de réservation
// -----------------------------------------------------------------------------
export function createHold(productId: string, slotIds: string[], karts: number) {
  return rpc<HoldResult>('create_booking_hold', { p_product_id: productId, p_slot_ids: slotIds, p_karts: karts });
}

export function releaseHold(holdToken: string) {
  return rpc<void>('release_booking_hold', { p_hold_token: holdToken }).catch(() => undefined);
}

export interface ConfirmInput {
  holdToken: string;
  customer: CustomerInput;
  participants: ParticipantInput[];
  note: string;
  giftCardCode: string | null;
}

export function useConfirmBooking() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ConfirmInput) =>
      rpc<ConfirmBookingResult>('confirm_booking', {
        p_hold_token: input.holdToken,
        p_customer: input.customer,
        p_participants: input.participants,
        p_accept_terms: true,
        p_accept_waiver: true,
        p_customer_note: input.note,
        p_gift_card_code: input.giftCardCode,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['availability'] });
      void queryClient.invalidateQueries({ queryKey: ['available-days'] });
      void queryClient.invalidateQueries({ queryKey: ['me'] });
    },
  });
}

export function useWaiver() {
  return useQuery({
    queryKey: ['waiver'],
    queryFn: () => rpc<Waiver | null>('get_current_waiver'),
    staleTime: 10 * 60_000,
  });
}

// -----------------------------------------------------------------------------
// Événements (trackdays)
// -----------------------------------------------------------------------------
export function usePublicEvent(slug: string | undefined) {
  return useQuery({
    queryKey: ['event', slug],
    queryFn: () => rpc<PublicEvent | null>('get_event_public', { p_slug: slug }),
    enabled: !!slug,
    staleTime: 30_000,
  });
}

export interface BookEventInput {
  eventId: string;
  customer: CustomerInput;
  participants: ParticipantInput[];
  note: string;
  giftCardCode: string | null;
}

export function useBookEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: BookEventInput) =>
      rpc<{ booking_id: string; reference: string; qr_token: string; total_cents: number }>('book_event', {
        p_event_id: input.eventId,
        p_customer: input.customer,
        p_participants: input.participants,
        p_accept_terms: true,
        p_accept_waiver: true,
        p_customer_note: input.note,
        p_gift_card_code: input.giftCardCode,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['event'] });
      void queryClient.invalidateQueries({ queryKey: ['public-calendar'] });
    },
  });
}

// -----------------------------------------------------------------------------
// Gestion d'une réservation par son lien (sans compte)
// -----------------------------------------------------------------------------
export function useManagedBooking(token: string | undefined) {
  return useQuery({
    queryKey: ['booking', token],
    queryFn: () => rpc<ManagedBooking>('get_booking_by_token', { p_qr_token: token }),
    enabled: !!token,
    retry: false,
  });
}

export function useCancelBooking(token: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => rpc<CancellationResult>('cancel_booking_by_token', { p_qr_token: token }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['booking', token] });
      void queryClient.invalidateQueries({ queryKey: ['me'] });
    },
  });
}

export function useRescheduleBooking(token: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (holdToken: string) => rpc<BookingDetails>('reschedule_booking_by_token', { p_qr_token: token, p_hold_token: holdToken }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['booking', token] });
      void queryClient.invalidateQueries({ queryKey: ['availability'] });
      void queryClient.invalidateQueries({ queryKey: ['me'] });
    },
  });
}

// -----------------------------------------------------------------------------
// Compte client
// -----------------------------------------------------------------------------
export function useMyProfile() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['me', user?.id, 'profile'],
    queryFn: async () => {
      // Rattache la fiche client existante (même email vérifié) au compte
      await rpc<string>('claim_customer_profile', {}).catch(() => undefined);
      return rpc<CustomerProfile | null>('my_profile');
    },
    enabled: !!user,
  });
}

export function useMyBookings() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['me', user?.id, 'bookings'],
    queryFn: () => rpc<BookingDetails[]>('my_bookings'),
    enabled: !!user,
  });
}

export function useMyGiftCards() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['me', user?.id, 'gift-cards'],
    queryFn: () => rpc<MyGiftCard[]>('my_gift_cards'),
    enabled: !!user,
  });
}

// -----------------------------------------------------------------------------
// Bons cadeaux : commande en ligne (réglée ensuite au circuit)
// -----------------------------------------------------------------------------
export function useOrderGiftCard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: GiftCardOrderInput) => rpc<GiftCardOrderResult>('order_gift_card', { p: input }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['me'] }),
  });
}

export function useSimulateGiftCardPayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (orderReference: string) => {
      const source = await getDataSource();
      if (!source.demo) throw new Error('Disponible uniquement en démonstration');
      return source.demo.activateGiftCard(orderReference);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['me'] });
      void queryClient.invalidateQueries({ queryKey: ['demo-outbox'] });
    },
  });
}

// -----------------------------------------------------------------------------
// Démo : emails qui auraient été envoyés
// -----------------------------------------------------------------------------
export function useDemoOutbox(enabled: boolean) {
  return useQuery({
    queryKey: ['demo-outbox'],
    queryFn: async () => {
      const source = await getDataSource();
      return source.demo ? source.demo.listOutbox() : ([] as OutboxEmail[]);
    },
    enabled,
    refetchInterval: 5000,
  });
}
