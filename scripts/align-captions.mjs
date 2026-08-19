// Writes the active project's caption track to src/caption-data.ts. Alignment logic lives in
// scripts/lib/caption-align.mjs so the all-projects Remotion builder shares it.
// Run: node scripts/align-captions.mjs

import { writeFileSync } from 'node:fs';
import { PROJECT, SEGMENTS } from './narration-segments.mjs';
import { activePaths } from './lib/project-paths.mjs';
import { alignCaptions } from './lib/caption-align.mjs';

const paths = activePaths();
if (paths.slug !== PROJECT) {
  process.stderr.write(`narration-segments.mjs was built for project "${PROJECT}" but "${paths.slug}" is active. Run: node scripts/parse-scene-plan.mjs\n`);
  process.exit(1);
}

const { groups, totalSeconds } = alignCaptions(SEGMENTS, paths.audioDir);
writeFileSync('src/caption-data.ts', `export const captionGroups = ${JSON.stringify(groups, null, 2)} as const;\n`);
const words = groups.reduce((n, g) => n + g.length, 0);
process.stdout.write(`Aligned ${words} words into ${groups.length} groups across ${totalSeconds.toFixed(3)} seconds (approximate).\n`);
