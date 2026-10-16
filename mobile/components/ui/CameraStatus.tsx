import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../../constants/theme';
import type { Camera } from '../../types';
import { StatusBadge, getStatusColor } from './StatusBadge';

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

export interface CameraStatusProps {
  camera: Camera;
  onPress?: () => void;
  compact?: boolean;
}

export function CameraStatus({
  camera,
  onPress,
  compact = false,
}: CameraStatusProps): React.JSX.Element {
  const theme = useTheme();
  const dotColor = getStatusColor(camera.status, theme);
  const ago = camera.last_seen_at ? timeAgo(camera.last_seen_at) : '';

  const content = (
    <View
      style={[
        styles.row,
        { paddingVertical: compact ? theme.spacing.xs : theme.spacing.sm },
      ]}
    >
      <View style={[styles.dot, { backgroundColor: dotColor }]} />
      <Text style={[styles.name, { color: theme.colors.text }]} numberOfLines={1}>
        {camera.name}
      </Text>
      <StatusBadge status={camera.status} />
      <Text style={[styles.seen, { color: theme.colors.textMuted }]}>
        {ago ? `Last seen ${ago}` : 'Never seen'}
      </Text>
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity activeOpacity={0.7} onPress={onPress}>
        {content}
      </TouchableOpacity>
    );
  }
  return content;
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
    marginRight: 8,
  },
  name: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    marginRight: 8,
  },
  seen: {
    fontSize: 12,
    marginLeft: 8,
  },
});
