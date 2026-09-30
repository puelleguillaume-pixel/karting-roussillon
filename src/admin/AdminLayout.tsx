import {
  Ban,
  CalendarDays,
  Clock,
  Database,
  Download,
  ExternalLink,
  FileText,
  Flag,
  Gift,
  Inbox,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  Menu,
  ScanLine,
  Settings,
  Tags,
  Ticket,
  Timer,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/feedback';
import { TextField } from '@/components/ui/fields';
import { useAuth } from '@/lib/auth-context';
import { cx } from '@/lib/cx';
import { errorMessage } from '@/lib/data/errors';
import { env } from '@/lib/env';
import { useAdminMe, useRequests } from './api';
import { AdminMeContext } from './role-context';
import type { AdminMe } from './types';
import { SmallButton, ToastProvider } from './ui';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  ownerOnly?: boolean;
}

const NAV: Array<{ title: string; items: NavItem[] }> = [
  {
    title: 'Exploitation',
    items: [
      { to: '/admin', label: 'Tableau de bord', icon: LayoutDashboard },
      { to: '/admin/planning', label: 'Planning', icon: CalendarDays },
      { to: '/admin/check-in', label: 'Check-in', icon: ScanLine },
      { to: '/admin/reservations', label: 'Réservations', icon: Ticket },
      { to: '/admin/blocages', label: 'Blocages', icon: Ban },
      { to: '/admin/evenements', label: 'Événements', icon: Flag },
      { to: '/admin/demandes', label: 'Demandes', icon: Inbox },
    ],
  },
  {
    title: 'Clients & ventes',
    items: [
      { to: '/admin/bons', label: 'Bons cadeaux', icon: Gift },
      { to: '/admin/clients', label: 'Clients', icon: Users },
      { to: '/admin/exports', label: 'Exports comptables', icon: Download, ownerOnly: true },
    ],
  },
  {
    title: 'Site & réglages',
    items: [
      { to: '/admin/chronos', label: 'Chronos', icon: Timer },
      { to: '/admin/contenu', label: 'Contenu du site', icon: FileText },
      { to: '/admin/disponibilites', label: 'Disponibilités', icon: Clock },
      { to: '/admin/catalogue', label: 'Catalogue & tarifs', icon: Tags, ownerOnly: true },
      { to: '/admin/parametres', label: 'Paramètres & équipe', icon: Settings, ownerOnly: true },
    ],
  },
];

/** Routes réservées au dirigeant (le rôle est de toute façon vérifié par chaque RPC) */
const OWNER_PATHS = NAV.flatMap((g) => g.items.filter((i) => i.ownerOnly).map((i) => i.to));

export default function AdminLayout() {
  const { user, ready, signOut } = useAuth();
  const me = useAdminMe();

  if (!ready || (user && me.isPending)) {
    return (
      <Shell>
        <p className="flex items-center gap-2 text-asphalt-300" role="status">
          <LoaderCircle aria-hidden className="size-5 animate-spin" />
          Chargement de l’espace dirigeant…
        </p>
      </Shell>
    );
  }
  if (!user) return <AdminLogin />;
  if (me.isError || !me.data) {
    return (
      <Shell>
        <div className="flex max-w-md flex-col gap-4">
          <Alert tone="error" title="Accès réservé à l’équipe">
            {me.isError ? errorMessage(me.error) : `Le compte ${user.email} n’a pas accès à l’espace dirigeant.`}
          </Alert>
          <div className="flex flex-wrap gap-2">
            <SmallButton onClick={() => void signOut()}>
              <LogOut aria-hidden />
              Changer de compte
            </SmallButton>
            <Link to="/" className="inline-flex h-9 items-center px-3 text-sm text-asphalt-300 hover:text-chalk">
              Retour au site
            </Link>
          </div>
        </div>
      </Shell>
    );
  }
  return (
    <AdminMeContext.Provider value={me.data}>
      <ToastProvider>
        <AdminFrame me={me.data} />
      </ToastProvider>
    </AdminMeContext.Provider>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-8 bg-asphalt-950 px-4 py-12">
      <meta name="robots" content="noindex, nofollow" />
      <Logo />
      {children}
    </div>
  );
}

function AdminFrame({ me }: { me: AdminMe }) {
  const { user, signOut } = useAuth();
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const pending = useRequests({ status: ['new'] });
  const pendingCount = pending.data?.length ?? 0;
  const forbidden = me.role !== 'owner' && OWNER_PATHS.some((path) => pathname.startsWith(path));

  // Le menu mobile se referme à chaque navigation
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setMenuOpen(false);
  }

  const nav = (
    <nav aria-label="Espace dirigeant" className="flex flex-col gap-5">
      {NAV.map((group) => {
        const items = group.items.filter((item) => !item.ownerOnly || me.role === 'owner');
        return (
          <div key={group.title} className="flex flex-col gap-1">
            <p className="px-3 text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-asphalt-400">{group.title}</p>
            <ul className="flex flex-col">
              {items.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.to === '/admin'}
                    className={({ isActive }) =>
                      cx(
                        'flex items-center gap-3 border-l-2 px-3 py-2 text-sm font-medium transition-colors',
                        isActive ? 'border-race-500 bg-asphalt-800 text-chalk' : 'border-transparent text-asphalt-300 hover:bg-asphalt-850 hover:text-chalk',
                      )
                    }
                  >
                    <item.icon aria-hidden className="size-4 shrink-0" />
                    <span className="flex-1">{item.label}</span>
                    {item.to === '/admin/demandes' && pendingCount > 0 && (
                      <span className="min-w-5 bg-race-600 px-1.5 text-center text-xs font-bold text-white">
                        {pendingCount}
                        <span className="sr-only"> à traiter</span>
                      </span>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </nav>
  );

  const account = (
    <div className="flex flex-col gap-2 border-t border-asphalt-800 pt-4 text-sm">
      <p className="px-3 text-asphalt-300">
        <span className="block font-semibold text-chalk">{me.display_name}</span>
        <span className="block truncate text-xs">{user?.email}</span>
        <span className="text-xs text-asphalt-400">{me.role === 'owner' ? 'Dirigeant' : 'Équipe (accès exploitation)'}</span>
      </p>
      <Link to="/" className="flex items-center gap-2 px-3 py-1.5 text-asphalt-300 hover:text-chalk">
        <ExternalLink aria-hidden className="size-4" />
        Voir le site
      </Link>
      <button type="button" onClick={() => void signOut()} className="flex items-center gap-2 px-3 py-1.5 text-left text-asphalt-300 hover:text-chalk">
        <LogOut aria-hidden className="size-4" />
        Se déconnecter
      </button>
    </div>
  );

  return (
    <div className="min-h-svh bg-asphalt-950 lg:grid lg:grid-cols-[15.5rem_minmax(0,1fr)]">
      <a href="#admin-contenu" className="sr-only z-[70] bg-race-600 px-4 py-3 font-semibold text-white focus:not-sr-only focus:fixed focus:left-3 focus:top-3">
        Aller au contenu
      </a>

      {/* Barre latérale (grand écran) */}
      <aside className="sticky top-0 hidden h-svh flex-col gap-6 overflow-y-auto border-r border-asphalt-800 bg-asphalt-900 px-2 py-5 lg:flex">
        <Link to="/admin" className="px-3">
          <Logo />
          <span className="mt-1 block text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-asphalt-400">Espace dirigeant</span>
        </Link>
        <div className="flex-1">{nav}</div>
        {account}
      </aside>

      {/* Barre supérieure (mobile / tablette) */}
      <div className="sticky top-0 z-40 flex items-center justify-between border-b border-asphalt-800 bg-asphalt-900 px-4 py-2.5 lg:hidden">
        <Link to="/admin" aria-label="Tableau de bord">
          <Logo />
        </Link>
        <button
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          aria-expanded={menuOpen}
          aria-controls="admin-menu"
          className="flex size-11 items-center justify-center text-chalk"
        >
          {menuOpen ? <X aria-hidden className="size-6" /> : <Menu aria-hidden className="size-6" />}
          <span className="sr-only">Menu</span>
        </button>
      </div>
      {menuOpen && (
        <div id="admin-menu" className="fixed inset-x-0 bottom-0 top-[4.1rem] z-40 flex flex-col gap-6 overflow-y-auto bg-asphalt-900 px-2 py-4 lg:hidden">
          {nav}
          {account}
        </div>
      )}

      <div className="flex min-w-0 flex-col">
        {env.dataSource === 'demo' && (
          <p className="flex items-center gap-2 border-b border-flag-yellow/30 bg-flag-yellow/10 px-4 py-1.5 text-xs text-flag-yellow sm:px-6">
            <Database aria-hidden className="size-3.5 shrink-0" />
            Mode démonstration : base locale au navigateur, données d’exemple. Les emails apparaissent dans
            <Link to="/demo/emails" className="font-semibold underline underline-offset-2">
              Emails envoyés
            </Link>
          </p>
        )}
        <main id="admin-contenu" tabIndex={-1} className="flex-1 px-4 py-6 focus:outline-none sm:px-6 lg:px-8 lg:py-8">
          {forbidden ? (
            <Alert tone="error" title="Accès réservé au dirigeant">
              <title>Accès réservé · Espace dirigeant</title>
              Cette rubrique (chiffre d’affaires, paramètres, catalogue) n’est pas accessible avec un compte équipe.
            </Alert>
          ) : (
            <Outlet />
          )}
        </main>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Connexion : lien magique (Supabase) ; comptes de démonstration en mode démo
// -----------------------------------------------------------------------------
function AdminLogin() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);

  const submit = async (value: string, event?: FormEvent) => {
    event?.preventDefault();
    setError(null);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value.trim())) {
      setError('Adresse email invalide.');
      return;
    }
    setStatus('sending');
    try {
      const result = await signIn(value.trim(), '/admin');
      setStatus(result.mode === 'magic_link' ? 'sent' : 'idle');
    } catch (e) {
      setError(errorMessage(e));
      setStatus('idle');
    }
  };

  return (
    <Shell>
      <title>Connexion · Espace dirigeant</title>
      <div className="flex w-full max-w-md flex-col gap-6 bg-asphalt-900 p-6 ring-1 ring-asphalt-800 sm:p-8">
        <div className="flex flex-col gap-2">
          <h1 className="font-display text-3xl font-extrabold uppercase leading-none">Espace dirigeant</h1>
          <p className="text-sm text-asphalt-300">Réservé à l’équipe du circuit. Un lien de connexion est envoyé par email : aucun mot de passe à retenir.</p>
        </div>
        {status === 'sent' ? (
          <Alert tone="success" title="Lien envoyé">
            Ouvrez l’email reçu sur {email} et cliquez sur le lien pour accéder à l’espace dirigeant.
          </Alert>
        ) : (
          <form onSubmit={(e) => void submit(email, e)} className="flex flex-col gap-4" noValidate>
            <TextField
              label="Email professionnel"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              error={error ?? undefined}
            />
            <Button type="submit" disabled={status === 'sending'}>
              {status === 'sending' && <LoaderCircle aria-hidden className="size-4 animate-spin" />}
              Recevoir le lien de connexion
            </Button>
          </form>
        )}
        {env.dataSource === 'demo' && (
          <div className="flex flex-col gap-3 border-t border-asphalt-800 pt-5">
            <p className="text-sm text-asphalt-300">Démonstration : entrez directement avec un compte d’exemple.</p>
            <div className="flex flex-wrap gap-2">
              <SmallButton variant="primary" onClick={() => void submit('dirigeant@exemple.fr')}>
                Dirigeant (tous les accès)
              </SmallButton>
              <SmallButton onClick={() => void submit('accueil@exemple.fr')}>Accueil (exploitation)</SmallButton>
            </div>
          </div>
        )}
        <Link to="/" className="text-sm text-asphalt-400 hover:text-chalk">
          ← Retour au site
        </Link>
      </div>
    </Shell>
  );
}
