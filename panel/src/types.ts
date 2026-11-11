/** Shapes of the review server's `/api/state` payload (scripts/review-server.mjs buildState). */

export interface SceneState {
  scene: number;
  narration: string;
  title: string;
  cue: string;
  host: string;
  duration: number | null;
  kind: string;
  source: string;
  prompt: string;
  promptVi: string;
  isMap: boolean;
  map: string;
  beat: string;
  motionPrompt: string;
  camera: string;
  action: string;
  env: string;
  motion: string;
  query: string;
  characters: string[];
  hasImage: boolean;
  imageUrl: string | null;
  hasAudio: boolean;
  audioStale: boolean;
  audioUrl: string | null;
  shotOf: number | null;
  shotIndex: number;
  shotCount: number;
  hasMotionVideo: boolean;
  motionStale: boolean;
  motionVideoUrl: string | null;
  promptFullChars: number;
  promptOverhead: number;
  history: Record<"image" | "audio" | "motion", { undo: number; redo: number }>;
}

export interface CharacterRef {
  id: string;
  name: string;
  refUrl: string | null;
  puppetUrl: string | null;
  scenes: number[];
}

export interface ProjectMeta {
  slug: string;
  title: string;
  aspect: string;
  template: string;
  templateVersions: string[];
  audioSource: string;
  voice: string;
  motionDuration: number | null;
}

export interface ModelOption {
  id: string;
  label: string;
  price?: string;
}

export interface ProjectSummary {
  slug: string;
  title: string;
}

export interface StudioState {
  title: string;
  project: ProjectMeta;
  branding: unknown;
  imageModels: ModelOption[];
  motionVideoModels: ModelOption[];
  seedreamPromptLimit: number;
  projects: ProjectSummary[];
  scenes: SceneState[];
  characters: Record<string, unknown>;
  characterList: CharacterRef[];
}

export interface Job {
  id: string;
  label: string;
  kind: string;
  scenes: number[];
  done: number[];
  lastLog: string;
  startedAt: number;
}

export interface ServiceInfo {
  id: string;
  label: string;
  url: string;
  installed: boolean;
  managed: boolean;
  state: string;
  log?: string;
}

export type SseEvent = { event: string; data: unknown };

export interface Branding {
  name: string;
  logo: { enabled: boolean; position: string; anchor: string; opacity: number; margin: number; size: number; textSize: number; logoSrc?: string };
  watermark: { enabled: boolean; opacity: number };
  intro: { enabled: boolean; padSeconds: number };
  captions: Record<string, unknown>;
  title: Record<string, unknown>;
}

export interface BrandAssets {
  logo: { custom: boolean };
  intro: { url: string; seconds: number; width: number; height: number; orientationMismatch?: boolean } | null;
}

export interface TemplateState {
  styleDna: string;
  guard: string;
  masterPrompt: string;
  faceLockPrompt: string;
  multiCharPrompt: string;
  text2img: string;
  mapPrompt: string;
  motionSystem: string;
  activeVersion: string;
  versions: string[];
}

export interface ProviderField {
  name: string;
  secret: boolean;
  set: boolean;
  source: string | null;
  value?: string;
  masked?: string;
  placeholder?: string;
}

export interface ProviderInfo {
  id: string;
  label: string;
  builtin: boolean;
  kinds: string[];
  role?: string;
  fields: ProviderField[];
}

export interface ModelInfo {
  id: string;
  kind: string;
  label: string;
  price: string | null;
  provider: string;
  builtin: boolean;
  hidden: boolean;
}

export interface ModelConfig {
  providers: ProviderInfo[];
  models: ModelInfo[];
}

export interface CharacterLibraryItem {
  project: string;
  projectTitle: string;
  id: string;
  name: string;
  aliases: string[];
  imageUrl: string;
  updatedAt: number;
}

export interface OutputVideo {
  name: string;
  slug: string;
  vertical: boolean;
  aspect: string;
  size: number;
  mtimeMs: number;
  title: string;
  active: boolean;
  url: string;
}

export interface OutputLibrary {
  dir: string;
  defaultDir: string;
  videos: OutputVideo[];
}

export interface MediaSyncProject {
  slug: string;
  local: boolean;
  active: boolean;
}

export interface MediaSyncState {
  source: string;
  projects: MediaSyncProject[];
}

export interface NotificationItem {
  id: string;
  message: string;
  [key: string]: unknown;
}

export interface SocialPost {
  title: string;
  description: string;
  hashtags: string[];
  titleLimit: number;
  titleOptions?: { title: string; score: number; reason: string }[];
  pickReason?: string;
  keywords?: { group: string; words: string[] }[];
}

export interface ThumbnailConcept {
  id: string;
  headline: string;
  chars: string[];
  prompt: string;
}

export interface ThumbnailIdeas {
  headlines: string[];
  chars: string[];
  prompt: string;
  concepts: ThumbnailConcept[];
  recommended: string;
}

