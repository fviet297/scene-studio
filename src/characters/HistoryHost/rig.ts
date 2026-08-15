/**
 * HistoryHost rig: the single source of truth for geometry.
 *
 * Every pivot below matches a coordinate baked into {@link HistoryHostPuppet}.
 * Change a pivot here and the corresponding part still draws in place — only its
 * centre of rotation/scale moves. Keeping pivots out of the drawing code lets
 * animation math reference them without importing JSX.
 */

/** Author-space canvas the puppet is drawn in. */
export const VIEWBOX = { width: 480, height: 560 } as const;

export type Pivot = { x: number; y: number };

/**
 * Rotation/scale centres per rigged part, in viewBox coordinates.
 *
 * - `head` pivots at the neck so tilts hinge naturally.
 * - `hat` is nested inside the head group; its pivot is the crown, in the same
 *   pre-head-transform space, so a tip-hat gag rotates around the head top.
 * - wings pivot at the shoulder (arm-like), legs at the hip, tail at its base.
 */
export const PIVOTS: Record<
  'root' | 'tail' | 'body' | 'head' | 'hat' | 'wingLeft' | 'wingRight' | 'legLeft' | 'legRight',
  Pivot
> = {
  root: { x: 220, y: 300 },
  tail: { x: 300, y: 384 },
  body: { x: 220, y: 362 },
  head: { x: 218, y: 300 },
  hat: { x: 218, y: 150 },
  wingLeft: { x: 140, y: 322 },
  wingRight: { x: 296, y: 322 },
  legLeft: { x: 198, y: 452 },
  legRight: { x: 240, y: 452 },
} as const;

/** Face sub-part centres, used by the puppet to transform eyes/brows/pupils. */
export const FACE = {
  eyeLeft: { x: 172, y: 204 },
  eyeRight: { x: 264, y: 204 },
  browLeft: { x: 172, y: 160 },
  browRight: { x: 264, y: 160 },
} as const;

/**
 * Colour palette sampled from the official character sheet. Golden-brown body,
 * tan nón lá, red/orange/green Đông Sơn tail, golden sun emblem.
 */
export const COLORS = {
  outline: '#3B2412',
  body: '#B27B3C',
  bodyShade: '#9A6831',
  bodyLight: '#C08D4E',

  hat: '#E9D39B',
  hatShade: '#D6BC7B',
  hatLine: '#B99A56',
  hatTie: '#B23A2E',

  beak: '#E8A23A',
  beakShade: '#CF8B24',
  leg: '#E8A23A',
  legShade: '#CF8B24',

  sun: '#F4C430',
  sunCore: '#F8D74E',

  belt: '#B23A2E',
  beltDark: '#7E2018',
  beltMotif: '#EBD8A2',

  tailRed: '#C0392B',
  tailOrange: '#E08A2C',
  tailGreen: '#4F8B57',
  tailYellow: '#F0C948',

  eyeWhite: '#FFFFFF',
  pupil: '#241A12',
  highlight: '#FFFFFF',
  mouthDark: '#5A2A1E',
} as const;

/** Shared cartoon outline width (viewBox units). */
export const STROKE = 6;
