import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../../constants/theme';
import type { Branch } from '../../types';
import { StatusBadge } from './StatusBadge';

export interface BranchCardProps {
  branch: Branch;
  openAlerts: number;
  camerasOnline: number;
  camerasTotal: number;
  onPress: () => void;
}

export function BranchCard({
  branch,
  openAlerts,
  camerasOnline,
  camerasTotal,
  onPress,
}: BranchCardProps): React.JSX.Element {
  const theme = useTheme();
  const alertsColor = openAlerts > 0 ? theme.colors.danger : theme.colors.textMuted;

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={onPress}
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.card,
          borderColor: theme.colors.border,
          borderRadius: theme.radius.md,
          padding: theme.spacing.md,
        },
      ]}
    >
      <View style={styles.headerRow}>
        <Text style={[styles.name, { color: theme.colors.text }]} numberOfLines={1}>
          {branch.name}
        </Text>
        <StatusBadge status={branch.status} />
      </View>
      <Text style={[styles.meta, { color: theme.colors.textSecondary }]}>
        Cameras {camerasOnline}/{camerasTotal} online
      </Text>
      <Text style={[styles.meta, { color: alertsColor }]}>
        {openAlerts} open {openAlerts === 1 ? 'alert' : 'alerts'}
      </Text>
      {branch.address ? (
        <Text style={[styles.address, { color: theme.colors.textMuted }]} numberOfLines={1}>
          {branch.address}
        </Text>
      ) : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  name: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    marginRight: 8,
  },
  meta: {
    fontSize: 14,
    marginBottom: 2,
  },
  address: {
    fontSize: 13,
    marginTop: 4,
  },
});
