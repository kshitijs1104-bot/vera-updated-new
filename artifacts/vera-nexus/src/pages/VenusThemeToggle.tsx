import { Sun, Moon } from 'lucide-react';
import type { VenusTheme } from '../lib/venusTheme';

// Shared by all three Vera routes (Venus.tsx, GoalsOverview.tsx,
// DecisionsOverview.tsx) so there's one implementation instead of three
// copies. Each page owns its own useVenusTheme() call and passes theme/
// onToggle down — the class that actually applies the light palette
// (.v7-light) lives on each page's own root element, not here.
export function VenusThemeToggle({ theme, onToggle, className = '' }: { theme: VenusTheme; onToggle: () => void; className?: string }) {
  const isLight = theme === 'light';
  return (
    <button
      onClick={onToggle}
      title={isLight ? 'Switch to dark mode' : 'Switch to light mode'}
      aria-label={isLight ? 'Switch to dark mode' : 'Switch to light mode'}
      className={`p-1.5 rounded-lg shrink-0 ${className}`}
      style={{ color: 'var(--v7-text-mute)' }}
      onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--v7-text-dim)')}
      onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--v7-text-mute)')}
    >
      {isLight ? <Moon className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5" />}
    </button>
  );
}
