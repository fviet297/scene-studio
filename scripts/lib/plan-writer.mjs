// Shared scene-plan.md writers. Used by review-server.mjs (HTTP handlers, closing over the
// active project's P.planMd) and by CLI scripts (generate-prompts.mjs) that write a single
// field back into one scene's block without touching anything else in the file.

import { readFileSync, writeFileSync } from 'node:fs';

const FIELD_RE = /^(time|char|identity|narration|prompt|motion|search|title|cue|host)\s*:/i;

// Write one scene field, replacing an existing `field:` line or inserting one after
// `narration:`. Leaves every other line intact.
export const writeSceneField = (planMd, sceneNo, field, rawValue) => {
  const clean = rawValue.replace(/\s*\n\s*/g, ' ').trim();
  const lines = readFileSync(planMd, 'utf8').split('\n');
  const headRe = new RegExp(`^##\\s+scene\\s+${sceneNo}\\b`, 'i');
  const start = lines.findIndex((l) => headRe.test(l.trim()));
  if (start < 0) throw new Error(`scene ${sceneNo} not found in ${planMd}`);
  let end = lines.findIndex((l, i) => i > start && /^##\s+/.test(l));
  if (end < 0) end = lines.length;

  const fieldLine = `${field}: ${clean}`;
  const fieldRe = new RegExp(`^${field}\\s*:`, 'i');
  const fi = lines.findIndex((l, i) => i > start && i < end && fieldRe.test(l));
  if (fi >= 0) {
    lines[fi] = fieldLine;
    // Field is a single parser line. Remove stale markdown continuation lines left by older
    // multi-line saves, while preserving any recognized scene fields that follow it.
    let next = fi + 1;
    while (next < end && (!lines[next].trim() || !FIELD_RE.test(lines[next].trim()))) next++;
    lines.splice(fi + 1, next - fi - 1);
  } else {
    const ni = lines.findIndex((l, i) => i > start && i < end && /^narration\s*:/i.test(l));
    lines.splice((ni >= 0 ? ni : start) + 1, 0, fieldLine);
  }
  writeFileSync(planMd, lines.join('\n'));
  return clean;
};

// Append a brand-new "## scene N" section at EOF (e.g. for a bulk-import row naming a scene
// not yet in the plan). parse-scene-plan.mjs sorts by scene number, so append order doesn't matter.
export const appendScene = (planMd, sceneNo, fields) => {
  const lines = readFileSync(planMd, 'utf8').split('\n');
  while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();
  const clean = (v) => v.replace(/\s*\n\s*/g, ' ').trim();
  const block = [`## scene ${sceneNo}`, ''];
  if (fields.title) block.push(`title: ${clean(fields.title)}`);
  if (fields.cue) block.push(`cue: ${clean(fields.cue)}`);
  // char: which character(s) the scene is about — drives reference locking + prompt template.
  // Passed pre-normalized to a comma id string ('' = no character → text-to-image).
  if (typeof fields.char === 'string') block.push(`char: ${clean(fields.char)}`);
  block.push(`narration: ${clean(fields.narration)}`);
  if (fields.prompt) block.push(`prompt: ${clean(fields.prompt)}`);
  writeFileSync(planMd, `${[...lines, '', ...block].join('\n')}\n`);
};

// Add one `id = path` line to the "## characters" block. Returns the repo-relative reference
// path the caller should then write an image to.
export const addCharacterToPlan = (planMd, staticPrefix, id) => {
  const lines = readFileSync(planMd, 'utf8').split('\n');
  const headIdx = lines.findIndex((l) => /^##\s+characters\s*$/i.test(l.trim()));
  if (headIdx < 0) throw new Error(`${planMd} has no "## characters" block`);
  let end = lines.findIndex((l, i) => i > headIdx && /^##\s+/.test(l));
  if (end < 0) end = lines.length;
  let insertAt = end;
  while (insertAt > headIdx + 1 && lines[insertAt - 1].trim() === '') insertAt--;
  const relPath = `public/${staticPrefix}/characters/${id}.jpg`;
  lines.splice(insertAt, 0, `${id} = ${relPath}`);
  writeFileSync(planMd, lines.join('\n'));
  return relPath;
};

export const writeCharacterPath = (planMd, id, relPath) => {
  const lines = readFileSync(planMd, 'utf8').split('\n');
  const lineRe = new RegExp(`^\\s*${id}\\s*=`);
  const index = lines.findIndex((line) => lineRe.test(line));
  if (index < 0) throw new Error(`character "${id}" not found in ${planMd}`);
  lines[index] = `${id} = ${relPath}`;
  writeFileSync(planMd, lines.join('\n'));
};

export const hasSceneHeading = (planMd, sceneNo) =>
  new RegExp(`^##\\s+scene\\s+${sceneNo}\\b`, 'im').test(readFileSync(planMd, 'utf8'));
