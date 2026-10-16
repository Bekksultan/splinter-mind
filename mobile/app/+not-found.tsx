import React from 'react';
import { SafeAreaView, StyleSheet, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useTheme } from '../constants/theme';
import { EmptyState, SecondaryButton } from '../components/ui';

export default function NotFoundScreen(): React.JSX.Element {
  const router = useRouter();
  const { colors, spacing } = useTheme();

  const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },
    content: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.lg,
    },
    buttonWrap: { marginTop: spacing.md, width: 200 },
  });

  return (
    <SafeAreaView style={styles.root}>
      <Stack.Screen options={{ title: 'Not found' }} />
      <View style={styles.content}>
        <EmptyState
          title="Page not found"
          message="This screen doesn't exist or was moved."
        />
        <View style={styles.buttonWrap}>
          <SecondaryButton
            title="Go home"
            onPress={() => router.replace('/dashboard')}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}
