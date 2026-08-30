// Write each AI scene's image prompt from its narration via OpenAI (scripts/lib/prompt-writer.mjs),
// following the house rules: action/setting only, never appearance; physical + cultural
// continuity; every named character placed in `char:` order. The same call also writes the
// scene's image-to-video `motion:` prompt. Writes `prompt:`/`prompt_vi:`/`motion:`/`motion_vi:`
// into scene-plan.md and reparses. Skips scenes that already have a prompt unless --force is given.
//
// Every scene missing a prompt:  node scripts/generate-prompts.mjs
// Some scenes:                   node scripts/generate-prompts.mjs 2 6 7
// Force overwrite:               node scripts/generate-prompts.mjs --force 3
// Other project:                 node scripts/generate-prompts.mjs --project other-slug

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadEnv } from './lib/replicate-image.mjs';
import { buildCharacterContext, generateScenePrompt } from './lib/prompt-writer.mjs';
import { writeSceneField } from './lib/plan-writer.mjs';
import { activePaths, parseProjectArg, resolveSlug } from './lib/project-paths.mjs';

loadEnv();

const PLAN = 'src/scene-plan.json';
if (!process.env.OPENAI_API_KEY) { process.stderr.write('OPENAI_API_KEY not set (put it in .env).\n'); process.exit(1); }
if (!existsSync(PLAN)) { process.stderr.write(`No ${PLAN}. Run: node scripts/parse-scene-plan.mjs\n`); process.exit(1); }

const argv = process.argv.slice(2);
const slug = resolveSlug(argv);
const paths = activePaths(argv);
const { project, scenes } = JSON.parse(readFileSync(PLAN, 'utf8'));
if (project !== slug) { process.stderr.write(`${PLAN} was parsed for project "${project}" but "${slug}" is active. Run: node scripts/parse-scene-plan.mjs\n`); process.exit(1); }

const { rest } = parseProjectArg(argv);
const force = rest.includes('--force');
const only = rest.filter((a) => a !== '--force').map(Number).filter(Number.isFinite);

const targets = scenes.filter((s) => {
  if (s.image.kind !== 'ai') return false;
  if (only.length && !only.includes(s.scene)) return false;
  if (!force && s.image.prompt) return false;
  return true;
});

if (!targets.length) {
  process.stdout.write('Nothing to do (every targeted scene already has a prompt; pass --force to overwrite).\n');
  process.exit(0);
}

let count = 0;
for (const s of targets) {
  if (!s.narration) { process.stdout.write(`✗ scene ${s.scene}: no narration, skipped\n`); continue; }
  const characters = buildCharacterContext(s.image.characters, paths.profilesDir);
  const { text, vi, motion, motionVi } = await generateScenePrompt({ narration: s.narration, characters, identity: s.image.identity });
  writeSceneField(paths.planMd, s.scene, 'prompt', text);
  writeSceneField(paths.planMd, s.scene, 'prompt_vi', vi);
  // Only overwrite motion when the model actually returned one, so a hand-authored `motion:`
  // survives a reply that came back without the motion sections.
  if (motion) writeSceneField(paths.planMd, s.scene, 'motion', motion);
  if (motionVi) writeSceneField(paths.planMd, s.scene, 'motion_vi', motionVi);
  count += 1;
  process.stdout.write(`✓ scene ${s.scene}: ${text.slice(0, 80)}${text.length > 80 ? '…' : ''}\n`);
}

if (count) execFileSync('node', [join('scripts', 'parse-scene-plan.mjs'), paths.planMd], { stdio: 'ignore' });
process.stdout.write(`Wrote ${count}/${targets.length} prompt(s).\n`);
