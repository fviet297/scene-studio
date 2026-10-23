// Shared scene-plan.md writers. Used by review-server.mjs (HTTP handlers, closing over the
// active project's P.planMd) and by CLI scripts (generate-prompts.mjs) that write a single
// field back into one scene's block without touching anything else in the file.

import { readFileSync, writeFileSync } from 'node:fs';

const FIELD_RE = /^(time|char|identity|narration|beat|prompt_vi|prompt|motion_vi|motion|camera_vi|camera|action_vi|action|env_vi|env|search|title|cue|host)\s*:/i;

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
    // Insert after the last field already following `narration:`, so a run of writes
    // (prompt → prompt_vi → motion → motion_vi) lands in call order instead of reversing itself.
    const ni = lines.findIndex((l, i) => i > start && i < end && /^narration\s*:/i.test(l));
    let at = ni >= 0 ? ni : start;
    for (let i = at + 1; i < end; i++) if (FIELD_RE.test(lines[i].trim())) at = i;
    lines.splice(at + 1, 0, fieldLine);
  }
  writeFileSync(planMd, lines.join('\n'));
  return clean;
};

// The motion-direction lines of a scene (see motion-writer.mjs), in write order.
export const MOTION_PART_KEYS = ['camera', 'camera_vi', 'action', 'action_vi', 'env', 'env_vi'];

// Drop one scene field line, if present. Leaves every other line intact.
export const removeSceneField = (planMd, sceneNo, field) => {
  const lines = readFileSync(planMd, 'utf8').split('\n');
  const headRe = new RegExp(`^##\\s+scene\\s+${sceneNo}\\b`, 'i');
  const start = lines.findIndex((l) => headRe.test(l.trim()));
  if (start < 0) return;
  let end = lines.findIndex((l, i) => i > start && /^##\s+/.test(l));
  if (end < 0) end = lines.length;
  const fieldRe = new RegExp(`^${field}\\s*:`, 'i');
  const fi = lines.findIndex((l, i) => i > start && i < end && fieldRe.test(l));
  if (fi < 0) return;
  lines.splice(fi, 1);
  writeFileSync(planMd, lines.join('\n'));
};

// Write the motion-direction fields present in `parts` ({ camera, camera_vi, … }). Writing any
// English part retires the scene's older single-line `motion:` / `motion_vi:`, which would
// otherwise sit in the file looking authoritative while the three parts are what gets sent.
export const writeMotionParts = (planMd, sceneNo, parts) => {
  for (const f of MOTION_PART_KEYS) if (typeof parts[f] === 'string') writeSceneField(planMd, sceneNo, f, parts[f]);
  if (['camera', 'action', 'env'].some((f) => (parts[f] ?? '').trim())) {
    removeSceneField(planMd, sceneNo, 'motion');
    removeSceneField(planMd, sceneNo, 'motion_vi');
  }
};

// The lines of one "## scene N" block, in the field order every writer here emits.
const sceneBlockLines = (sceneNo, fields) => {
  const clean = (v) => v.replace(/\s*\n\s*/g, ' ').trim();
  const block = [`## scene ${sceneNo}`, ''];
  if (fields.title) block.push(`title: ${clean(fields.title)}`);
  if (fields.cue) block.push(`cue: ${clean(fields.cue)}`);
  // char: which character(s) the scene is about — drives reference locking + prompt template.
  // Passed pre-normalized to a comma id string ('' = no character → text-to-image).
  if (typeof fields.char === 'string') block.push(`char: ${clean(fields.char)}`);
  block.push(`narration: ${clean(fields.narration)}`);
  if (fields.beat) block.push(`beat: ${clean(fields.beat)}`);
  if (fields.prompt) block.push(`prompt: ${clean(fields.prompt)}`);
  if (fields.prompt_vi) block.push(`prompt_vi: ${clean(fields.prompt_vi)}`);
  if (fields.motion) block.push(`motion: ${clean(fields.motion)}`);
  if (fields.motion_vi) block.push(`motion_vi: ${clean(fields.motion_vi)}`);
  for (const f of MOTION_PART_KEYS) if (fields[f]) block.push(`${f}: ${clean(fields[f])}`);
  return block;
};

// Append a brand-new "## scene N" section at EOF (e.g. for a bulk-import row naming a scene
// not yet in the plan). parse-scene-plan.mjs sorts by scene number, so append order doesn't matter.
export const appendScene = (planMd, sceneNo, fields) => {
  const lines = readFileSync(planMd, 'utf8').split('\n');
  while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();
  writeFileSync(planMd, `${[...lines, '', ...sceneBlockLines(sceneNo, fields)].join('\n')}\n`);
};

// A whole scene-plan.md as text: `# title`, the "## characters" block ({ id: reference path },
// kept even when empty so characters can be added later), then one block per scene
// ({ scene, ...fields } as appendScene takes them). Header lines (aspect, template, voice) are
// stamped afterwards with writePlanHeader.
export const renderScenePlan = ({ title, characters, scenes }) => `${[
  `# ${title}`,
  '',
  '## characters',
  '',
  ...Object.entries(characters).map(([id, path]) => `${id} = ${path}`),
  ...scenes.flatMap(({ scene, ...fields }) => ['', ...sceneBlockLines(scene, fields)]),
].join('\n')}\n`;

// Add one `id = path` line to the "## characters" block. Returns the repo-relative reference
// path the caller should then write an image to.
// Where a character's reference image lives: one .jpg per id under the project's characters dir.
export const characterRefPath = (staticPrefix, id) => `public/${staticPrefix}/characters/${id}.jpg`;

export const addCharacterToPlan = (planMd, staticPrefix, id) => {
  const lines = readFileSync(planMd, 'utf8').split('\n');
  const headIdx = lines.findIndex((l) => /^##\s+characters\s*$/i.test(l.trim()));
  if (headIdx < 0) throw new Error(`${planMd} has no "## characters" block`);
  let end = lines.findIndex((l, i) => i > headIdx && /^##\s+/.test(l));
  if (end < 0) end = lines.length;
  let insertAt = end;
  while (insertAt > headIdx + 1 && lines[insertAt - 1].trim() === '') insertAt--;
  const relPath = characterRefPath(staticPrefix, id);
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

// Project-level `key: value` lines (aspect, template) live in the header, above the first `##`
// block. Matching is anchored at the line start, so the template's commented-out example
// ("<!-- ... `aspect: 16:9` ... -->") never counts.
const headerLineRe = (key) => new RegExp(`^\\s*${key}\\s*:\\s*(.*?)\\s*$`, 'i');
const headerEnd = (lines) => {
  const end = lines.findIndex((l) => /^##\s+/.test(l));
  return end < 0 ? lines.length : end;
};

export const readPlanHeader = (raw, key) => {
  const lines = raw.split('\n');
  const re = headerLineRe(key);
  const match = lines.slice(0, headerEnd(lines)).map((l) => re.exec(l)).find(Boolean);
  return match?.[1] || null;
};

// Set a header line, replacing an existing one or inserting it under the `# title`.
export const writePlanHeader = (planMd, key, value) => {
  const lines = readFileSync(planMd, 'utf8').split('\n');
  const end = headerEnd(lines);
  const re = headerLineRe(key);
  const line = `${key}: ${value}`;
  const existing = lines.findIndex((l, i) => i < end && re.test(l));
  if (existing >= 0) lines[existing] = line;
  else {
    const title = lines.findIndex((l, i) => i < end && /^#\s+/.test(l));
    if (title >= 0) lines.splice(title + 1, 0, '', line);
    else lines.splice(0, 0, line, '');
  }
  writeFileSync(planMd, lines.join('\n'));
};

export const hasSceneHeading = (planMd, sceneNo) =>
  new RegExp(`^##\\s+scene\\s+${sceneNo}\\b`, 'im').test(readFileSync(planMd, 'utf8'));

// Merge two or more scenes into one. Their narration lines are joined (ascending scene order,
// single space, no added punctuation) into `keepScene`; every other listed scene's block is
// removed outright, so its prompt/motion/char/etc. never survive the merge — only `keepScene`'s
// own non-narration fields do. Caller (review-server) is responsible for checking the scenes are
// adjacent in the plan; this just edits the markdown.
export const mergeScenes = (planMd, sceneNumbers, keepScene) => {
  const nums = [...new Set(sceneNumbers)].sort((a, b) => a - b);
  if (nums.length < 2) throw new Error('merge needs at least 2 scenes');
  if (!nums.includes(keepScene)) throw new Error(`keep scene ${keepScene} is not one of the merged scenes`);

  const lines = readFileSync(planMd, 'utf8').split('\n');
  const range = (sceneNo) => {
    const headRe = new RegExp(`^##\\s+scene\\s+${sceneNo}\\b`, 'i');
    const start = lines.findIndex((l) => headRe.test(l.trim()));
    if (start < 0) throw new Error(`scene ${sceneNo} not found in ${planMd}`);
    const end = lines.findIndex((l, i) => i > start && /^##\s+/.test(l));
    return { start, end: end < 0 ? lines.length : end };
  };

  const narrRe = /^narration\s*:\s*(.*)$/i;
  const merged = nums
    .map((n) => {
      const { start, end } = range(n);
      for (let i = start; i < end; i++) {
        const m = narrRe.exec(lines[i].trim());
        if (m) return m[1].trim();
      }
      return '';
    })
    .filter(Boolean)
    .join(' ');

  // Remove every merged-away block, highest start first, so earlier ranges stay valid as later
  // ones are spliced out.
  const removals = nums.filter((n) => n !== keepScene).map(range).sort((a, b) => b.start - a.start);
  for (const { start, end } of removals) lines.splice(start, end - start);
  writeFileSync(planMd, lines.join('\n'));

  return writeSceneField(planMd, keepScene, 'narration', merged);
};
