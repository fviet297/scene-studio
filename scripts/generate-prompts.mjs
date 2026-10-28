// Write each AI scene's image prompt from its narration via OpenAI (scripts/lib/prompt-writer.mjs),
// following the house rules: action/setting only, never appearance; physical + cultural
// continuity; every named character placed in `char:` order. Writes `prompt:`/`prompt_vi:`
// into scene-plan.md (motion is written separately, from the review panel). Skips scenes that already have a prompt unless --force is given.
//
// Every scene missing a prompt:  node scripts/generate-prompts.mjs
// Some scenes:                   node scripts/generate-prompts.mjs 2 6 7
// Force overwrite:               node scripts/generate-prompts.mjs --force 3
// Other project:                 node scripts/generate-prompts.mjs --project other-slug

import { loadEnv } from './lib/replicate-image.mjs';
import { llmConfig } from './lib/llm-client.mjs';
import { buildCharacterContext, generateScenePrompt } from './lib/prompt-writer.mjs';
import { writeSceneField } from './lib/plan-writer.mjs';
import { activePaths, parseProjectArg } from './lib/project-paths.mjs';
import { parsePlan } from './lib/parse-plan.mjs';

loadEnv();

try { llmConfig(); } catch (error) { process.stderr.write(`${error.message}\n`); process.exit(1); }

const argv = process.argv.slice(2);
const paths = activePaths(argv);
const { scenes } = parsePlan(paths.slug);

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
  const { text, vi } = await generateScenePrompt({ narration: s.narration, characters, identity: s.image.identity });
  writeSceneField(paths.planMd, s.scene, 'prompt', text);
  writeSceneField(paths.planMd, s.scene, 'prompt_vi', vi);
  count += 1;
  process.stdout.write(`✓ scene ${s.scene}: ${text.slice(0, 80)}${text.length > 80 ? '…' : ''}\n`);
}

process.stdout.write(`Wrote ${count}/${targets.length} prompt(s).\n`);
