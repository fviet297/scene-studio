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

// Brand name under the corner logo and in the centre watermark; empty = logo only.
export const BRAND_NAME_MAX = 24;

export const DEFAULT_BRANDING = {
  name: 'FVIET',
  logo: { enabled: true, position: 'top-right', anchor: 'crop', opacity: 0.85, margin: 24, size: 64, textSize: 18 },
  watermark: { enabled: true, opacity: 0.08 },
};

const brandingPath = (slug) => join(PROJECTS_DIR, slug, 'branding.json');

const clampOpacity = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(1, Math.max(0, Math.round(n * 100) / 100)) : fallback;
};

const clampInt = (value, { min, max }, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
};

// Keep only known fields, falling back to the default for anything missing or malformed, so a
// hand-edited or partial file can never feed garbage into the render.
export const normalizeBranding = (raw = {}) => {
  const logo = raw.logo ?? {};
  const watermark = raw.watermark ?? {};
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
