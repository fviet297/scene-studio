// Image-to-video via the Gommo AI API (api.gommo.net, the "VMedia" service). Flow per the API doc:
//   1. POST /ai/image-upload — upload the scene image, get a hosted URL (the video first frame)
//   2. POST /ai/create-video — model + prompt + first-frame image, params snapped to the model's
//      declared capabilities (ratio/resolution/duration/mode from List Models)
//   3. POST /ai/video — poll until MEDIA_GENERATION_STATUS_SUCCESSFUL with a download_url
// Called by motion-video.mjs for any `vmedia:<slug>` model; the slug is passed as vmediaModel.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gommoPost, getModelCaps, pickCap, projectId } from './gommo-client.mjs';
import { aspectInfo } from './aspect.mjs';

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Upload a local image; returns its Gommo-hosted URL (required as the create-video first frame).
const uploadImage = async (imagePath, log) => {
  const base64 = readFileSync(imagePath).toString('base64');
  log?.('upload image: POST /ai/image-upload');
  const json = await gommoPost('/ai/image-upload', {
    data: base64, project_id: projectId(), file_name: imagePath.split('/').pop(),
  }, { label: 'gommo image-upload' });
  const url = json?.imageInfo?.url;
  if (!url) throw new Error(`gommo image-upload returned no URL: ${JSON.stringify(json).slice(0, 300)}`);
  log?.(`image URL ready: ${url}`);
  return url;
};

// Snap requested seconds to the model's allowed durations (nearest ≥, else the longest). The model
// declares its own set — 5/10 for Wan, 4/6/8 for Veo, 4..15 for Seedance — so this reads them live.
const snapDuration = (durations, target) => {
  const allowed = (durations ?? []).map((d) => Number(d.type)).filter(Number.isFinite).sort((a, b) => a - b);
  if (!allowed.length || !Number.isFinite(target)) return undefined;
  return allowed.find((d) => d >= target) ?? allowed[allowed.length - 1];
};

// The API only accepts a {mode, resolution, duration} combination that appears in the model's price
// table, so pick straight from it: snap duration to the nearest ≥ target, prefer the requested
// resolution then cheaper ones, then the lowest price. Some rows price without a resolution (it is
// then omitted from the request). Returns null when the model has no price table (caps lists used).
const pickPricedCombo = (prices, target, resolutionPref) => {
  const rows = Array.isArray(prices) ? prices : [];
  if (!rows.length) return null;
  const durations = [...new Set(rows.map((r) => Number(r.duration)).filter(Number.isFinite))].sort((a, b) => a - b);
  const duration = durations.find((d) => d >= target) ?? durations[durations.length - 1];
  const resOrder = [resolutionPref, '720p', '1080p', '480p', '4k', '4k'];
  const rank = (res) => { const i = resOrder.indexOf(res); return i < 0 ? 99 : i; };
  const candidates = rows
    .filter((r) => !Number.isFinite(duration) || Number(r.duration) === duration)
    .sort((a, b) => rank(a.resolution) - rank(b.resolution) || (a.price ?? 0) - (b.price ?? 0));
  const pick = candidates[0] ?? rows[0];
  return { mode: pick.mode, resolution: pick.resolution, duration: pick.duration != null ? String(pick.duration) : undefined };
};

// Poll /ai/video. The status body wraps the fields in `videoInfo`; status appears both as the long
// MEDIA_GENERATION_STATUS_* form and the short SUCCESS/ERROR form, so match on a substring. Per the
// doc, download_url can lag a few seconds behind success, so a success without a URL keeps polling.
const pollVideo = async (id, log) => {
  for (let attempt = 0; attempt < 120; attempt++) {
    await wait(4000);
    const state = await gommoPost('/ai/video', { videoId: id }, { label: `gommo video status ${id}` });
    const info = state?.videoInfo ?? state;
    const status = String(info?.status ?? '');
    const url = info?.download_url || info?.url;
    log?.(`poll ${attempt + 1}/120: ${status || 'pending'}`);
    if (/SUCCESS/i.test(status) && url) return url;
    if (/FAIL|ERROR/i.test(status)) throw new Error(`gommo video ${id} failed: ${info.status_message || info.message || JSON.stringify(info).slice(0, 200)}`);
  }
  throw new Error('gommo video generation timed out after 8 minutes.');
};

// `targetSeconds` is the desired clip length (from narration audio or a user override); it is
// snapped to what the chosen model accepts.
export const generateSceneVideo = async ({ scene, imagePath, outputDir = 'public/scene-videos', prompt = '', vmediaModel, targetSeconds, aspect, onLog }) => {
  if (!existsSync(imagePath)) throw new Error(`Scene image not found: ${imagePath}`);
  const model = vmediaModel || process.env.VMEDIA_VIDEO_MODEL;
  if (!model) throw new Error('Missing VMedia video model (pick one in the panel or set VMEDIA_VIDEO_MODEL).');
  const caps = await getModelCaps('video', model);
  const imageUrl = await uploadImage(imagePath, onLog);

  const wantRatio = process.env.VMEDIA_VIDEO_RATIO ?? aspectInfo(aspect).ratio;
  const ratio = pickCap(caps.ratios, [wantRatio, aspectInfo(aspect).ratio, '9:16', '16:9']);
  const resolutionPref = process.env.VMEDIA_VIDEO_RESOLUTION ?? '1080p';
  // Prefer the price table (authoritative combos); fall back to the caps lists for models without one.
  const combo = pickPricedCombo(caps.prices, targetSeconds, resolutionPref) ?? {
    resolution: pickCap(caps.resolutions, [resolutionPref, '720p', '1080p']),
    duration: (() => { const d = snapDuration(caps.durations, targetSeconds); return d ? String(d) : undefined; })(),
    mode: pickCap(caps.modes ?? caps.mode, [process.env.VMEDIA_VIDEO_MODE ?? 'relax', 'relax', 'fast']),
  };
  // Some models (e.g. Veo) price by mode/resolution only and take duration as a separate required
  // field; fill it from the model's declared durations when the chosen price row carries none.
  if (!combo.duration) {
    const d = snapDuration(caps.durations, targetSeconds);
    if (d) combo.duration = String(d);
  }

  const params = {
    model,
    privacy: 'PRIVATE',
    prompt: prompt || 'Subtle cinematic motion, preserve the historical illustration and character identity.',
    translate_to_en: 'false',
    project_id: projectId(),
    images: [{ url: imageUrl }],
    ...(ratio ? { ratio } : {}),
    ...(combo.resolution ? { resolution: combo.resolution } : {}),
    ...(combo.duration ? { duration: combo.duration } : {}),
    ...(combo.mode ? { mode: combo.mode } : {}),
  };
  onLog?.(`POST /ai/create-video model=${model} ratio=${ratio ?? '-'} res=${combo.resolution ?? '-'} dur=${combo.duration ?? '-'} mode=${combo.mode ?? '-'}`);
  const created = await gommoPost('/ai/create-video', params, { label: 'gommo create-video' });
  const id = created?.videoInfo?.id_base;
  if (!id) throw new Error(`gommo create-video returned no id_base: ${JSON.stringify(created).slice(0, 300)}`);
  onLog?.(`job accepted: ${id}`);
  const downloadUrl = await pollVideo(id, onLog);

  const output = join(outputDir, `scene-${String(scene).padStart(2, '0')}.mp4`);
  mkdirSync(outputDir, { recursive: true });
  const videoResponse = await fetch(downloadUrl);
  onLog?.(`download result: HTTP ${videoResponse.status}`);
  if (!videoResponse.ok) throw new Error(`gommo video download ${videoResponse.status}`);
  writeFileSync(output, Buffer.from(await videoResponse.arrayBuffer()));
  onLog?.(`saved: ${output}`);
  return { output, model, videoUrl: downloadUrl };
};
