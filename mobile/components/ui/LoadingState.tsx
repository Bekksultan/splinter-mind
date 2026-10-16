import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../constants/theme';

export interface LoadingStateProps {
  message?: string;
}

export function LoadingState({ message }: LoadingStateProps): React.JSX.Element {
  const theme = useTheme();

  return (
    <View style={[styles.container, { padding: theme.spacing.xl }]}>
      <ActivityIndicator size="large" color={theme.colors.primary} />
      {message ? (
        <Text style={[styles.message, { color: theme.colors.textSecondary }]}>{message}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  message: {
    fontSize: 14,
    marginTop: 12,
    textAlign: 'center',
  },
});
