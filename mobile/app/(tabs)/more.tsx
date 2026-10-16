import React from 'react';
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  Activity,
  ArrowLeftRight,
  ChevronRight,
  Settings,
  UserCircle,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react-native';
import { useTheme } from '../../constants/theme';

interface MenuItem {
  label: string;
  description: string;
  icon: LucideIcon;
  route: string;
}

const MENU: MenuItem[] = [
  {
    label: 'Events',
    description: 'Camera and rules-engine events',
    icon: Activity,
    route: '/events',
  },
  {
    label: 'Exchange rates',
    description: 'Buy and sell rates by branch',
    icon: ArrowLeftRight,
    route: '/exchange-rates',
  },
  {
    label: 'Cash balances',
    description: 'Vault cash levels and thresholds',
    icon: Wallet,
    route: '/cash-balances',
  },
  {
    label: 'Employees',
    description: 'Staff directory and shifts',
    icon: Users,
    route: '/employees',
  },
  {
    label: 'Profile',
    description: 'Account details and sign out',
    icon: UserCircle,
    route: '/profile',
  },
  {
    label: 'Settings',
    description: 'Notifications, appearance, demo mode',
    icon: Settings,
    route: '/settings',
  },
];

export default function MoreScreen(): React.JSX.Element {
  const router = useRouter();
  const { colors, radius, spacing } = useTheme();

  const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },
    content: { padding: spacing.md, paddingBottom: spacing.xl },
    title: { fontSize: 22, fontWeight: '800', color: colors.text, marginBottom: spacing.md },
    card: {
      backgroundColor: colors.card,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: radius.md,
      overflow: 'hidden',
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
    },
    iconWrap: {
      width: 36,
      height: 36,
      borderRadius: radius.sm,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: spacing.sm,
    },
    rowText: { flex: 1 },
    rowLabel: { fontSize: 15, fontWeight: '600', color: colors.text },
    rowDesc: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
    footer: {
      fontSize: 12,
      color: colors.textMuted,
      textAlign: 'center',
      marginTop: spacing.lg,
    },
  });

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>More</Text>
        <View style={styles.card}>
          {MENU.map((item, index) => {
            const Icon = item.icon;
            return (
              <TouchableOpacity
                key={item.route}
                activeOpacity={0.7}
                accessibilityRole="button"
                onPress={() => router.push(item.route)}
                style={[
                  styles.row,
                  index < MENU.length - 1 && {
                    borderBottomWidth: 1,
                    borderBottomColor: colors.border,
                  },
                ]}
              >
                <View style={styles.iconWrap}>
                  <Icon size={20} color={colors.primary} />
                </View>
                <View style={styles.rowText}>
                  <Text style={styles.rowLabel}>{item.label}</Text>
                  <Text style={styles.rowDesc}>{item.description}</Text>
                </View>
                <ChevronRight size={20} color={colors.textMuted} />
              </TouchableOpacity>
            );
          })}
        </View>
        <Text style={styles.footer}>Splinter Mind · Operations</Text>
      </ScrollView>
    </SafeAreaView>
  );
}
