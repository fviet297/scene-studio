// Writes the active project's caption track to src/caption-data.ts. Alignment logic lives in
// scripts/lib/caption-align.mjs so the all-projects Remotion builder shares it.
// Run: node scripts/align-captions.mjs

import { writeFileSync } from 'node:fs';
import { activePaths } from './lib/project-paths.mjs';
import { narrationSegments, parsePlan } from './lib/parse-plan.mjs';
import { alignCaptions } from './lib/caption-align.mjs';

const paths = activePaths();
const SEGMENTS = narrationSegments(parsePlan(paths.slug).scenes);

const { groups, totalSeconds } = alignCaptions(SEGMENTS, paths.audioDir);
writeFileSync('src/caption-data.ts', `export const captionGroups = ${JSON.stringify(groups, null, 2)} as const;\n`);
const words = groups.reduce((n, g) => n + g.length, 0);
process.stdout.write(`Aligned ${words} words into ${groups.length} groups across ${totalSeconds.toFixed(3)} seconds (approximate).\n`);
