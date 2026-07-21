import { useCallback, useState } from 'react';

// Vera-local theme preference — deliberately separate from the app-wide
// dark mode (Layout.tsx hardcodes `dark` unconditionally for the rest of
// the app, which is out of scope here). Same self-contained,
// best-effort localStorage pattern already used throughout this codebase
// (ve_show_goal_panel, ve_today_seen, ve_outcome_reminder_seen_*).
const KEY = 've_theme';

export type VenusTheme = 'dark' | 'light';

function readTheme(): VenusTheme {
  try {
    return localStorage.getItem(KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

function writeTheme(theme: VenusTheme) {
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // Best-effort — a private-browsing tab with no localStorage just means
    // the preference resets next visit, which is harmless.
  }
}

export function useVenusTheme() {
  const [theme, setTheme] = useState<VenusTheme>(readTheme);

  const toggle = useCallback(() => {
    setTheme((prev) => {
      const next: VenusTheme = prev === 'light' ? 'dark' : 'light';
      writeTheme(next);
      return next;
    });
  }, []);

  return { theme, toggle };
}
