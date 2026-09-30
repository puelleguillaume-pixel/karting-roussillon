import { useQuery } from '@tanstack/react-query';
import { Camera, ScanLine, Search } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Alert, Skeleton } from '@/components/ui/feedback';
import { rpc } from '@/lib/data/source';
import { errorMessage } from '@/lib/data/errors';
import { formatTime, todayInParis } from '@/lib/format';
import { useBookings } from '../api';
import { BookingDetails } from '../components/BookingDetails';
import { QrScanner } from '../components/QrScanner';
import { BOOKING_STATUS } from '../labels';
import type { AdminBooking } from '../types';
import { AdminPage, Panel, SmallButton, StatusChip } from '../ui';

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** QR du client (lien /reservation/<jeton>) ou référence KR-XXXXXX saisie à la main */
function extractCode(raw: string): string | null {
  const text = raw.trim();
  const token = text.match(UUID)?.[0];
  if (token) return token;
  const reference = text.toUpperCase().replace(/\s/g, '');
  if (/^KR-?[A-Z0-9]{6}$/.test(reference)) return reference.startsWith('KR-') ? reference : `KR-${reference.slice(2)}`;
  return null;
}

export default function CheckInPage() {
  const [code, setCode] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [inputError, setInputError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const today = todayInParis();
  const expected = useBookings({ from: today, to: today, status: ['pending', 'confirmed', 'checked_in'], order: 'asc', limit: 200 });

  // Requête (et non simple appel) : la fiche se met à jour après chaque action
  const booking = useQuery({
    queryKey: ['admin', 'lookup', code],
    queryFn: () => rpc<AdminBooking>('admin_lookup_booking', { p_code: code }),
    enabled: !!code,
    retry: 0,
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const found = extractCode(input);
    if (!found) {
      setInputError('Saisissez une référence KR-XXXXXX ou scannez le QR code.');
      return;
    }
    setInputError(null);
    setCode(found);
  };

  const onScan = (text: string) => {
    setScanning(false);
    const found = extractCode(text);
    if (found) {
      setCode(found);
      setInput('');
      if ('vibrate' in navigator) navigator.vibrate?.(80);
    } else setInputError('Ce QR code n’est pas un QR de réservation Karting Roussillon.');
  };

  return (
    <AdminPage title="Check-in" description="Scannez le QR code du client (email de confirmation) ou saisissez sa référence : participants, décharges et règlement s’affichent.">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <div className="flex flex-col gap-6">
          <Panel title="Identifier la réservation">
            <div className="flex flex-col gap-4">
              {scanning ? (
                <>
                  <QrScanner onResult={onScan} />
                  <SmallButton onClick={() => setScanning(false)} className="self-start">
                    Arrêter la caméra
                  </SmallButton>
                </>
              ) : (
                <SmallButton variant="primary" className="h-12 text-base" onClick={() => setScanning(true)}>
                  <Camera aria-hidden />
                  Scanner un QR code
                </SmallButton>
              )}
              <form onSubmit={submit} className="flex gap-2" noValidate>
                <label htmlFor="checkin-ref" className="sr-only">
                  Référence de réservation
                </label>
                <input
                  id="checkin-ref"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="KR-XXXXXX"
                  autoComplete="off"
                  spellCheck={false}
                  aria-invalid={inputError ? true : undefined}
                  aria-describedby={inputError ? 'checkin-error' : undefined}
                  className="h-10 min-w-0 flex-1 border border-asphalt-600 bg-asphalt-950 px-3 text-sm uppercase text-chalk focus:border-race-400 focus:outline-none"
                />
                <SmallButton type="submit" className="h-10">
                  <Search aria-hidden />
                  Chercher
                </SmallButton>
              </form>
              {inputError && (
                <p id="checkin-error" className="text-xs font-medium text-race-400">
                  {inputError}
                </p>
              )}
            </div>
          </Panel>

          <Panel title={`Attendus aujourd’hui (${expected.data?.total ?? '…'})`} padded={false}>
            {expected.isPending ? (
              <Skeleton className="m-4 h-24" />
            ) : !expected.data?.rows.length ? (
              <p className="p-4 text-sm text-asphalt-400">Aucune réservation aujourd’hui.</p>
            ) : (
              <ul className="max-h-[28rem] divide-y divide-asphalt-800 overflow-y-auto">
                {expected.data.rows.map((r) => (
                  <li key={r.id}>
                    <button type="button" onClick={() => setCode(r.reference)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-asphalt-850" aria-current={booking.data?.id === r.id}>
                      <span className="w-14 font-display text-lg font-bold tabular">{formatTime(r.starts_at)}</span>
                      <span className="min-w-0 flex-1 text-sm">
                        <span className="block truncate font-semibold text-chalk">{r.customer.name}</span>
                        <span className="block truncate text-xs text-asphalt-400">
                          {r.product ?? r.event} · {r.participants_count} pers.
                        </span>
                      </span>
                      <StatusChip status={BOOKING_STATUS[r.status]} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <Panel title={booking.data ? `Réservation ${booking.data.reference}` : 'Réservation'}>
          {!code ? (
            <p className="flex items-center gap-2 text-sm text-asphalt-400">
              <ScanLine aria-hidden className="size-5" />
              Scannez un QR code ou choisissez un client attendu.
            </p>
          ) : booking.isPending ? (
            <Skeleton className="h-64 w-full" />
          ) : booking.isError ? (
            <Alert tone="error" title="Réservation introuvable">
              {errorMessage(booking.error)}
            </Alert>
          ) : (
            <BookingDetails booking={booking.data} compact />
          )}
        </Panel>
      </div>
    </AdminPage>
  );
}
