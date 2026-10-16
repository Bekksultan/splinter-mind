import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../constants/theme';
import type { AlertStatus, CameraStatusType, EntityStatus, ShiftStatus } from '../../types';

type Theme = ReturnType<typeof useTheme>;

type StatusTone = 'success' | 'neutral' | 'warning' | 'danger';

const STATUS_TONES: Record<string, StatusTone> = {
  active: 'success',
  online: 'success',
  completed: 'success',
  scheduled: 'success',
  resolved: 'success',
  inactive: 'neutral',
  unknown: 'neutral',
  cancelled: 'neutral',
  ignored: 'neutral',
  maintenance: 'warning',
  degraded: 'warning',
  missed: 'warning',
  acknowledged: 'warning',
  offline: 'danger',
  open: 'danger',
};

/** Resolve the dot color for any entity/camera/alert/shift status against the theme. */
export function getStatusColor(status: string, theme: Theme): string {
  const tone: StatusTone = STATUS_TONES[status] ?? 'neutral';
  switch (tone) {
    case 'success':
      return theme.colors.success;
    case 'warning':
      return theme.colors.severity.medium;
    case 'danger':
      return theme.colors.danger;
    case 'neutral':
    default:
      return theme.colors.info;
  }
}

function humanizeStatus(status: string): string {
  const spaced = status.replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export interface StatusBadgeProps {
  status: EntityStatus | CameraStatusType | AlertStatus | ShiftStatus;
  label?: string;
}

export function StatusBadge({ status, label }: StatusBadgeProps): React.JSX.Element {
  const theme = useTheme();
  const dotColor = getStatusColor(status, theme);
  const text = label ?? humanizeStatus(status);

  return (
    <View style={styles.row}>
      <View style={[styles.dot, { backgroundColor: dotColor }]} />
      <Text style={[styles.label, { color: theme.colors.text }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: '500',
  },
});
