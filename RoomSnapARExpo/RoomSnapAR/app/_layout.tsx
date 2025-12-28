import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Sentry from '@sentry/react-native';
import { useEffect } from 'react';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/useColorScheme';
import { SettingsProvider } from '@/contexts/SettingsContext';
import ErrorBoundary from '@/components/ErrorBoundary';
import { AnalyticsService } from '@/services/AnalyticsService';

// Initialize Sentry for crash reporting
Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN || '',
  debug: __DEV__,
  tracesSampleRate: __DEV__ ? 1.0 : 0.2,
  environment: __DEV__ ? 'development' : 'production',
  enabled: !__DEV__, // Only enable in production
});

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [loaded] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  // Initialize analytics service
  useEffect(() => {
    const initializeServices = async () => {
      try {
        const analytics = AnalyticsService.getInstance();
        await analytics.initialize();

        // Track app launch
        const launchTime = Date.now() - (global as any).__APP_START_TIME || 0;
        if (launchTime > 0) {
          await analytics.trackAppLaunch(launchTime);
        }
      } catch (error) {
        console.error('Failed to initialize analytics:', error);
        Sentry.captureException(error);
      }
    };

    if (loaded) {
      initializeServices();
    }
  }, [loaded]);

  if (!loaded) {
    // Async font loading only occurs in development.
    return null;
  }

  return (
    <ErrorBoundary>
      <SettingsProvider>
        <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
          <Stack>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="+not-found" />
          </Stack>
          <StatusBar style="auto" />
        </ThemeProvider>
      </SettingsProvider>
    </ErrorBoundary>
  );
}
