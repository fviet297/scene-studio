// Build one Remotion data bundle per project so the studio shows every comparison as its own
// named composition (instead of a single "ScenePlanVideo" that gets overwritten on each project
// switch). Emits src/projects-data/<slug>.json plus src/projects-data/index.ts re-exporting every
// already-built bundle as PROJECTS.
//
// Only the active project is rebuilt by default: measuring audio (ffprobe per scene) and aligning
// captions costs minutes per project, and the other projects' bundles on disk are still valid
// until their own assets change. Pass --all to rebuild every project, or --stale to rebuild only
// the projects whose bundle is missing or older than one of its inputs (what `npm run dev` does).
//
// Run: node scripts/build-remotion.mjs [--project <slug>] [--all | --stale]

import './lib/ensure-ffmpeg.mjs';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { listProjects, PROJECTS_DIR, projectPaths, readActiveSlug, resolveSlug } from './lib/project-paths.mjs';
import { narrationSegments, parsePlan } from './lib/parse-plan.mjs';
import { alignCaptions } from './lib/caption-align.mjs';
import { aspectInfo } from './lib/aspect.mjs';
import { readBranding } from './lib/branding.mjs';
import { sceneContentSeconds } from './lib/scene-timing.mjs';
import { clipMotionTrim } from './lib/motion-tail.mjs';

const FPS = 30;
// Silent pause inserted after every scene but the last, so narration doesn't run continuously
// scene-to-scene. Baked into sceneDurations (the single source feeding durationInFrames, the
// runtime scene timeline and caption offsets), so all three stay in sync.
const SCENE_GAP_SECONDS = 0.5;
const OUT_DIR = 'src/projects-data';

const probeDuration = (file) =>
  Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file], { encoding: 'utf8' }).trim());

const bundlePath = (slug) => join(OUT_DIR, `${slug}.json`);

const mtimeOf = (path) => (existsSync(path) ? statSync(path).mtimeMs : 0);
const newestIn = (dir) => (existsSync(dir)
  ? Math.max(0, ...readdirSync(dir).map((name) => mtimeOf(join(dir, name))))
  : 0);

// Every file the bundle is derived from. Files inside audio/, images/ and scene-videos/ are checked
// one by one: regenerating a clip overwrites it in place, which leaves the directory's own mtime
// unchanged. Images count because a replaced image retires the scene's motion clip (parse-plan.mjs).
const newestInput = (slug) => {
  const paths = projectPaths(slug);
  const profiles = existsSync(paths.profilesDir)
    ? readdirSync(paths.profilesDir).map((id) => mtimeOf(join(paths.profilesDir, id, 'profile.json')))
    : [];
  return Math.max(
    mtimeOf(paths.planMd),
    mtimeOf(paths.manifest),
    mtimeOf(join(PROJECTS_DIR, slug, 'branding.json')),
    ...profiles,
    newestIn(paths.audioDir),
    newestIn(paths.imageDir),
    newestIn(paths.sceneVideoDir),
    newestIn(paths.charV2Dir),
    newestIn(join(paths.publicRoot, 'overlay')),
  );
};
const isStale = (slug) => !existsSync(bundlePath(slug)) || newestInput(slug) > mtimeOf(bundlePath(slug));

const argv = process.argv.slice(2);
const allProjects = listProjects();
const pickTargets = () => {
  if (argv.includes('--all')) return allProjects;
  if (argv.includes('--stale')) return allProjects.filter(isStale);
  return [resolveSlug(argv)];
};
const targets = pickTargets();
for (const slug of targets) {
  if (!allProjects.includes(slug)) throw new Error(`project "${slug}" has no projects/${slug}/scene-plan.md`);
}

mkdirSync(OUT_DIR, { recursive: true });

const titleOverlaySceneOf = (planMd) => {
  const match = readFileSync(planMd, 'utf8').match(/^title-overlay-scene:\s*(\d+)\s*$/m);
  return match ? Number(match[1]) : undefined;
};

const built = [];
for (const slug of targets) {
  const paths = projectPaths(slug);
  const { title, aspect, scenes, characterRows, assetManifest, warnings } = parsePlan(slug);
  for (const w of warnings) process.stderr.write(`WARN [${slug}] ${w}\n`);
  const { width, height } = aspectInfo(aspect);

  const audioFile = (n) => join(paths.audioDir, `scene-${String(n).padStart(2, '0')}.mp3`);
  const clipFile = (n) => join(paths.sceneVideoDir, `scene-${String(n).padStart(2, '0')}.mp4`);
  const hasAudio = (n) => existsSync(audioFile(n));
  const allAudioReady = scenes.length > 0 && scenes.every((s) => hasAudio(s.scene));

  // Scene length in the final video = max(audio, clip, the scene's `duration:` minimum) — see
  // lib/scene-timing.mjs — plus a short silent gap before the next scene (none after the last). When the clip is LONGER than the narration (the model padded up
  // to its next allowed length) the scene runs the full clip and the audio's remainder is silent.
  // When the clip is SHORTER than the whole scene (narration outruns the model's max clip length),
  // the clip is slowed just enough to span the narration AND the gap, so motion never freezes into
  // a dead tail. `motionPlaybackRate` = clip/duration (≤ 1) is applied to OffthreadVideo; a
  // non-motion scene gets 1.
  const lastIndex = scenes.length - 1;
  const sceneTiming = scenes.map((s, i) => {
    const audio = hasAudio(s.scene) ? probeDuration(audioFile(s.scene)) : null;
    const clip = s.motionVideo ? probeDuration(clipFile(s.scene)) : 0;
    const content = Number(sceneContentSeconds({ audio, clip, minDuration: s.duration }).toFixed(3));
    const duration = i < lastIndex ? Number((content + SCENE_GAP_SECONDS).toFixed(3)) : content;
    const playbackRate = clip > 0 && clip < duration ? Number((clip / duration).toFixed(4)) : 1;
    const trim = clip > 0 ? clipMotionTrim(clipFile(s.scene)) : { headSeconds: 0, tailSeconds: 0 };
    return { duration, playbackRate, clip, ...trim };
  });
  const sceneDurations = sceneTiming.map((t) => t.duration);
  const motionPlaybackRates = sceneTiming.map((t) => t.playbackRate);
  const motionClipSeconds = sceneTiming.map((t) => Number(t.clip.toFixed(3)));
  const motionTailSeconds = sceneTiming.map((t) => t.tailSeconds);
  const motionHeadSeconds = sceneTiming.map((t) => t.headSeconds);
  const sceneSeconds = Object.fromEntries(scenes.map((s, i) => [s.scene, sceneDurations[i]]));

  // Captions need every scene's real audio to keep absolute timings correct; skip until then.
  // Offsets advance by sceneSeconds so a clip-extended scene doesn't desync later captions.
  const segments = narrationSegments(scenes);
  const captionGroups = allAudioReady ? alignCaptions(segments, paths.audioDir, sceneSeconds).groups : [];

  const durationInFrames = sceneDurations.reduce((sum, sec) => sum + Math.round(sec * FPS), 0) || FPS;
  const uploadedScenes = assetManifest
    .filter((m) => m.authenticity === 'USER_UPLOAD')
    .map((m) => m.scene);

  const data = {
    slug,
    title,
    aspect,
    width,
    height,
    publicPrefix: paths.staticPrefix,
    fps: FPS,
    durationInFrames,
    scenes: scenes.map((s) => ({ ...s, hasAudio: hasAudio(s.scene) })),
    // Character gallery rows (id, name, aliases, image, imageV2) for the puppet preview.
    characters: characterRows,
    sceneDurations,
    motionPlaybackRates,
    motionClipSeconds,
    motionTailSeconds,
    motionHeadSeconds,
    captionGroups,
    uploadedScenes,
    // Optional full-frame broadcast overlay drawn over every scene (projects/<slug>/overlay/*.html
    // rendered to PNG). Stamped like hasAudio so a project without one never requests the file.
    hasOverlay: existsSync(join(paths.publicRoot, 'overlay', 'news-overlay.png')),
    // Optional headline card shown only over the opening scene.
    hasTitleOverlay: existsSync(join(paths.publicRoot, 'overlay', 'news-title.png')),
    // Scene the headline card enters on: plan header `title-overlay-scene: N`, else the first scene.
    titleOverlayScene: titleOverlaySceneOf(paths.planMd),
    // Corner logo + centre watermark settings (projects/<slug>/branding.json, edited in the panel).
    branding: readBranding(slug),
  };
  writeFileSync(bundlePath(slug), `${JSON.stringify(data, null, 2)}\n`);
  built.push(slug);
  process.stdout.write(`Built ${slug}: ${scenes.length} scenes, ${captionGroups.length} caption groups, ${(durationInFrames / FPS).toFixed(1)}s${allAudioReady ? '' : ' (audio incomplete — no captions)'}\n`);
}

// Every project whose bundle exists on disk stays in the index, so rebuilding one project keeps
// the other compositions in the Studio instead of dropping them until their next build.
const bundled = allProjects.filter((slug) => built.includes(slug) || existsSync(bundlePath(slug)));

const varName = (slug) => `p_${slug.replace(/[^a-z0-9]/gi, '_')}`;
// JSON is inferred with widened field types (e.g. image.kind: string), so cast through unknown
// to the authored ProjectData shape rather than fighting structural mismatches at each import.
const index =
  `// Generated by scripts/build-remotion.mjs. Do not edit by hand.\n`
  + bundled.map((s) => `import ${varName(s)} from "./${s}.json";`).join('\n')
  + `\nimport type { ProjectData } from "../ScenePlanVideo";\n\n`
  + `export const PROJECTS = [${bundled.map(varName).join(', ')}] as unknown as ProjectData[];\n`
  // Default project for the single-scene and puppet previews: the active one at build time.
  + `export const ACTIVE_SLUG = ${JSON.stringify(readActiveSlug() ?? bundled[0] ?? '')};\n`;
const indexPath = join(OUT_DIR, 'index.ts');
// Unchanged index is left alone so a no-op --stale run doesn't trigger a Studio reload.
if (!existsSync(indexPath) || readFileSync(indexPath, 'utf8') !== index) writeFileSync(indexPath, index);

process.stdout.write(`\nBuilt ${built.length} project bundle(s); indexed ${bundled.length} → ${OUT_DIR}/index.ts\n`);
