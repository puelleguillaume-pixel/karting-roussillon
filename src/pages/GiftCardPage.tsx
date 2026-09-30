import { CalendarClock, Phone } from 'lucide-react';
import { useSearchParams } from 'react-router';
import { PageHeader } from '@/components/domain/blocks';
import { GiftCardChecker } from '@/components/domain/GiftCardChecker';
import { GiftCardOrder } from '@/components/giftcards/GiftCardOrder';
import { Seo } from '@/components/Seo';
import { ButtonAnchor } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { Section, SectionHeader } from '@/components/ui/layout';
import { Reveal } from '@/components/ui/Reveal';
import { contactContent, pageContent } from '@/lib/catalog';
import { useBundle } from '@/lib/queries';

export default function GiftCardPage() {
  const bundle = useBundle();
  const [params] = useSearchParams();
  const page = pageContent(bundle, 'bon-cadeau');
  const contact = contactContent(bundle);
  const validity = bundle.settings.gift_card_validity_months;
  const steps = page.data.steps ?? [];
  const sections = page.data.sections ?? {};
  const codeFromQr = params.get('bon') ?? undefined;

  return (
    <>
      <Seo title={page.data.seo_title} description={page.data.seo_description} />
      <PageHeader
        eyebrow={page.data.eyebrow ?? 'Offrir'}
        title={page.title}
        intro={page.body}
        actions={
          <>
            {validity && (
              <Chip tone="outline" icon={<CalendarClock />}>
                Valable {validity} mois
              </Chip>
            )}
            {contact && (
              <ButtonAnchor href={`tel:${contact.data.phone_e164}`} variant="secondary" size="md">
                <Phone aria-hidden className="size-4" />
                {contact.data.phone}
              </ButtonAnchor>
            )}
          </>
        }
      />

      {steps.length > 0 && (
        <Section labelledBy="bon-etapes">
          <h2 id="bon-etapes" className="sr-only">
            Comment ça marche
          </h2>
          <ol className="grid gap-px bg-asphalt-800 md:grid-cols-3">
            {steps.map((step, index) => (
              <li key={step.title} className="bg-asphalt-950">
                <Reveal delay={index * 0.08} className="flex h-full flex-col gap-3 p-6 sm:p-8">
                  <span aria-hidden className="font-display text-6xl font-extrabold leading-none text-race-400 tabular">
                    {index + 1}
                  </span>
                  <p className="text-display-sm font-bold uppercase">{step.title}</p>
                  <p className="text-asphalt-300">{step.body}</p>
                </Reveal>
              </li>
            ))}
          </ol>
        </Section>
      )}

      <Section tone="raised" labelledBy="bon-commande">
        <div className="flex flex-col gap-10">
          <SectionHeader id="bon-commande" eyebrow="Commande" title={sections.order?.title ?? ''} intro={sections.order?.body || undefined} />
          <GiftCardOrder />
        </div>
      </Section>

      <Section id="solde" labelledBy="bon-solde">
        <div className="grid gap-10 lg:grid-cols-[1fr_1.2fr] lg:items-start">
          <SectionHeader id="bon-solde" eyebrow="Déjà un bon ?" title={sections.balance?.title ?? ''} intro={sections.balance?.body || undefined} />
          <div className="bg-asphalt-900 p-6 ring-1 ring-asphalt-800">
            <GiftCardChecker initialCode={codeFromQr} />
          </div>
        </div>
      </Section>
    </>
  );
}
