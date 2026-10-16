import React, { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { useTheme } from '../../constants/theme';
import { useAuthStore } from '../../stores/auth';
import { shouldUseDemo } from '../../lib/demo';
import { LoadingState, PrimaryButton, SecondaryButton } from '../../components/ui';

interface LoginForm {
  email: string;
  password: string;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LoginScreen() {
  const { colors, radius } = useTheme();
  const router = useRouter();
  const { session, profile, loading, signIn, enterDemo } = useAuthStore();
  const [authError, setAuthError] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({ defaultValues: { email: '', password: '' } });

  const authenticated = Boolean(session) || Boolean(profile);
  const demoAvailable = shouldUseDemo();

  useEffect(() => {
    if (authenticated) {
      router.replace('/dashboard');
    }
  }, [authenticated, router]);

  const onSubmit = async (data: LoginForm) => {
    setAuthError(null);
    try {
      await signIn(data.email.trim(), data.password);
      router.replace('/dashboard');
    } catch (err) {
      setAuthError(
        err instanceof Error
          ? err.message
          : 'Sign in failed. Please check your credentials and try again.',
      );
    }
  };

  const onDemo = () => {
    enterDemo();
    router.replace('/dashboard');
  };

  const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },
    avoid: { flex: 1 },
    content: { flex: 1, justifyContent: 'center', paddingHorizontal: 24 },
    card: {
      backgroundColor: colors.card,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: radius.md,
      padding: 24,
    },
    title: { fontSize: 28, fontWeight: '800', color: colors.text, marginBottom: 4 },
    subtitle: { fontSize: 14, color: colors.textSecondary, marginBottom: 24 },
    label: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, marginBottom: 6 },
    input: {
      borderWidth: 1,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 12,
      fontSize: 16,
      color: colors.text,
      backgroundColor: colors.surface,
      marginBottom: 4,
    },
    fieldError: { fontSize: 12, color: colors.danger, marginBottom: 12 },
    authError: { fontSize: 13, color: colors.danger, marginBottom: 12, textAlign: 'center' },
    gap: { height: 12 },
    demoDivider: {
      flexDirection: 'row',
      alignItems: 'center',
      marginVertical: 16,
    },
    demoLine: { flex: 1, height: 1, backgroundColor: colors.border },
    demoText: { fontSize: 12, color: colors.textMuted, marginHorizontal: 12 },
  });

  if (loading && !authenticated) {
    return (
      <SafeAreaView style={styles.root}>
        <Stack.Screen options={{ headerShown: false }} />
        <LoadingState message="Restoring session…" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <KeyboardAvoidingView
        style={styles.avoid}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.content}>
          <View style={styles.card}>
            <Text style={styles.title}>Splinter Mind</Text>
            <Text style={styles.subtitle}>Operations Control Center</Text>

            <Text style={styles.label}>Email</Text>
            <Controller
              control={control}
              name="email"
              rules={{
                required: 'Email is required',
                pattern: { value: EMAIL_PATTERN, message: 'Enter a valid email address' },
              }}
              render={({ field: { onChange, onBlur, value } }) => (
                <TextInput
                  style={[
                    styles.input,
                    { borderColor: errors.email ? colors.danger : colors.border },
                  ]}
                  placeholder="you@company.com"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  onBlur={onBlur}
                  onChangeText={onChange}
                  value={value}
                  editable={!isSubmitting}
                />
              )}
            />
            {errors.email ? (
              <Text style={styles.fieldError}>{errors.email.message}</Text>
            ) : null}

            <Text style={styles.label}>Password</Text>
            <Controller
              control={control}
              name="password"
              rules={{ required: 'Password is required' }}
              render={({ field: { onChange, onBlur, value } }) => (
                <TextInput
                  style={[
                    styles.input,
                    { borderColor: errors.password ? colors.danger : colors.border },
                  ]}
                  placeholder="••••••••"
                  placeholderTextColor={colors.textMuted}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  onBlur={onBlur}
                  onChangeText={onChange}
                  value={value}
                  editable={!isSubmitting}
                />
              )}
            />
            {errors.password ? (
              <Text style={styles.fieldError}>{errors.password.message}</Text>
            ) : null}

            {authError ? <Text style={styles.authError}>{authError}</Text> : null}

            <PrimaryButton
              title="Sign in"
              onPress={handleSubmit(onSubmit)}
              loading={isSubmitting}
            />

            {demoAvailable ? (
              <View>
                <View style={styles.demoDivider}>
                  <View style={styles.demoLine} />
                  <Text style={styles.demoText}>DEMO</Text>
                  <View style={styles.demoLine} />
                </View>
                <SecondaryButton
                  title="Continue in demo mode"
                  onPress={onDemo}
                  disabled={isSubmitting}
                />
              </View>
            ) : null}
            <View style={styles.gap} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
