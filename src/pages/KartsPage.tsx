import { useId, useState } from 'react';
import { PageHeader } from '@/components/domain/blocks';
import { PackCard, VehicleCard } from '@/components/domain/cards';
import { Seo } from '@/components/Seo';
import { Button } from '@/components/ui/Button';
import { Section, SectionHeader } from '@/components/ui/layout';
import { Reveal } from '@/components/ui/Reveal';
import { TrackIllustration } from '@/components/visuals';
import { minAgeOf, minHeightOf, pageContent, type Catalog } from '@/lib/catalog';
import type { Product, VehicleType } from '@/lib/data/types';
import { pluralize } from '@/lib/format';
import { env } from '@/lib/env';
import { useBundle, useCatalog } from '@/lib/queries';
import { productsJsonLd } from '@/lib/seo/structured-data';

function isEligible(age: number | null, height: number | null, product: Product | undefined, vehicle: VehicleType, catalog: Catalog) {
  if (age === null) return true;
  const minAge = product ? minAgeOf(product, catalog) : vehicle.min_age;
  const minHeight = product ? minHeightOf(product, catalog) : vehicle.min_height_cm;
  if (age < minAge) return false;
  if (height !== null && minHeight !== null && height < minHeight) return false;
  return true;
}

function KartFinder({ age, height, onChange, count, total }: {
  age: string;
  height: string;
  onChange: (next: { age: string; height: string }) => void;
  count: number;
  total: number;
}) {
  const ageId = useId();
  const heightId = useId();
  const active = age !== '';
  return (
    <div className="flex flex-col gap-4 bg-asphalt-900 p-5 ring-1 ring-asphalt-800 sm:flex-row sm:items-end sm:p-6">
      <div className="flex flex-col gap-1.5">
        <label htmlFor={ageId} className="text-sm font-semibold">
          Âge du pilote
        </label>
        <input
          id={ageId}
          type="number"
          inputMode="numeric"
          min={1}
          max={99}
          placeholder="ex. 12"
          value={age}
          onChange={(event) => onChange({ age: event.target.value, height })}
          className="h-12 w-full border border-asphalt-600 bg-asphalt-950 px-3.5 font-display text-xl font-bold tabular text-chalk focus:border-race-400 focus:outline-none sm:w-32"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={heightId} className="text-sm font-semibold">
          Taille en cm <span className="font-normal text-asphalt-400">(facultatif)</span>
        </label>
        <input
          id={heightId}
          type="number"
          inputMode="numeric"
          min={50}
          max={250}
          placeholder="ex. 135"
          value={height}
          onChange={(event) => onChange({ age, height: event.target.value })}
          className="h-12 w-full border border-asphalt-600 bg-asphalt-950 px-3.5 font-display text-xl font-bold tabular text-chalk focus:border-race-400 focus:outline-none sm:w-36"
        />
      </div>
      <p aria-live="polite" className="flex-1 text-asphalt-200 sm:pb-3">
        {active ? (
          <>
            <strong className="font-display text-2xl font-bold text-chalk">{count}</strong> {count > 1 ? 'karts accessibles' : 'kart accessible'} sur {total}
          </>
        ) : (
          'Tous les karts sont affichés.'
        )}
      </p>
      {active && (
        <Button variant="ghost" size="sm" onClick={() => onChange({ age: '', height: '' })}>
          Effacer
        </Button>
      )}
    </div>
  );
}

export default function KartsPage() {
  const bundle = useBundle();
  const catalog = useCatalog();
  const page = pageContent(bundle, 'karts-tarifs');
  const sections = page.data.sections ?? {};
  const [filter, setFilter] = useState({ age: '', height: '' });

  const age = filter.age === '' ? null : Number(filter.age);
  const height = filter.height === '' ? null : Number(filter.height);
  const eligibleVehicles = catalog.vehicles.filter((v) => isEligible(age, height, catalog.sessionByVehicleId.get(v.id), v, catalog));

  return (
    <>
      <Seo title={page.data.seo_title} description={page.data.seo_description} jsonLd={[productsJsonLd(bundle, env.siteUrl)]} />
      <PageHeader
        eyebrow={page.data.eyebrow ?? 'Tarifs TTC'}
        title={page.title}
        intro={page.body}
        aside={<TrackIllustration shape="medium" className="w-full" />}
      />

      <Section labelledBy="karts-sessions">
        <div className="flex flex-col gap-10">
          <SectionHeader id="karts-sessions" eyebrow="La flotte" title={sections.sessions?.title ?? 'Sessions'} intro={sections.sessions?.body} />
          <div className="flex flex-col gap-3">
            <h3 className="font-display text-lg font-bold uppercase text-asphalt-200">{sections.finder?.title}</h3>
            {sections.finder?.body && <p className="text-sm text-asphalt-400">{sections.finder.body}</p>}
            <KartFinder age={filter.age} height={filter.height} onChange={setFilter} count={eligibleVehicles.length} total={catalog.vehicles.length} />
          </div>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {catalog.vehicles.map((vehicle, i) => (
              <li key={vehicle.id}>
                <Reveal delay={(i % 3) * 0.06} className="h-full">
                  <VehicleCard vehicle={vehicle} catalog={catalog} dimmed={!eligibleVehicles.includes(vehicle)} />
                </Reveal>
              </li>
            ))}
          </ul>
        </div>
      </Section>

      {catalog.packs.length > 0 && (
        <Section tone="raised" labelledBy="karts-packs">
          <div className="flex flex-col gap-10">
            <SectionHeader
              id="karts-packs"
              eyebrow={pluralize(catalog.packs.length, 'pack')}
              title={sections.packs?.title ?? 'Packs'}
              intro={sections.packs?.body}
            />
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {catalog.packs.map((pack, i) => {
                const vehicle = pack.vehicle_type_id ? catalog.vehicleById.get(pack.vehicle_type_id) : undefined;
                const eligible = !vehicle || isEligible(age, height, pack, vehicle, catalog);
                return (
                  <li key={pack.id} className={eligible ? undefined : 'opacity-35 transition-opacity'}>
                    <Reveal delay={i * 0.06} className="h-full">
                      <PackCard pack={pack} catalog={catalog} />
                    </Reveal>
                  </li>
                );
              })}
            </ul>
          </div>
        </Section>
      )}
    </>
  );
}
