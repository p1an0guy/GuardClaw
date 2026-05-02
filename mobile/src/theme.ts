import type { MemberStatus } from './types';

export const colors = {
  background: '#080B10',
  panel: '#101720',
  panelSoft: '#151E2A',
  panelRaised: '#192331',
  border: '#243244',
  borderSoft: '#1D2A3A',
  text: '#F3F7FB',
  textMuted: '#94A3B8',
  textSoft: '#CBD5E1',
  accent: '#4FD1C5',
  accentDeep: '#0F766E',
  danger: '#F87171',
  warning: '#FBBF24',
  success: '#34D399',
  blue: '#60A5FA',
  violet: '#A78BFA',
  black: '#030712',
  white: '#FFFFFF',
};

export const statusTheme: Record<
  MemberStatus,
  {
    color: string;
    backgroundColor: string;
    borderColor: string;
  }
> = {
  Safe: {
    color: '#34D399',
    backgroundColor: 'rgba(52, 211, 153, 0.13)',
    borderColor: 'rgba(52, 211, 153, 0.28)',
  },
  Home: {
    color: '#60A5FA',
    backgroundColor: 'rgba(96, 165, 250, 0.13)',
    borderColor: 'rgba(96, 165, 250, 0.28)',
  },
  Moving: {
    color: '#FBBF24',
    backgroundColor: 'rgba(251, 191, 36, 0.14)',
    borderColor: 'rgba(251, 191, 36, 0.3)',
  },
  'Needs Help': {
    color: '#F87171',
    backgroundColor: 'rgba(248, 113, 113, 0.15)',
    borderColor: 'rgba(248, 113, 113, 0.34)',
  },
  Offline: {
    color: '#94A3B8',
    backgroundColor: 'rgba(148, 163, 184, 0.12)',
    borderColor: 'rgba(148, 163, 184, 0.24)',
  },
};

export const shadow = {
  shadowColor: '#000',
  shadowOpacity: 0.28,
  shadowRadius: 16,
  shadowOffset: { width: 0, height: 8 },
  elevation: 10,
};
