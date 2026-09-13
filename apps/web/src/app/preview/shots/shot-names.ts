/** Compositions behind docs/images; scripts/capture-screenshots.mjs lists their viewport sizes. */
export const SHOT_NAMES = ['conversation', 'review', 'side-panel', 'social'] as const

export type ShotName = (typeof SHOT_NAMES)[number]
