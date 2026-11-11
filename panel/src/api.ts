import type {
  BrandAssets,
  Branding,
  CharacterLibraryItem,
  Job,
  MediaSyncState,
  ModelConfig,
  NotificationItem,
  OutputLibrary,
  ServiceInfo,
  SocialPost,
  StudioState,
  TemplateState,
  ThumbnailIdeas,
} from "./types.ts";

const JSON_HEADERS = { "Content-Type": "application/json" };

const readError = async (res: Response): Promise<string> => {
  const text = await res.text().catch(() => "");
  if (!text) return res.statusText || `HTTP ${res.status}`;
  try {
    const body = JSON.parse(text) as { error?: string };
    return body.error ?? text;
  } catch {
    return text;
  }
};

const request = async <T>(path: string, body?: unknown): Promise<T> => {
  const res = await fetch(path, body === undefined ? {} : { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as T;
};

/** Server-sent events arrive as `event: <name>\ndata: <json>\n\n` frames. */
const parseFrame = (frame: string): { event: string; data: unknown } | null => {
  let event = "message";
  const data: string[] = [];
  for (const line of frame.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) data.push(line.slice(5).trim());
  }
  if (!data.length) return null;
  const raw = data.join("\n");
  try {
    return { event, data: JSON.parse(raw) };
  } catch {
    return { event, data: raw };
  }
};

export interface StreamHandlers {
  onLog?: (line: string) => void;
  onProgress?: (value: unknown) => void;
}

export interface VoiceChoice {
  name: string;
  label?: string;
}

export interface VoicesResponse {
  voices: VoiceChoice[];
  defaultVoice: string;
  audioSource: string;
}

export interface ScenePatch {
  scene: number;
  narration?: string;
  cue?: string;
  beat?: string;
  prompt?: string;
  prompt_vi?: string;
  camera?: string;
  action?: string;
  env?: string;
  motion?: string;
  char?: string;
}

/**
 * Long jobs stream as SSE: log lines while they run, then exactly one `done` or `error`.
 * Resolves with the `done` payload; throws with the `error` message.
 */
const stream = async (path: string, body: unknown, handlers: StreamHandlers = {}): Promise<unknown> => {
  const res = await fetch(path, { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(await readError(res));
  if (!res.body) throw new Error("server không trả về luồng dữ liệu");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let done: unknown;
  let failure: string | null = null;

  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) break;
    buffer += decoder.decode(chunk.value, { stream: true });
    let cut = buffer.indexOf("\n\n");
    while (cut !== -1) {
      const frame = parseFrame(buffer.slice(0, cut));
      buffer = buffer.slice(cut + 2);
      cut = buffer.indexOf("\n\n");
      if (!frame) continue;
      if (frame.event === "log") handlers.onLog?.(String(frame.data));
      else if (frame.event === "progress") handlers.onProgress?.(frame.data);
      else if (frame.event === "done") done = frame.data;
      else if (frame.event === "error") failure = String(frame.data);
    }
  }
  if (failure) throw new Error(failure);
  return done;
};

export const api = {
  state: () => request<StudioState>("/api/state"),
  projects: () => request<{ projects: { slug: string; title: string }[] }>("/api/projects"),
  openProject: (slug: string) => request<StudioState>("/api/project", { slug }),
  sceneField: (scene: number, field: string, value: string) => request<StudioState>("/api/scene-field", { scene, field, value }),
  narration: (scene: number, narration: string) =>
    request<{ ok: boolean; scene: number; narration: string; audioStale: boolean }>("/api/narration", { scene, narration }),
  prompt: (scene: number, prompt: string) => request<{ ok: boolean; scene: number; prompt: string }>("/api/prompt", { scene, prompt }),
  aspect: (aspect: string) => request<StudioState>("/api/project-aspect", { aspect }),
  motionDuration: (value: string) => request<StudioState>("/api/project-motion-duration", { value }),
  projectVoice: (voice: string) => request<unknown>("/api/project-voice", { voice }),

  insertScene: (at: number, narration = "", char?: string) =>
    request<StudioState>("/api/insert-scene", { at, narration, ...(char ? { char } : {}) }),
  deleteScene: (scene: number) => request<StudioState>("/api/delete-scene", { scene }),
  undo: (scene: number, kind: string) => request<StudioState>("/api/undo", { scene, kind }),
  redo: (scene: number, kind: string) => request<StudioState>("/api/redo", { scene, kind }),

  jobs: () => request<{ jobs: Job[] }>("/api/jobs"),
  cancel: (id: string) => request<{ ok: boolean }>("/api/cancel", { id }),
  services: () => request<{ services: ServiceInfo[] }>("/api/services"),
  service: (id: string, action: "start" | "stop" | "restart") =>
    request<ServiceInfo>(`/api/services/${action}`, { id }),

  generateImage: (scene: number, model: string | undefined, handlers: StreamHandlers) =>
    stream("/api/generate", { scene, model }, handlers),
  generateImagesBatch: (scenes: number[], model: string | undefined, handlers: StreamHandlers) =>
    stream("/api/generate-batch", { scenes, model }, handlers),
  generateMotion: (scene: number, model: string | undefined, handlers: StreamHandlers) =>
    stream("/api/generate-motion-video", { scene, model }, handlers),
  generateMotionsBatch: (scenes: number[], model: string | undefined, handlers: StreamHandlers) =>
    stream("/api/generate-motion-videos-batch", { scenes, model }, handlers),
  generateAudio: (scene: number, handlers: StreamHandlers) => stream("/api/audio", { scene }, handlers),
  generateAudioBatch: (scenes: number[], handlers: StreamHandlers) => stream("/api/audio-batch", { scenes }, handlers),
  generatePromptsBatch: (scenes: number[], handlers: StreamHandlers) =>
    stream("/api/generate-prompts-batch", { scenes }, handlers),
  generateMotionPromptsBatch: (scenes: number[], handlers: StreamHandlers) =>
    stream("/api/generate-motion-prompts-batch", { scenes }, handlers),
  scenesUpdate: (rows: ScenePatch[]) =>
    request<{ ok: boolean; updated: number[]; appended: number[] }>("/api/scenes-update", { scenes: rows }),
  mergeScenes: (scenes: number[], keep: number) =>
    request<StudioState>("/api/merge-scenes", { scenes, keep }),

  audioSources: () => request<{ current: string; sources: { id: string; label: string }[] }>("/api/audio-sources"),
  voices: (source?: string) =>
    request<VoicesResponse>(`/api/voices${source ? `?source=${encodeURIComponent(source)}` : ""}`),
  setVoice: (body: { voice?: string; source?: string }) => request<StudioState>("/api/project-voice", body),
  removeMotion: (scene: number) => request<StudioState>("/api/remove-motion-video", { scene }),

  templates: () => request<{ templates: TemplateState; activeVersion: string; versions: string[] }>("/api/templates"),
  saveTemplates: (body: Record<string, unknown>) =>
    request<{ ok: boolean; templates: TemplateState }>("/api/templates", body),
  activateTemplate: (version: string) =>
    request<{ ok: boolean; templates: TemplateState }>("/api/templates/activate", { version }),

  branding: () => request<{ branding: Branding; assets: BrandAssets }>("/api/branding"),
  saveBranding: (patch: Record<string, unknown>) =>
    request<{ branding: Branding }>("/api/branding", patch),
  uploadBrandLogo: async (file: File) => rawUpload<{ branding: Branding; assets: BrandAssets }>("/api/brand-logo", file),
  resetBrandLogo: () => request<{ branding: Branding; assets: BrandAssets }>("/api/brand-logo-reset", {}),
  uploadBrandIntro: async (file: File) => rawUpload<{ branding: Branding; assets: BrandAssets }>("/api/brand-intro", file),
  resetBrandIntro: () => request<{ branding: Branding; assets: BrandAssets }>("/api/brand-intro-reset", {}),

  modelConfig: () => request<ModelConfig>("/api/model-config"),
  modelAction: (action: string, body: Record<string, unknown>) =>
    request<ModelConfig>(`/api/model-config/${action}`, body),

  characterLibrary: () => request<{ characters: CharacterLibraryItem[] }>("/api/character-library"),
  characterCreate: (id: string, name: string) => request<StudioState>("/api/character-create", { id, name }),
  characterImport: (body: { project: string; sourceId: string; id: string; name: string; replace?: boolean }) =>
    request<StudioState>("/api/character-import", body),
  characterProfile: (id: string) => request<{ id: string; profile: Record<string, unknown> }>(`/api/character-profile?id=${encodeURIComponent(id)}`),
  characterSaveProfile: (id: string, patch: Record<string, unknown>) =>
    request<StudioState>("/api/character-profile", { id, patch }),
  characterSuggest: (id: string, current: Record<string, unknown>) =>
    request<{ id: string; suggestion: Record<string, unknown> }>("/api/character-suggest", { id, current }),
  characterGenerate: (id: string, model: string, description: string, source?: string, handlers?: StreamHandlers) =>
    stream("/api/character-generate", { id, model, description, source }, handlers ?? {}),
  characterApply: (id: string, from?: "draft" | "source") => request<StudioState>("/api/character-apply", { id, from }),
  characterUpload: async (id: string, file: File) => rawUpload<StudioState>(`/api/character-upload?id=${encodeURIComponent(id)}`, file),

  outputs: () => request<OutputLibrary>("/api/outputs"),
  setOutputDir: (dir: string) => request<OutputLibrary>("/api/output-dir", { dir }),

  mediaSync: () => request<MediaSyncState>("/api/media-sync"),
  setMediaSource: (dir: string) => request<MediaSyncState>("/api/media-source", { dir }),
  runMediaSync: (projects: string[]) => stream("/api/media-sync", { projects }, {}),

  notifications: () => request<{ items: NotificationItem[] }>("/api/notifications"),
  clearNotifications: () => request<{ items: NotificationItem[] }>("/api/notifications-clear", {}),

  scriptGenerate: (body: Record<string, unknown>, handlers: StreamHandlers) => stream("/api/script-generate", body, handlers),
  projectCreate: (body: Record<string, unknown>) => request<StudioState>("/api/project-create", body),

  socialGenerate: (note: string) => request<{ slug: string; posts: Record<string, SocialPost> }>("/api/social-generate", { note }),
  thumbnailIdeas: (title: string) => request<ThumbnailIdeas>("/api/thumbnail-ideas", { title }),
  thumbnailBackgrounds: () => request<{ items: { file: string; url: string }[] }>("/api/thumbnail-backgrounds"),
  thumbnailGenerate: (body: { model: string; prompt: string; chars: string[]; side: string }, handlers: StreamHandlers) =>
    stream("/api/thumbnail-generate", body, handlers),
  thumbnailLettering: (body: { model: string; image: string; kicker: string; lines: string[]; styleHint: string; side: string }, handlers: StreamHandlers) =>
    stream("/api/thumbnail-lettering", body, handlers),
  render: (format: "wide" | "vertical", handlers: StreamHandlers) =>
    stream("/api/finalize", { format }, handlers),

  uploadImage: async (scene: number, file: File): Promise<StudioState> => {
    const res = await fetch(`/api/upload?scene=${scene}`, {
      method: "POST",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: file,
    });
    if (!res.ok) throw new Error(await readError(res));
    return (await res.json()) as StudioState;
  },
  uploadMotion: async (scene: number, file: File): Promise<StudioState> => {
    const res = await fetch(`/api/upload-motion-video?scene=${scene}`, {
      method: "POST",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: file,
    });
    if (!res.ok) throw new Error(await readError(res));
    return (await res.json()) as StudioState;
  },
};

/** Raw-body upload (branding logo/intro, character reference) — no JSON envelope. */
const rawUpload = async <T>(path: string, file: File): Promise<T> => {
  const res = await fetch(path, { method: "POST", headers: { "Content-Type": file.type || "application/octet-stream" }, body: file });
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as T;
};
