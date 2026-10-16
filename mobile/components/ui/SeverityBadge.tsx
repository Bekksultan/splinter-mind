import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../constants/theme';
import type { Severity } from '../../types';

export interface SeverityBadgeProps {
  severity: Severity;
  size?: 'sm' | 'md';
}

export function SeverityBadge({ severity, size = 'md' }: SeverityBadgeProps): React.JSX.Element {
  const theme = useTheme();
  const backgroundColor = theme.colors.severityBg[severity] ?? theme.colors.surface;
  const color = theme.colors.severity[severity] ?? theme.colors.text;
  const fontSize = size === 'sm' ? 11 : 13;

  return (
    <View
      style={[
        styles.pill,
        {
          backgroundColor,
          paddingHorizontal: size === 'sm' ? 8 : 10,
          paddingVertical: size === 'sm' ? 3 : 4,
        },
      ]}
    >
      <Text style={[styles.label, { color, fontSize }]}>{severity.toUpperCase()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: 'flex-start',
    borderRadius: 999,
  },
  label: {
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
