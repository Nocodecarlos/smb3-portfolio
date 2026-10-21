import type { ThemeName } from '../content/types';

export interface Theme {
  sky: number;
  /** Tint applied to background hills. */
  hill: number;
  label: string;
}

export const THEMES: Record<ThemeName, Theme> = {
  meadow: { sky: 0xa8f0f8, hill: 0xffffff, label: 'Meadow' },
  sky: { sky: 0x6888fc, hill: 0xb8f8b8, label: 'Sky' },
  sunset: { sky: 0xfcb868, hill: 0xd8f878, label: 'Sunset' },
  night: { sky: 0x182848, hill: 0x58a858, label: 'Night' },
};

export const THEME_NAMES = Object.keys(THEMES) as ThemeName[];
