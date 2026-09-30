import { Download } from 'lucide-react';
import { useState } from 'react';
import { ErrorPanel, Skeleton } from '@/components/ui/feedback';
import { errorMessage } from '@/lib/data/errors';
import { addDays, capitalize, formatDay, formatPrice, todayInParis } from '@/lib/format';
import { useGiftCardSummary, useSalesExport } from '../api';
import { monthRange, shiftMonth } from '../dates';
import { downloadCsv, euros } from '../files';
import { formatDateTime, PAYMENT_METHOD } from '../labels';
import type { PaymentMethod, SalesLine } from '../types';
import { AdminPage, Input, Panel, Select, SmallButton, Stat } from '../ui';

const LINE_TYPES: Record<SalesLine['line_type'], string> = {
  sale: 'Vente',
  refund: 'Remboursement',
  gift_card_sale: 'Vente de bon cadeau',
  gift_card_refund: 'Remboursement de bon',
  gift_card_redemption: 'Consommation de bon',
};

function methodLabel(method: string): string {
  return method === 'gift_card' ? 'Bon cadeau' : (PAYMENT_METHOD[method as PaymentMethod] ?? method);
}

export default function ExportsPage() {
  const today = todayInParis();
  const [preset, setPreset] = useState('month');
  const [custom, setCustom] = useState({ from: monthRange(today).first, to: today });
  const period =
    preset === 'month'
      ? { from: monthRange(today).first, to: today }
      : preset === 'last_month'
        ? monthRange(shiftMonth(today, -1))
        : preset === 'year'
          ? { from: `${today.slice(0, 4)}-01-01`, to: today }
          : preset === 'last_7'
            ? { from: addDays(today, -6), to: today }
            : custom;
  const from = 'first' in period ? period.first : period.from;
  const to = 'last' in period ? period.last : period.to;
  const valid = from <= to;
  const sales = useSalesExport(from, to, valid);
  const gifts = useGiftCardSummary(from, to, valid);

  const lines = sales.data ?? [];
  const revenue = lines.filter((l) => !l.is_deferred && l.line_type !== 'gift_card_sale' && l.line_type !== 'gift_card_refund');
  const ttc = revenue.reduce((s, l) => s + l.amount_ttc_cents, 0);
  const vat = revenue.reduce((s, l) => s + l.vat_cents, 0);
  const byMethod = new Map<string, number>();
  for (const l of lines) if (l.line_type !== 'gift_card_redemption') byMethod.set(l.payment_method, (byMethod.get(l.payment_method) ?? 0) + l.amount_ttc_cents);
  const byRate = new Map<number, { ttc: number; vat: number; ht: number }>();
  for (const l of revenue) {
    const r = byRate.get(l.vat_rate_bp) ?? { ttc: 0, vat: 0, ht: 0 };
    byRate.set(l.vat_rate_bp, { ttc: r.ttc + l.amount_ttc_cents, vat: r.vat + l.vat_cents, ht: r.ht + l.amount_ht_cents });
  }

  const exportCsv = () =>
    downloadCsv(`ventes-${from}-au-${to}.csv`, lines, [
      { header: 'Date', value: (l) => formatDateTime(l.occurred_at) },
      { header: 'Type', value: (l) => LINE_TYPES[l.line_type] },
      { header: 'Référence', value: (l) => l.reference },
      { header: 'Libellé', value: (l) => l.label },
      { header: 'Client', value: (l) => l.customer },
      { header: 'Moyen de paiement', value: (l) => methodLabel(l.payment_method) },
      { header: 'Montant TTC (€)', value: (l) => euros(l.amount_ttc_cents) },
      { header: 'Taux TVA (%)', value: (l) => l.vat_rate_bp / 100 },
      { header: 'TVA (€)', value: (l) => euros(l.vat_cents) },
      { header: 'Montant HT (€)', value: (l) => euros(l.amount_ht_cents) },
      { header: 'Produit constaté d’avance', value: (l) => l.is_deferred },
      { header: 'Référence Stripe', value: (l) => l.stripe_payment_intent },
    ]);

  return (
    <AdminPage
      title="Exports comptables"
      description="Encaissements, remboursements et consommations de bons, avec la ventilation de TVA. Les ventes de bons « montant » sont des produits constatés d’avance : la TVA est due à leur utilisation."
      actions={
        <SmallButton variant="primary" onClick={exportCsv} disabled={!lines.length}>
          <Download aria-hidden />
          Export CSV (Excel)
        </SmallButton>
      }
    >
      <div className="flex flex-wrap items-end gap-3">
        <Select label="Période" value={preset} onChange={(e) => setPreset(e.target.value)} className="w-56">
          <option value="month">Mois en cours</option>
          <option value="last_month">Mois précédent</option>
          <option value="last_7">7 derniers jours</option>
          <option value="year">Année en cours</option>
          <option value="custom">Personnalisée</option>
        </Select>
        {preset === 'custom' && (
          <>
            <Input label="Du" type="date" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} className="w-44" />
            <Input label="Au" type="date" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} className="w-44" error={valid ? undefined : 'Période invalide'} />
          </>
        )}
        <p className="pb-2 text-sm text-asphalt-300">
          {capitalize(formatDay(from, { day: 'numeric', month: 'long', year: 'numeric' }))} → {formatDay(to, { day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>

      {sales.isError ? (
        <ErrorPanel message={errorMessage(sales.error)} />
      ) : sales.isPending ? (
        <Skeleton className="h-64" />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Chiffre d’affaires TTC" value={formatPrice(ttc)} hint="Ventes + bons consommés − remboursements" />
            <Stat label="TVA collectée" value={formatPrice(vat)} />
            <Stat label="Chiffre d’affaires HT" value={formatPrice(ttc - vat)} />
            <Stat label="Bons vendus (avance)" value={formatPrice(lines.filter((l) => l.line_type === 'gift_card_sale').reduce((s, l) => s + l.amount_ttc_cents, 0))} hint="Encaissés, non encore constatés" />
          </div>
          <div className="grid gap-6 lg:grid-cols-3">
            <Panel title="Par taux de TVA">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase text-asphalt-400">
                  <tr>
                    <th className="py-1 text-left">Taux</th>
                    <th className="py-1 text-right">HT</th>
                    <th className="py-1 text-right">TVA</th>
                    <th className="py-1 text-right">TTC</th>
                  </tr>
                </thead>
                <tbody>
                  {[...byRate.entries()].map(([rate, r]) => (
                    <tr key={rate} className="border-t border-asphalt-800 tabular">
                      <td className="py-1.5">{(rate / 100).toLocaleString('fr-FR')} %</td>
                      <td className="py-1.5 text-right">{formatPrice(r.ht)}</td>
                      <td className="py-1.5 text-right">{formatPrice(r.vat)}</td>
                      <td className="py-1.5 text-right">{formatPrice(r.ttc)}</td>
                    </tr>
                  ))}
                  {byRate.size === 0 && (
                    <tr>
                      <td colSpan={4} className="py-2 text-asphalt-400">
                        Aucune vente.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </Panel>
            <Panel title="Encaissements par moyen">
              <ul className="flex flex-col gap-1.5 text-sm">
                {[...byMethod.entries()].map(([method, cents]) => (
                  <li key={method} className="flex justify-between tabular">
                    <span>{methodLabel(method)}</span>
                    <span>{formatPrice(cents)}</span>
                  </li>
                ))}
                {byMethod.size === 0 && <li className="text-asphalt-400">Aucun encaissement.</li>}
              </ul>
            </Panel>
            <Panel title="Bons cadeaux">
              {gifts.data ? (
                <ul className="flex flex-col gap-1.5 text-sm">
                  <li className="flex justify-between tabular">
                    <span>Émis ({gifts.data.issued_count})</span>
                    <span>{formatPrice(gifts.data.issued_cents)}</span>
                  </li>
                  <li className="flex justify-between tabular">
                    <span>Consommés</span>
                    <span>{formatPrice(gifts.data.redeemed_cents)}</span>
                  </li>
                  <li className="flex justify-between tabular">
                    <span>Expirés</span>
                    <span>{formatPrice(gifts.data.expired_cents)}</span>
                  </li>
                  <li className="flex justify-between border-t border-asphalt-800 pt-1.5 font-semibold tabular">
                    <span>Encours à ce jour ({gifts.data.outstanding_count} bons)</span>
                    <span>{formatPrice(gifts.data.outstanding_cents)}</span>
                  </li>
                </ul>
              ) : (
                <Skeleton className="h-24" />
              )}
            </Panel>
          </div>
          <Panel title={`Détail (${lines.length} ligne${lines.length > 1 ? 's' : ''})`} padded={false}>
            <div className="max-h-[32rem] overflow-auto">
              <table className="w-full min-w-[48rem] text-left text-sm">
                <thead className="sticky top-0 bg-asphalt-900 text-xs uppercase text-asphalt-400">
                  <tr className="border-b border-asphalt-700">
                    <th className="px-4 py-2">Date</th>
                    <th className="px-2 py-2">Type</th>
                    <th className="px-2 py-2">Libellé</th>
                    <th className="px-2 py-2">Moyen</th>
                    <th className="px-2 py-2 text-right">TTC</th>
                    <th className="px-4 py-2 text-right">TVA</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l, i) => (
                    <tr key={i} className="border-b border-asphalt-800">
                      <td className="px-4 py-2 text-asphalt-300">{formatDateTime(l.occurred_at)}</td>
                      <td className="px-2 py-2">{LINE_TYPES[l.line_type]}</td>
                      <td className="px-2 py-2">
                        {l.label}
                        <span className="block text-xs text-asphalt-400">
                          {l.reference} · {l.customer}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-asphalt-300">{methodLabel(l.payment_method)}</td>
                      <td className={`px-2 py-2 text-right tabular ${l.amount_ttc_cents < 0 ? 'text-race-400' : ''}`}>{formatPrice(l.amount_ttc_cents)}</td>
                      <td className="px-4 py-2 text-right tabular text-asphalt-300">{formatPrice(l.vat_cents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      )}
    </AdminPage>
  );
}
