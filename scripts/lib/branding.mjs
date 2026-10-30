// Per-project channel branding drawn over the final render: a corner logo + brand name, and a
// large faint centre watermark against re-uploads. Stored as projects/<slug>/branding.json and
// stamped into the Remotion bundle by build-remotion.mjs. The logo itself is public/brand/logo.svg.
//
// A project without the file gets DEFAULT_BRANDING, so every video carries the brand unless a
// project switches it off in the review panel.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PROJECTS_DIR } from './project-paths.mjs';

export const BRAND_POSITIONS = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
// 16:9 only. 'crop': measure the corner from the 3:2 strip wrap-vertical.mjs keeps, so the 9:16
// export still shows the logo. 'frame': hug the real 16:9 corner (YouTube); the 9:16 export loses it.
export const BRAND_ANCHORS = ['crop', 'frame'];

// Corner badge sizes in delivered-canvas pixels (1080 wide): distance from the corner, logo
// height, brand-name font size. Bounds match the panel sliders.
export const BADGE_RANGES = {
  margin: { min: 0, max: 120 },
  size: { min: 32, max: 160 },
  textSize: { min: 10, max: 48 },
};

// Subtitle text size in delivered-canvas pixels (1080 wide); bounds match the panel slider.
export const CAPTION_SIZE_RANGE = { min: 28, max: 72 };
export const CAPTION_POSITIONS = ['top', 'middle', 'bottom'];
// Extra vertical nudge on top of the position preset, in delivered-canvas pixels (1080 wide); negative = up.
export const CAPTION_OFFSET_RANGE = { min: -300, max: 300 };
// Fonts bundled in public/fonts (src/caption-fonts.ts); 'arial' is the OS font, which differs per machine.
export const CAPTION_FONTS = ['be-vietnam', 'montserrat', 'anton', 'bangers', 'arial'];
export const CAPTION_HIGHLIGHTS = ['karaoke', 'word', 'none'];
export const CAPTION_STROKE_RANGE = { min: 0, max: 14 };
// 16:9 only, same meaning as BRAND_ANCHORS: 'crop' keeps the text inside the 3:2 strip the 9:16
// export retains; 'frame' spans the real 16:9 frame (YouTube) and the 9:16 export may crop it.
export const CAPTION_ANCHORS = BRAND_ANCHORS;
// Project-wide video effects (src/effects). `layers` are overlays drawn above every scene; the base
// vignette/grain are the per-scene filmic ground (src/scene-motion.ts) that can be switched off.
export const EFFECT_LAYERS = ['fog', 'lightRays', 'dust', 'snow', 'embers', 'rain', 'petals', 'bokeh', 'lightLeak'];
export const EFFECT_INTENSITY_RANGE = { min: 10, max: 100 };
export const TRANSITION_TYPES = ['crossfade', 'wipe', 'slide', 'zoom', 'iris', 'flash', 'none'];
export const TRANSITION_FRAMES_RANGE = { min: 4, max: 30 };
export const COLOR_GRADES = ['none', 'warm', 'cool', 'sepia'];
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

// Brand name under the corner logo and in the centre watermark; empty = logo only.
export const BRAND_NAME_MAX = 24;

export const DEFAULT_BRANDING = {
  name: 'FVIET',
  logo: { enabled: true, position: 'top-right', anchor: 'crop', opacity: 0.85, margin: 24, size: 64, textSize: 18 },
  watermark: { enabled: true, opacity: 0.08 },
  // Burned-in narration subtitles with a word-by-word highlight (src/CaptionTrack.tsx). Off by
  // default so existing projects keep rendering exactly as before.
  captions: {
    enabled: false, font: 'be-vietnam', size: 48, strokeWidth: 7, backgroundOpacity: 0.42,
    uppercase: false, highlight: 'karaoke', position: 'bottom', offsetY: 0, anchor: 'crop',
    spokenColor: '#f6c85f', unspokenColor: '#ffffff',
  },
  effects: {
    vignette: true, grain: true, grade: 'none',
    transition: { type: 'crossfade', frames: 8 },
    layers: Object.fromEntries(EFFECT_LAYERS.map((key) => [key, { enabled: false, intensity: 50 }])),
  },
};

const brandingPath = (slug) => join(PROJECTS_DIR, slug, 'branding.json');

const clampOpacity = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(1, Math.max(0, Math.round(n * 100) / 100)) : fallback;
};

const hexColor = (value, fallback) => (typeof value === 'string' && HEX_COLOR.test(value) ? value.toLowerCase() : fallback);

const clampInt = (value, { min, max }, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
};

const normalizeEffects = (raw = {}) => {
  const d = DEFAULT_BRANDING.effects;
  const transition = raw.transition ?? {};
  const layers = raw.layers ?? {};
  const flag = (value, fallback) => (typeof value === 'boolean' ? value : fallback);
  return {
    vignette: flag(raw.vignette, d.vignette),
    grain: flag(raw.grain, d.grain),
    grade: COLOR_GRADES.includes(raw.grade) ? raw.grade : d.grade,
    transition: {
      type: TRANSITION_TYPES.includes(transition.type) ? transition.type : d.transition.type,
      frames: clampInt(transition.frames, TRANSITION_FRAMES_RANGE, d.transition.frames),
    },
    layers: Object.fromEntries(EFFECT_LAYERS.map((key) => [key, {
      enabled: flag(layers[key]?.enabled, d.layers[key].enabled),
      intensity: clampInt(layers[key]?.intensity, EFFECT_INTENSITY_RANGE, d.layers[key].intensity),
    }])),
  };
};

// Keep only known fields, falling back to the default for anything missing or malformed, so a
// hand-edited or partial file can never feed garbage into the render.
export const normalizeBranding = (raw = {}) => {
  const logo = raw.logo ?? {};
  const watermark = raw.watermark ?? {};
  const captions = raw.captions ?? {};
  const d = DEFAULT_BRANDING;
  return {
    name: typeof raw.name === 'string' ? raw.name.trim().slice(0, BRAND_NAME_MAX) : d.name,
    logo: {
      enabled: typeof logo.enabled === 'boolean' ? logo.enabled : d.logo.enabled,
      position: BRAND_POSITIONS.includes(logo.position) ? logo.position : d.logo.position,
      anchor: BRAND_ANCHORS.includes(logo.anchor) ? logo.anchor : d.logo.anchor,
      opacity: clampOpacity(logo.opacity, d.logo.opacity),
      margin: clampInt(logo.margin, BADGE_RANGES.margin, d.logo.margin),
      size: clampInt(logo.size, BADGE_RANGES.size, d.logo.size),
      textSize: clampInt(logo.textSize, BADGE_RANGES.textSize, d.logo.textSize),
    },
    watermark: {
      enabled: typeof watermark.enabled === 'boolean' ? watermark.enabled : d.watermark.enabled,
      opacity: clampOpacity(watermark.opacity, d.watermark.opacity),
    },
    captions: {
      enabled: typeof captions.enabled === 'boolean' ? captions.enabled : d.captions.enabled,
      font: CAPTION_FONTS.includes(captions.font) ? captions.font : d.captions.font,
      size: clampInt(captions.size, CAPTION_SIZE_RANGE, d.captions.size),
      strokeWidth: clampInt(captions.strokeWidth, CAPTION_STROKE_RANGE, d.captions.strokeWidth),
      backgroundOpacity: Math.min(0.8, clampOpacity(captions.backgroundOpacity, d.captions.backgroundOpacity)),
      uppercase: typeof captions.uppercase === 'boolean' ? captions.uppercase : d.captions.uppercase,
      highlight: CAPTION_HIGHLIGHTS.includes(captions.highlight) ? captions.highlight : d.captions.highlight,
      position: CAPTION_POSITIONS.includes(captions.position) ? captions.position : d.captions.position,
      offsetY: clampInt(captions.offsetY, CAPTION_OFFSET_RANGE, d.captions.offsetY),
      anchor: CAPTION_ANCHORS.includes(captions.anchor) ? captions.anchor : d.captions.anchor,
      spokenColor: hexColor(captions.spokenColor, d.captions.spokenColor),
      unspokenColor: hexColor(captions.unspokenColor, d.captions.unspokenColor),
    },
    effects: normalizeEffects(raw.effects),
  };
};

export const readBranding = (slug) => {
  const path = brandingPath(slug);
  if (!existsSync(path)) return normalizeBranding();
  try {
    return normalizeBranding(JSON.parse(readFileSync(path, 'utf8')));
  } catch (e) {
    throw new Error(`${path}: invalid JSON (${e.message})`);
  }
};

export const writeBranding = (slug, raw) => {
  const branding = normalizeBranding(raw);
  writeFileSync(brandingPath(slug), `${JSON.stringify(branding, null, 2)}\n`);
  return branding;
};
