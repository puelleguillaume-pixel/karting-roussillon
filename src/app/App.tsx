import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LazyMotion, MotionConfig } from 'framer-motion';
import type { DataRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { AuthProvider } from '@/lib/AuthProvider';
import { ConsentProvider } from '@/lib/ConsentProvider';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
    mutations: { retry: 0 },
  },
});

const loadMotionFeatures = () => import('./motion-features').then((module) => module.default);

export function App({ router }: { router: DataRouter }) {
  return (
    <QueryClientProvider client={queryClient}>
      <MotionConfig reducedMotion="user">
        {/* Animations chargées à la demande (composants « m ») */}
        <LazyMotion features={loadMotionFeatures} strict>
          <ConsentProvider>
            <AuthProvider>
              <RouterProvider router={router} />
            </AuthProvider>
          </ConsentProvider>
        </LazyMotion>
      </MotionConfig>
    </QueryClientProvider>
  );
}
