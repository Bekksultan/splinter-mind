import type { Severity } from '../types';
import { useThemeMode } from '../stores/theme';

export interface Theme {
  mode: 'light' | 'dark';
  colors: {
    background: string;
    surface: string;
    card: string;
    text: string;
    textSecondary: string;
    textMuted: string;
    border: string;
    primary: string;
    onPrimary: string;
    danger: string;
    success: string;
    warning: string;
    info: string;
    severity: Record<Severity, string>;
    severityBg: Record<Severity, string>;
  };
  radius: { sm: number; md: number; lg: number };
  spacing: { xs: number; sm: number; md: number; lg: number; xl: number };
}

export const severityColors: Record<Severity, string> = {
  critical: '#DC2626',
  high: '#EA580C',
  medium: '#D97706',
  low: '#2563EB',
  info: '#64748B',
};

// 14% alpha tints of each severity color.
export const severityBg: Record<Severity, string> = {
  critical: 'rgba(220,38,38,0.14)',
  high: 'rgba(234,88,12,0.14)',
  medium: 'rgba(217,119,6,0.14)',
  low: 'rgba(37,99,235,0.14)',
  info: 'rgba(100,116,139,0.14)',
};

const radius = { sm: 8, md: 12, lg: 16 };
const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 };

export const lightTheme: Theme = {
  mode: 'light',
  colors: {
    background: '#F8FAFC',
    surface: '#FFFFFF',
    card: '#FFFFFF',
    text: '#0F172A',
    textSecondary: '#475569',
    textMuted: '#94A3B8',
    border: '#E2E8F0',
    primary: '#2563EB',
    onPrimary: '#FFFFFF',
    danger: '#DC2626',
    success: '#16A34A',
    warning: '#D97706',
    info: '#64748B',
    severity: severityColors,
    severityBg,
  },
  radius,
  spacing,
};

export const darkTheme: Theme = {
  mode: 'dark',
  colors: {
    background: '#0B1220',
    surface: '#0F1830',
    card: '#16213A',
    text: '#E6EDF7',
    textSecondary: '#9FB0C7',
    textMuted: '#64748B',
    border: '#24314D',
    primary: '#3B82F6',
    onPrimary: '#FFFFFF',
    danger: '#EF4444',
    success: '#22C55E',
    warning: '#F59E0B',
    info: '#94A3B8',
    severity: severityColors,
    severityBg,
  },
  radius,
  spacing,
};

export function useTheme(): Theme {
  const mode = useThemeMode((s) => s.mode);
  return mode === 'dark' ? darkTheme : lightTheme;
}
