import type { ComponentType } from 'react';
import type { RouteObject } from 'react-router';
import NotFoundPage from '@/pages/NotFoundPage';
import { RootLayout } from './RootLayout';
import { RouteError } from './RouteError';

// Pages chargées à la demande (un fichier JS par page).
const page = (load: () => Promise<{ default: ComponentType }>) => async () => ({ Component: (await load()).default });

// Routes partagées par le navigateur (router.tsx) et le pré-rendu au build (entry-server.tsx)
export const routes: RouteObject[] = [
  // Espace dirigeant : mise en page propre (sans en-tête ni pied de page du site)
  {
    path: '/admin',
    lazy: page(() => import('@/admin/AdminLayout')),
    errorElement: <RouteError />,
    hydrateFallbackElement: <div className="min-h-svh bg-asphalt-950" />,
    children: [
      { index: true, lazy: page(() => import('@/admin/pages/DashboardPage')) },
      { path: 'planning', lazy: page(() => import('@/admin/pages/PlanningPage')) },
      { path: 'check-in', lazy: page(() => import('@/admin/pages/CheckInPage')) },
      { path: 'reservations', lazy: page(() => import('@/admin/pages/BookingsPage')) },
      { path: 'blocages', lazy: page(() => import('@/admin/pages/BlocksPage')) },
      { path: 'evenements', lazy: page(() => import('@/admin/pages/EventsPage')) },
      { path: 'demandes', lazy: page(() => import('@/admin/pages/RequestsPage')) },
      { path: 'bons', lazy: page(() => import('@/admin/pages/GiftCardsPage')) },
      { path: 'clients', lazy: page(() => import('@/admin/pages/CustomersPage')) },
      { path: 'exports', lazy: page(() => import('@/admin/pages/ExportsPage')) },
      { path: 'chronos', lazy: page(() => import('@/admin/pages/ChronosPage')) },
      { path: 'contenu', lazy: page(() => import('@/admin/pages/ContentPage')) },
      { path: 'disponibilites', lazy: page(() => import('@/admin/pages/AvailabilityPage')) },
      { path: 'catalogue', lazy: page(() => import('@/admin/pages/CatalogPage')) },
      { path: 'parametres', lazy: page(() => import('@/admin/pages/SettingsPage')) },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
  {
    path: '/',
    element: <RootLayout />,
    errorElement: <RouteError />,
    hydrateFallbackElement: <div className="min-h-svh bg-asphalt-950" />,
    children: [
      {
        errorElement: <RouteError />,
        children: [
          { index: true, lazy: page(() => import('@/pages/HomePage')) },
          { path: 'karts-tarifs', lazy: page(() => import('@/pages/KartsPage')) },
          { path: 'circuits', lazy: page(() => import('@/pages/CircuitsPage')) },
          { path: 'trackday', lazy: page(() => import('@/pages/TrackdayPage')) },
          { path: 'formules', lazy: async () => ({ Component: (await import('@/pages/FormulaPages')).FormulasPage }) },
          { path: 'formules/:slug', lazy: async () => ({ Component: (await import('@/pages/FormulaPages')).FormulaPage }) },
          { path: 'ecole-de-pilotage', lazy: async () => ({ Component: (await import('@/pages/FormulaPages')).SchoolPage }) },
          { path: 'alpine-a110s', lazy: async () => ({ Component: (await import('@/pages/FormulaPages')).AlpinePage }) },
          { path: 'bon-cadeau', lazy: page(() => import('@/pages/GiftCardPage')) },
          { path: 'chronos', lazy: page(() => import('@/pages/ChronosPage')) },
          { path: 'contact', lazy: page(() => import('@/pages/ContactPage')) },
          { path: 'reserver', lazy: page(() => import('@/pages/BookingPage')) },
          { path: 'reserver/evenement/:slug', lazy: page(() => import('@/pages/EventBookingPage')) },
          { path: 'reservation/:token', lazy: page(() => import('@/pages/ManageBookingPage')) },
          { path: 'mon-compte', lazy: page(() => import('@/pages/AccountPage')) },
          { path: 'demo/emails', lazy: page(() => import('@/pages/DemoInboxPage')) },
          ...['mentions-legales', 'cgv', 'confidentialite', 'cookies'].map((path) => ({
            path,
            lazy: page(() => import('@/pages/LegalPage')),
          })),
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
];
