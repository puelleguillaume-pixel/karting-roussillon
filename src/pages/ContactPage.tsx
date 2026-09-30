import { AccessPanel, PageHeader } from '@/components/domain/blocks';
import { RequestForm } from '@/components/domain/RequestForm';
import { SOCIAL_ICONS } from '@/components/social';
import { Seo } from '@/components/Seo';
import { Section, SectionHeader } from '@/components/ui/layout';
import { contactContent, pageContent } from '@/lib/catalog';
import { env } from '@/lib/env';
import { useBundle } from '@/lib/queries';
import { businessJsonLd } from '@/lib/seo/structured-data';

export default function ContactPage() {
  const bundle = useBundle();
  const page = pageContent(bundle, 'contact');
  const contact = contactContent(bundle);
  const sections = page.data.sections ?? {};
  const socials = Object.entries(contact?.data.socials ?? {}).filter(([, url]) => !!url) as Array<[keyof typeof SOCIAL_ICONS, string]>;

  return (
    <>
      <Seo title={page.data.seo_title} description={page.data.seo_description} jsonLd={[businessJsonLd(bundle, env.siteUrl)]} />
      <PageHeader eyebrow={page.data.eyebrow ?? 'Nous joindre'} title={page.title} intro={page.body} />

      {contact && (
        <Section labelledBy="contact-acces">
          <div className="flex flex-col gap-10">
            <SectionHeader id="contact-acces" eyebrow="Accès" title={sections.access?.title ?? ''} intro={sections.access?.body || undefined} />
            <AccessPanel contact={contact} openingHours={bundle.opening_hours} />
            {socials.length > 0 && (
              <ul className="flex flex-wrap gap-3" aria-label="Réseaux sociaux">
                {socials.map(([network, url]) => {
                  const { label, Icon } = SOCIAL_ICONS[network];
                  return (
                    <li key={network}>
                      <a
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2.5 bg-asphalt-900 px-4 py-3 font-semibold ring-1 ring-asphalt-800 transition-colors hover:ring-race-400"
                      >
                        <Icon className="size-5" />
                        {label}
                        <span className="sr-only">(nouvel onglet)</span>
                      </a>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </Section>
      )}

      <Section tone="raised" labelledBy="contact-formulaire">
        <div className="grid gap-10 lg:grid-cols-[1fr_1.4fr]">
          <SectionHeader id="contact-formulaire" eyebrow="Message" title={sections.form?.title ?? ''} intro={sections.form?.body || undefined} />
          <div className="bg-asphalt-950 p-6 ring-1 ring-asphalt-800 sm:p-8">
            <RequestForm type="other" subject="Contact" askDates={false} askParticipants={false} requireMessage />
          </div>
        </div>
      </Section>
    </>
  );
}
