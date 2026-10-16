import React from 'react';
import { Tabs } from 'expo-router';
import { Bell, Building2, LayoutDashboard, Menu } from 'lucide-react-native';
import { useTheme } from '../../constants/theme';

export default function TabsLayout() {
  const { colors } = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color, size }: { color: string; size: number }) => (
            <LayoutDashboard color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="alerts"
        options={{
          title: 'Alerts',
          tabBarIcon: ({ color, size }: { color: string; size: number }) => (
            <Bell color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="branches"
        options={{
          title: 'Branches',
          tabBarIcon: ({ color, size }: { color: string; size: number }) => (
            <Building2 color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: 'More',
          tabBarIcon: ({ color, size }: { color: string; size: number }) => (
            <Menu color={color} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}
