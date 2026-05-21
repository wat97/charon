// Shared theme tokens for both mobile and desktop
export const colors = {
  bg: '#070b14',
  bgSurface: '#0f172a',
  bgCard: '#131a2b',
  line: '#24314d',
  text: '#e6edff',
  muted: '#94a5d4',
  green: '#22c55e',
  red: '#ef4444',
  blue: '#60a5fa',
  amber: '#f59e0b',
  purple: '#a855f7',
  cyan: '#06b6d4',
};

export const gradients = {
  bg: 'radial-gradient(1000px 500px at 80% -20%, #1e3a8a22, transparent 60%), radial-gradient(800px 450px at -10% 0%, #0ea5e922, transparent 55%), var(--bg)',
  card: 'linear-gradient(180deg, rgba(15,23,42,0.7), rgba(15,23,42,0.45))',
  glass: 'rgba(15,23,42,0.6)',
};

export const spacing = {
  xs: '4px',
  sm: '8px',
  md: '12px',
  lg: '16px',
  xl: '20px',
  '2xl': '24px',
  '3xl': '32px',
};

export const radius = {
  sm: '8px',
  md: '12px',
  lg: '16px',
  xl: '20px',
  full: '9999px',
};

export const typography = {
  h1: '26px',
  h2: '18px',
  h3: '16px',
  body: '14px',
  bodySm: '12px',
  bodyXs: '10px',
  mono: 'ui-monospace, SFMono-Regular, Menlo, monospace',
};

export const breakpoints = {
  mobile: 'max-width: 768px',
  tablet: 'min-width: 769px and max-width: 1024px',
  desktop: 'min-width: 1025px',
};
