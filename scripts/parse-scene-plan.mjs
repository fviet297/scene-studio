// Validate a project's scene-plan markdown: parse it, print every warning (missing prompt,
// unknown character, missing reference file, broken motion clip) and a one-line summary.
// Writes nothing — scripts and the review server parse scene-plan.md on demand
// (scripts/lib/parse-plan.mjs), and the Remotion bundle is built by build-remotion.mjs.
//
// Run: node scripts/parse-scene-plan.mjs [path-to-scene-plan.md]  (positional path overrides the
// active project's scene-plan.md; project resolved via projects/active.json, PROJECT, or --project).

import { parseProjectArg, resolveSlug } from './lib/project-paths.mjs';
import { parsePlan } from './lib/parse-plan.mjs';

const { rest } = parseProjectArg(process.argv.slice(2));
const slug = resolveSlug();

let parsed;
try {
  parsed = parsePlan(slug, rest[0]);
} catch (e) {
  process.stderr.write(`${e.message}\n`);
  process.exit(1);
}
const { input, scenes, characterRows, warnings } = parsed;
for (const w of warnings) process.stderr.write(`WARN ${w}\n`);

const ai = scenes.filter((s) => s.image.kind === 'ai').length;
const search = scenes.filter((s) => s.image.kind === 'search').length;
process.stdout.write(`Parsed ${input} (project "${slug}"): ${scenes.length} scenes (${ai} AI, ${search} search), ${characterRows.length} character(s), ${warnings.length} warning(s)\n`);
