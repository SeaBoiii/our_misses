export interface Difficulty {
  label: 'Getting started' | 'Easy' | 'Normal' | 'Normal+' | 'Hard' | 'Chill' | 'Tricky';
  colors: number;
  spares: 2;
  /** All colors participate in the mixed starting board. */
  activeColors: number;
  /** Likelihood of reverse dealing single layers instead of larger color groups. */
  fineMix: number;
}

export function normalizeLevel(level: number): number {
  if (!Number.isSafeInteger(level) || level < 1) throw new RangeError('Level must be a positive safe integer.');
  return level;
}

export function getDifficulty(level: number): Difficulty {
  normalizeLevel(level);
  if (level <= 5) return { label: 'Getting started', colors: 4, spares: 2, activeColors: 4, fineMix: 0.15 + level * 0.06 };
  if (level <= 15) return { label: 'Easy', colors: level < 10 ? 5 : 6, spares: 2, activeColors: level < 10 ? 5 : 6, fineMix: 0.42 };
  if (level <= 35) return { label: 'Normal', colors: 6 + (level % 3), spares: 2, activeColors: 6 + (level % 3), fineMix: 0.58 };
  if (level <= 75) return { label: 'Normal+', colors: 8 + (level % 3), spares: 2, activeColors: 8 + (level % 3), fineMix: 0.72 };
  if (level <= 150) return { label: 'Hard', colors: 9 + (level % 4), spares: 2, activeColors: 9 + (level % 4), fineMix: 0.87 };
  // Deliberate breathing room, forever. Local assistance never changes a level's seed.
  const band = (level - 151) % 8;
  const colors = [6, 8, 10, 12, 8, 7, 10, 9][band];
  const labels: Difficulty['label'][] = ['Chill', 'Normal', 'Tricky', 'Hard', 'Normal', 'Chill', 'Tricky', 'Normal'];
  return { label: labels[band], colors, spares: 2, activeColors: colors, fineMix: [0.3, 0.55, 0.8, 0.95, 0.58, 0.35, 0.8, 0.65][band] };
}

export const difficultyForLevel = getDifficulty;
