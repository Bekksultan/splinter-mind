import { useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Redirect, Stack } from 'expo-router';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { persistQueryClient } from '@tanstack/react-query-persist-client';
import type { ReactNode } from 'react';
import { LoadingState } from '../components/ui/LoadingState';
import { isDemoMode } from '../lib/demo';
import { registerForPushNotificationsAsync } from '../lib/notifications';
import { useAuthStore } from '../stores/auth';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 10 * 60_000,
      retry: 1,
    },
  },
});

const persister = createAsyncStoragePersister({ storage: AsyncStorage });
persistQueryClient({ queryClient, persister });

function AuthGate({ children }: { children: ReactNode }) {
  const loading = useAuthStore((s) => s.loading);
  const session = useAuthStore((s) => s.session);
  const demoOverride = useAuthStore((s) => s.demoOverride);

  if (loading) return <LoadingState />;
  if (!session && !demoOverride && !isDemoMode()) {
    return <Redirect href="/(auth)/login" />;
  }
  return <>{children}</>;
}

export default function RootLayout() {
  const init = useAuthStore((s) => s.init);
  const userId = useAuthStore((s) => s.profile?.id ?? s.session?.user.id ?? null);

  useEffect(() => {
    void init();
  }, [init]);

  // Fire-and-forget push token registration once a user is known.
  useEffect(() => {
    if (userId) {
      void registerForPushNotificationsAsync();
    }
  }, [userId]);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthGate>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="alerts/[id]" />
          <Stack.Screen name="branches/[id]" />
          <Stack.Screen name="cameras/[id]" />
          <Stack.Screen name="events" />
          <Stack.Screen name="exchange-rates" />
          <Stack.Screen name="cash-balances" />
          <Stack.Screen name="employees" />
          <Stack.Screen name="profile" />
          <Stack.Screen name="settings" />
          <Stack.Screen name="+not-found" />
        </Stack>
      </AuthGate>
    </QueryClientProvider>
  );
}
