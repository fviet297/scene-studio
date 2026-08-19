import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const API_URL = 'https://v2.api.gommo.net/ai/jobs/video';
const STATUS_URL = 'https://v2.api.gommo.net/ai/jobs/video';
const UPLOAD_URL = 'https://v2.api.gommo.net/ai/upload/image';
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const firstUrl = (value) => {
  if (typeof value === 'string' && /^https?:\/\//.test(value)) return value;
  if (!value || typeof value !== 'object') return null;
  for (const key of ['url', 'video_url', 'file_url', 'download_url', 'output_url', 'media_url']) {
    const found = firstUrl(value[key]);
    if (found) return found;
  }
  for (const valuePart of Object.values(value)) {
    const found = firstUrl(valuePart);
    if (found) return found;
  }
  return null;
};

const responseData = (body) => body?.data ?? body?.result ?? body;

export const buildMotionPrompt = ({ narration = '', scenePrompt = '' }) => [
  'Animate this existing 2D historical illustration as a restrained cinematic image-to-video shot.',
  'Preserve the exact character identity, face, costume, proportions, colors, architecture, props, and composition from the source image.',
  'Do not redesign the character, add new people or objects, change the historical period, or introduce text, symbols, watermark, or camera cuts.',
  'Use only subtle natural motion: a slow camera push-in with gentle parallax, small cloth and water movement, and minimal believable background motion.',
  `Historical context and intended action: ${narration.trim() || 'preserve the scene action from the source image.'}`,
  scenePrompt.trim() ? `Source scene specification: ${scenePrompt.trim()}` : '',
].filter(Boolean).join('\n');

const authHeaders = () => {
  const key = process.env.VMEDIA_API_KEY;
  if (!key) throw new Error('Missing VMEDIA_API_KEY in .env');
  return {
    Authorization: `Bearer ${key}`,
  };
};

const uploadSceneImage = async (imagePath, log) => {
  const image = readFileSync(imagePath);
  const form = new FormData();
  form.append('domain', process.env.VMEDIA_DOMAIN ?? 'vmedia.ai');
  form.append('project_id', process.env.VMEDIA_PROJECT_ID ?? 'default');
  form.append('file', new Blob([image], { type: 'image/jpeg' }), imagePath.split('/').pop());
  log?.(`upload image: POST ${UPLOAD_URL}`);
  const response = await fetch(process.env.VMEDIA_UPLOAD_URL ?? UPLOAD_URL, { method: 'POST', headers: authHeaders(), body: form });
  const body = await response.json().catch(() => ({}));
  log?.(`upload response: HTTP ${response.status} ${JSON.stringify(body).slice(0, 500)}`);
  if (!response.ok) throw new Error(`VMedia image upload ${response.status}: ${JSON.stringify(body).slice(0, 700)}`);
  const url = firstUrl(body);
  if (!url) throw new Error(`VMedia image upload returned no public URL: ${JSON.stringify(body).slice(0, 700)}`);
  log?.(`image URL ready: ${url}`);
  return url;
};

const pollVideo = async (body, model, log) => {
  let url = firstUrl(body);
  const data = responseData(body);
  const id = data?.id_base ?? data?.id ?? data?.job_id ?? data?.task_id ?? body?.id_base ?? body?.id ?? body?.task_id;
  if (url) { log?.('create response already contains a video URL'); return url; }
  if (!id) throw new Error(`VMedia returned no video URL or job id: ${JSON.stringify(body).slice(0, 500)}`);
  log?.(`job accepted: ${id}`);
  for (let attempt = 0; attempt < 90; attempt++) {
    await wait(4000);
    const base = process.env.VMEDIA_STATUS_URL;
    const urls = base
      ? [`${base}/${encodeURIComponent(id)}`]
      : [`${STATUS_URL}/${encodeURIComponent(model)}/${encodeURIComponent(id)}`, `${STATUS_URL}/${encodeURIComponent(id)}`];
    let response;
    let next = {};
    for (const statusUrl of urls) {
      log?.(`poll ${attempt + 1}/90: ${statusUrl}`);
      response = await fetch(statusUrl, { headers: authHeaders() });
      next = await response.json().catch(() => ({}));
      if (response.ok) break;
    }
    if (!response?.ok) throw new Error(`VMedia status ${response?.status}: ${JSON.stringify(next).slice(0, 500)}`);
    const nextUrl = firstUrl(next);
    if (nextUrl) { log?.('job completed; video URL received'); return nextUrl; }
    const status = String(next?.status ?? next?.data?.status ?? '').toLowerCase();
    log?.(`job status: ${status || 'pending'}`);
    if (['failed', 'error', 'canceled'].includes(status)) throw new Error(`VMedia video job ${status}: ${JSON.stringify(next).slice(0, 500)}`);
  }
  throw new Error('VMedia video generation timed out after 6 minutes.');
};

export const generateSceneVideo = async ({ scene, imagePath, outputDir = 'public/scene-videos', prompt = '', onLog }) => {
  if (!existsSync(imagePath)) throw new Error(`Scene image not found: ${imagePath}`);
  const model = process.env.VMEDIA_VIDEO_MODEL;
  if (!model) throw new Error('Missing VMEDIA_VIDEO_MODEL in .env');
  const domain = process.env.VMEDIA_DOMAIN ?? 'vmedia.ai';
  const imageUrl = await uploadSceneImage(imagePath, onLog);
  const payload = {
    domain,
    project_id: process.env.VMEDIA_PROJECT_ID ?? 'default',
    image_url: imageUrl,
    ratio: process.env.VMEDIA_VIDEO_RATIO ?? '9:16',
    resolution: process.env.VMEDIA_VIDEO_RESOLUTION ?? '720p',
    duration: process.env.VMEDIA_VIDEO_DURATION ?? '5',
    mode: process.env.VMEDIA_VIDEO_MODE ?? 'relax',
    prompt: prompt || 'Subtle cinematic motion, preserve the historical illustration and character identity.',
  };
  const endpoint = process.env.VMEDIA_VIDEO_URL ?? `${API_URL}/${encodeURIComponent(model)}`;
  onLog?.(`POST ${endpoint}`);
  onLog?.(`payload: model=${model}, domain=${domain}, ratio=${payload.ratio}, resolution=${payload.resolution}, duration=${payload.duration}, mode=${payload.mode}`);
  const response = await fetch(endpoint, { method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const body = await response.json().catch(() => ({}));
  onLog?.(`create response: HTTP ${response.status} ${JSON.stringify(body).slice(0, 500)}`);
  if (!response.ok) throw new Error(`VMedia create video ${response.status}: ${JSON.stringify(body).slice(0, 700)}`);
  const videoUrl = await pollVideo(body, model, onLog);
  const output = join(outputDir, `scene-${String(scene).padStart(2, '0')}.mp4`);
  mkdirSync(outputDir, { recursive: true });
  const videoResponse = await fetch(videoUrl);
  onLog?.(`download result: HTTP ${videoResponse.status}`);
  if (!videoResponse.ok) throw new Error(`VMedia video download ${videoResponse.status}`);
  writeFileSync(output, Buffer.from(await videoResponse.arrayBuffer()));
  onLog?.(`saved: ${output}`);
  return { output, model, videoUrl };
};
