import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../../constants/theme';
import type { Alert } from '../../types';
import { SeverityBadge } from './SeverityBadge';
import { StatusBadge } from './StatusBadge';

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diffMs)) return '';
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export interface AlertCardProps {
  alert: Alert;
  branchName?: string;
  onPress: () => void;
  compact?: boolean;
}

export function AlertCard({
  alert,
  branchName,
  onPress,
  compact = false,
}: AlertCardProps): React.JSX.Element {
  const theme = useTheme();
  const severityColor = theme.colors.severity[alert.severity] ?? theme.colors.info;

  const metaParts: string[] = [];
  if (branchName) metaParts.push(branchName);
  const ago = timeAgo(alert.created_at);
  if (ago) metaParts.push(ago);

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
        },
      ]}
    >
      <View style={[styles.bar, { backgroundColor: severityColor }]} />
      <View style={[styles.content, { padding: compact ? theme.spacing.sm : theme.spacing.md }]}>
        <View style={styles.topRow}>
          <SeverityBadge severity={alert.severity} size="sm" />
          <View style={styles.spacer} />
          <Text style={[styles.chevron, { color: theme.colors.textMuted }]}>›</Text>
        </View>
        <Text
          style={[styles.title, { color: theme.colors.text }]}
          numberOfLines={compact ? 1 : 2}
        >
          {alert.title}
        </Text>
        {metaParts.length > 0 ? (
          <Text style={[styles.meta, { color: theme.colors.textMuted }]}>
            {metaParts.join(' · ')}
          </Text>
        ) : null}
        <View style={styles.statusRow}>
          <StatusBadge status={alert.status} />
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    borderWidth: 1,
    overflow: 'hidden',
  },
  bar: {
    width: 4,
  },
  content: {
    flex: 1,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  spacer: {
    flex: 1,
  },
  chevron: {
    fontSize: 20,
    fontWeight: '600',
    marginLeft: 8,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 4,
  },
  meta: {
    fontSize: 13,
    marginBottom: 8,
  },
  statusRow: {
    flexDirection: 'row',
  },
});
