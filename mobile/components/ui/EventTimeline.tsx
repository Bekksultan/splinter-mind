import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../../constants/theme';
import type { TimelineItem } from '../../types';

function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export interface EventTimelineProps {
  items: TimelineItem[];
  onItemPress?: (item: TimelineItem) => void;
}

export function EventTimeline({ items, onItemPress }: EventTimelineProps): React.JSX.Element {
  const theme = useTheme();

  return (
    <View>
      {items.map((item, index) => {
        const dotColor = item.severity
          ? theme.colors.severity[item.severity] ?? theme.colors.info
          : theme.colors.info;
        const isLast = index === items.length - 1;

        const body = (
          <View style={styles.item}>
            <View style={styles.rail}>
              <View style={[styles.dot, { backgroundColor: dotColor }]} />
              {!isLast ? (
                <View style={[styles.line, { backgroundColor: theme.colors.border }]} />
              ) : null}
            </View>
            <View
              style={[styles.content, { paddingBottom: isLast ? 0 : theme.spacing.md }]}
            >
              <Text style={[styles.time, { color: theme.colors.textMuted }]}>
                {formatTime(item.time)}
              </Text>
              <Text style={[styles.title, { color: theme.colors.text }]}>{item.title}</Text>
              {item.description ? (
                <Text style={[styles.description, { color: theme.colors.textSecondary }]}>
                  {item.description}
                </Text>
              ) : null}
            </View>
          </View>
        );

        if (onItemPress) {
          return (
            <TouchableOpacity
              key={item.id}
              activeOpacity={0.7}
              onPress={() => onItemPress(item)}
            >
              {body}
            </TouchableOpacity>
          );
        }
        return <View key={item.id}>{body}</View>;
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  item: {
    flexDirection: 'row',
  },
  rail: {
    width: 24,
    alignItems: 'center',
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 3,
  },
  line: {
    width: 2,
    flex: 1,
    marginTop: 4,
  },
  content: {
    flex: 1,
  },
  time: {
    fontSize: 12,
    marginBottom: 2,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  description: {
    fontSize: 13,
    lineHeight: 18,
  },
});
