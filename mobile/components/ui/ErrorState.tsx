import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../constants/theme';
import { SecondaryButton } from './SecondaryButton';

export interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
}

export function ErrorState({ message, onRetry }: ErrorStateProps): React.JSX.Element {
  const theme = useTheme();

  return (
    <View style={[styles.container, { padding: theme.spacing.xl }]}>
      <View
        style={[
          styles.circle,
          {
            borderColor: theme.colors.danger,
            backgroundColor: theme.colors.severityBg.critical,
          },
        ]}
      >
        <Text style={[styles.mark, { color: theme.colors.danger }]}>!</Text>
      </View>
      <Text style={[styles.message, { color: theme.colors.text }]}>{message}</Text>
      {onRetry ? (
        <View style={styles.retry}>
          <SecondaryButton title="Retry" onPress={onRetry} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  circle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  mark: {
    fontSize: 26,
    fontWeight: '700',
  },
  message: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 4,
  },
  retry: {
    marginTop: 12,
    width: 160,
    alignSelf: 'center',
  },
});
