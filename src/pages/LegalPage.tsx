import { useLocation } from 'react-router';
import { PageHeader } from '@/components/domain/blocks';
import { Seo } from '@/components/Seo';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/feedback';
import { Section } from '@/components/ui/layout';
import { Markdown } from '@/components/ui/Markdown';
import { useConsent } from '@/lib/consent-context';
import { useBundle } from '@/lib/queries';

const LEGAL_PAGES: Record<string, { key: string; title: string }> = {
  '/mentions-legales': { key: 'legal.mentions', title: 'Mentions légales' },
  '/cgv': { key: 'legal.cgv', title: 'Conditions générales de vente' },
  '/confidentialite': { key: 'legal.privacy', title: 'Politique de confidentialité' },
  '/cookies': { key: 'legal.cookies', title: 'Politique cookies' },
};

export default function LegalPage() {
  const { pathname } = useLocation();
  const bundle = useBundle();
  const { openPreferences } = useConsent();
  const config = LEGAL_PAGES[pathname];
  const content = config ? bundle.content[config.key] : undefined;
  const title = content?.title || config?.title || 'Informations légales';

  return (
    <>
      <Seo title={`${title} · Karting Roussillon`} />
      <PageHeader eyebrow="Informations légales" title={title} />
      <Section>
        <div className="flex flex-col gap-8">
          {pathname === '/cookies' && (
            <Button variant="secondary" onClick={openPreferences} className="self-start">
              Gérer mes choix de cookies
            </Button>
          )}
          {content?.body ? (
            <Markdown source={content.body} />
          ) : (
            <EmptyState title="Page en cours de rédaction">Le contenu de cette page sera publié prochainement.</EmptyState>
          )}
        </div>
      </Section>
    </>
  );
}
