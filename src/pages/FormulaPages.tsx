import { ArrowDown } from 'lucide-react';
import { useParams } from 'react-router';
import { PageHeader } from '@/components/domain/blocks';
import { FormulaCards } from '@/components/domain/cards';
import { OfferCard, OfferLayout } from '@/components/domain/offers';
import { RequestForm, type ExtraField } from '@/components/domain/RequestForm';
import { Seo } from '@/components/Seo';
import { ButtonAnchor } from '@/components/ui/Button';
import { Section, SectionHeader } from '@/components/ui/layout';
import { pageContent } from '@/lib/catalog';
import type { RequestType } from '@/lib/data/types';
import { useBundle, useCatalog } from '@/lib/queries';
import NotFoundPage from './NotFoundPage';

// Réglages du formulaire propres à chaque formule (structure, pas contenu).
const FORMULA_FORMS: Record<
  string,
  { type: RequestType; participantsLabel: string; extraFields?: ExtraField[]; askCompany?: boolean; requireCompany?: boolean }
> = {
  anniversaire: {
    type: 'birthday',
    participantsLabel: "Nombre d'enfants",
    extraFields: [{ name: 'child_age', label: "Âge de l'enfant fêté", placeholder: 'ex. 10 ans', required: true }],
  },
  'evg-evjf': { type: 'bachelor_party', participantsLabel: 'Nombre de participants' },
  'team-building': { type: 'team_building', participantsLabel: 'Nombre de participants', askCompany: true, requireCompany: true },
};

export function FormulasPage() {
  const bundle = useBundle();
  const page = pageContent(bundle, 'formules');
  const sections = page.data.sections ?? {};
  return (
    <>
      <Seo title={page.data.seo_title} description={page.data.seo_description} />
      <PageHeader eyebrow={page.data.eyebrow ?? 'Groupes'} title={page.title} intro={page.body} />
      <Section labelledBy="formules-groupes">
        <div className="flex flex-col gap-10">
          <SectionHeader id="formules-groupes" eyebrow="Formules" title={sections.groups?.title ?? ''} intro={sections.groups?.body || undefined} />
          <FormulaCards bundle={bundle} only={['anniversaire', 'evg-evjf', 'team-building']} />
        </div>
      </Section>
      <Section tone="raised" labelledBy="formules-experiences">
        <div className="flex flex-col gap-10">
          <SectionHeader id="formules-experiences" eyebrow="Expériences" title={sections.experiences?.title ?? ''} intro={sections.experiences?.body || undefined} />
          <FormulaCards bundle={bundle} only={['ecole-de-pilotage', 'alpine-a110s']} />
        </div>
      </Section>
    </>
  );
}

export function FormulaPage() {
  const { slug = '' } = useParams();
  const bundle = useBundle();
  const catalog = useCatalog();
  const config = FORMULA_FORMS[slug];
  const page = pageContent(bundle, slug);
  if (!config || !page.title) return <NotFoundPage />;

  const type = page.data.request_type ?? config.type;
  const offers = catalog.byRequestType.get(type) ?? [];
  const formTitle = page.data.form_title ?? 'Faire une demande';

  return (
    <>
      <Seo title={page.data.seo_title} description={page.data.seo_description} />
      <PageHeader
        eyebrow={page.data.eyebrow ?? 'Formules'}
        title={page.title}
        intro={page.body}
        actions={
          <ButtonAnchor href="#demande" size="lg">
            {formTitle}
            <ArrowDown aria-hidden className="size-4" />
          </ButtonAnchor>
        }
      />
      <Section labelledBy="formule-offres">
        <h2 id="formule-offres" className="sr-only">
          Offres
        </h2>
        <OfferLayout
          formTitle={formTitle}
          offers={offers.map((offer) => (
            <OfferCard key={offer.id} product={offer} />
          ))}
          form={
            <RequestForm
              type={type}
              products={offers.length > 1 ? offers : undefined}
              participantsLabel={config.participantsLabel}
              extraFields={config.extraFields}
              askCompany={config.askCompany}
              requireCompany={config.requireCompany}
              messagePlaceholder="Précisez vos envies, contraintes horaires, questions…"
            />
          }
        />
      </Section>
    </>
  );
}

export function SchoolPage() {
  const bundle = useBundle();
  const catalog = useCatalog();
  const page = pageContent(bundle, 'ecole-de-pilotage');
  const offers = [...(catalog.byRequestType.get('school_kart') ?? []), ...(catalog.byRequestType.get('school_moto') ?? [])];
  const formTitle = page.data.form_title ?? 'Faire une demande';

  return (
    <>
      <Seo title={page.data.seo_title} description={page.data.seo_description} />
      <PageHeader
        eyebrow={page.data.eyebrow ?? 'Kart · Moto'}
        title={page.title}
        intro={page.body}
        actions={
          <ButtonAnchor href="#demande" size="lg">
            {formTitle}
            <ArrowDown aria-hidden className="size-4" />
          </ButtonAnchor>
        }
      />
      <Section labelledBy="ecole-offres">
        <h2 id="ecole-offres" className="sr-only">
          Offres
        </h2>
        <OfferLayout
          formTitle={formTitle}
          offers={offers.map((offer) => (
            <OfferCard key={offer.id} product={offer} />
          ))}
          form={
            <RequestForm
              type="school_kart"
              typeLabel="Discipline"
              typeOptions={offers
                .filter((o): o is typeof o & { request_type: RequestType } => !!o.request_type)
                .map((o) => ({ value: o.request_type, label: o.name }))}
              requireDate={false}
              participantsLabel="Nombre d'élèves"
              messagePlaceholder="Votre niveau, votre objectif, vos disponibilités…"
            />
          }
        />
      </Section>
    </>
  );
}

export function AlpinePage() {
  const bundle = useBundle();
  const catalog = useCatalog();
  const page = pageContent(bundle, 'alpine-a110s');
  const offers = catalog.byRequestType.get('alpine') ?? [];
  const formTitle = page.data.form_title ?? 'Faire une demande';

  return (
    <>
      <Seo title={page.data.seo_title} description={page.data.seo_description} />
      <PageHeader
        eyebrow={page.data.eyebrow ?? 'Expérience'}
        title={page.title}
        intro={page.body}
        actions={
          <ButtonAnchor href="#demande" size="lg">
            {formTitle}
            <ArrowDown aria-hidden className="size-4" />
          </ButtonAnchor>
        }
      />
      <Section labelledBy="alpine-offres">
        <h2 id="alpine-offres" className="sr-only">
          Formules
        </h2>
        <OfferLayout
          formTitle={formTitle}
          offers={offers.map((offer) => (
            <OfferCard key={offer.id} product={offer} />
          ))}
          form={
            <RequestForm
              type="alpine"
              products={offers.length > 1 ? offers : undefined}
              participantsLabel="Nombre de pilotes"
              messagePlaceholder="Offert ou pour vous ? Une question sur l'expérience ?"
            />
          }
        />
      </Section>
    </>
  );
}
