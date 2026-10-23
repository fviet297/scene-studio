// Shared scene-plan parser. Turns a project's projects/<slug>/scene-plan.md into machine data
// without writing any files or printing anything — so both the active-project pipeline
// (parse-scene-plan.mjs) and the all-projects Remotion builder (build-remotion.mjs) can reuse
// exactly one implementation. Format: see projects/_template/scene-plan.md.

import { basename, join } from 'node:path';
import { closeSync, existsSync, openSync, readFileSync, readSync } from 'node:fs';
import { projectPaths } from './project-paths.mjs';
import { parsePlanAspect } from './aspect.mjs';

// A motion video only gets used when the file is actually a playable MP4 — a failed or
// interrupted generation can leave a truncated file (or a stray placeholder saved with a .mp4
// extension) at the expected path, and Remotion hard-crashes trying to decode it. A magic-byte
// check (the 'ftyp' box every MP4 starts with) tells real video from junk without a dependency.
const isPlayableMp4 = (path) => {
  let fd;
  try {
    fd = openSync(path, 'r');
    const header = Buffer.alloc(12);
    readSync(fd, header, 0, 12, 0);
    return header.toString('ascii', 4, 8) === 'ftyp';
  } catch {
    return false;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
};

const toSeconds = (t) => {
  const m = /(\d+):(\d+)/.exec(t ?? '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

const toStaticPath = (repoPath) => repoPath.replace(/^public\//, '');

// Parse one project. Returns pure data + a warnings[] list (callers decide whether to print).
// Throws only when the markdown input is missing entirely.
export const parsePlan = (slug, inputPath) => {
  const paths = projectPaths(slug);
  const input = inputPath ?? paths.planMd;
  if (!existsSync(input)) throw new Error(`No scene-plan at ${input}`);

  const warnings = [];
  const raw = readFileSync(input, 'utf8');
  const title = raw.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? slug;
  const aspect = parsePlanAspect(raw);
  const blocks = raw.split(/^##\s+/m).slice(1);
  const characters = {};
  const scenes = [];

  for (const block of blocks) {
    const [heading, ...lines] = block.split('\n');
    const head = heading.trim().toLowerCase();

    if (head === 'characters') {
      for (const line of lines) {
        const m = /^\s*([a-z0-9-]+)\s*=\s*(.+?)\s*$/i.exec(line);
        if (m) characters[m[1]] = m[2];
      }
      continue;
    }

    const sceneMatch = /^scene\s+(\d+)/i.exec(head);
    if (!sceneMatch) continue;

    const fields = {};
    for (const line of lines) {
      const kv = /^(time|char|identity|narration|beat|prompt_vi|prompt|motion_vi|motion|camera_vi|camera|action_vi|action|env_vi|env|search|title|cue|host)\s*:\s*(.+?)\s*$/i.exec(line);
      if (kv) fields[kv[1].toLowerCase()] = kv[2].trim();
    }

    const ids = (fields.char ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    // identity: 'full' (default) locks costume/armor too; 'face' locks only face/hair/age/style.
    const identity = /^face$/i.test(fields.identity ?? '') ? 'face' : 'full';
    // camera / action / env: the scene's image-to-video direction, written independently of the
    // image prompt (scripts/lib/motion-writer.mjs); the review server wraps them into the full
    // motion prompt. motion: the older single-line motion prompt (lsvn/trangca skills), used
    // verbatim only when the three fields are absent.
    // prompt_vi / motion_vi / *_vi: close Vietnamese translations authored alongside the English
    // fields. Read-only reading aids surfaced in the review panel; never sent to any model.
    const motionParts = {
      camera: fields.camera ?? '', action: fields.action ?? '', env: fields.env ?? '',
      cameraVi: fields.camera_vi ?? '', actionVi: fields.action_vi ?? '', envVi: fields.env_vi ?? '',
    };
    const image = fields.search
      ? { kind: 'search', characters: [], query: fields.search }
      : { kind: 'ai', characters: ids, identity, prompt: fields.prompt ?? '', motion: fields.motion ?? '', promptVi: fields.prompt_vi ?? '', motionVi: fields.motion_vi ?? '', motionParts };

    // beat: the English drawable moment of the narration line (AI script writer), the motion
    // writer's input — so it never has to send the Vietnamese narration to the LLM.
    const scene = { scene: Number(sceneMatch[1]), narration: fields.narration ?? '', beat: fields.beat ?? '', image };
    for (const k of ['title', 'cue', 'host']) if (fields[k]) scene[k] = fields[k];
    if (fields.time) { const [a, b] = fields.time.split('-'); scene.from = toSeconds(a); scene.to = toSeconds(b); }

    const motionVideoPath = join(paths.sceneVideoDir, `scene-${String(scene.scene).padStart(2, '0')}.mp4`);
    if (existsSync(motionVideoPath)) {
      if (isPlayableMp4(motionVideoPath)) scene.motionVideo = true;
      else warnings.push(`scene ${scene.scene}: ${motionVideoPath} exists but is not a valid MP4 — falling back to the scene image`);
    }
    scenes.push(scene);
  }

  scenes.sort((a, b) => a.scene - b.scene);

  for (const s of scenes) {
    if (s.image.kind === 'ai' && !s.image.prompt) warnings.push(`scene ${s.scene}: no prompt and no search`);
    for (const id of s.image.characters) {
      if (!characters[id]) warnings.push(`scene ${s.scene}: unknown character "${id}"`);
      else if (!existsSync(characters[id])) warnings.push(`scene ${s.scene}: reference file missing ${characters[id]}`);
    }
  }

  // Character gallery rows: each id in the ## characters block, enriched from its profile.json
  // (display_name/aliases) when present, with a v2 (puppet-ready) image path that falls back to
  // the v1 reference when no v2 render exists yet.
  const characterRows = Object.entries(characters).map(([id, refPath]) => {
    const profilePath = join(paths.profilesDir, id, 'profile.json');
    let profile = {};
    if (existsSync(profilePath)) {
      try { profile = JSON.parse(readFileSync(profilePath, 'utf8')); } catch { profile = {}; }
    }
    const base = basename(refPath);
    const v2Path = join(paths.charV2Dir, base);
    const image = toStaticPath(refPath);
    const imageV2 = existsSync(v2Path) ? `${paths.staticPrefix}/characters/v2/${base}` : image;
    return { id, name: profile.display_name ?? profile.name ?? id, aliases: profile.aliases ?? [], image, imageV2 };
  });

  let assetManifest = [];
  if (existsSync(paths.manifest)) {
    try { assetManifest = JSON.parse(readFileSync(paths.manifest, 'utf8')); } catch { assetManifest = []; }
  }

  return { slug, input, title, aspect, characters, scenes, characterRows, assetManifest, warnings };
};
