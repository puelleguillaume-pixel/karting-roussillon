import { Alert, Skeleton } from '@/components/ui/feedback';
import { useAdminBooking } from '../api';
import { Modal } from '../ui';
import { BookingDetails } from './BookingDetails';

/** Fiche réservation (panneau latéral) : détails, check-in, encaissement, annulation. */
export function BookingDrawer({ bookingId, onClose }: { bookingId: string | null; onClose: () => void }) {
  const booking = useAdminBooking(bookingId);
  return (
    <Modal open={!!bookingId} onClose={onClose} side title={booking.data ? `Réservation ${booking.data.reference}` : 'Réservation'}>
      {booking.isPending ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : booking.isError ? (
        <Alert tone="error" title="Réservation introuvable" />
      ) : (
        <BookingDetails booking={booking.data} />
      )}
    </Modal>
  );
}

