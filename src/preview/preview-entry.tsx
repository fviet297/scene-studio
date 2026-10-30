// Browser entry for the review panel's "as rendered" preview: the exact ScenePlanVideo composition
// the MP4 render uses, played by @remotion/player. Bundled on demand by the review server
// (scripts/lib/preview-bundle.mjs) and driven from scripts/review-timeline.js via
// window.scenePreview, so the panel needs no bundler of its own.
import { createRoot, type Root } from "react-dom/client";
import { Player, type PlayerRef } from "@remotion/player";
import { ScenePlanVideo, type ProjectData } from "../ScenePlanVideo";

declare global {
  interface Window {
    scenePreview?: ScenePreview;
  }
}

// staticFile("projects/<slug>/…") resolves under this prefix; the review server maps it to public/.
window.remotion_staticBase = "/public";

type PreviewEvent = "frameupdate" | "play" | "pause" | "ended";

interface ScenePreview {
  mount(host: HTMLElement, project: ProjectData): void;
  unmount(): void;
  play(): void;
  pause(): void;
  seekTo(frame: number): void;
  setMuted(muted: boolean): void;
  isPlaying(): boolean;
  on(event: PreviewEvent, handler: (frame: number) => void): void;
}

let root: Root | null = null;
let player: PlayerRef | null = null;
// Kept here as well as on the player: a remount (mode switch, branding edit) builds a new Player.
let muted = false;
const handlers = new Map<PreviewEvent, Set<(frame: number) => void>>();

const emit = (event: PreviewEvent) => {
  const frame = player?.getCurrentFrame() ?? 0;
  for (const handler of handlers.get(event) ?? []) handler(frame);
};

const attach = (ref: PlayerRef | null) => {
  if (!ref || ref === player) return;
  player = ref;
  for (const event of ["frameupdate", "play", "pause", "ended"] as const)
    ref.addEventListener(event, () => emit(event));
};

window.scenePreview = {
  mount(host, project) {
    root ??= createRoot(host);
    root.render(
      <Player
        ref={attach}
        component={ScenePlanVideo}
        inputProps={{ project }}
        durationInFrames={Math.max(1, project.durationInFrames)}
        fps={project.fps}
        compositionWidth={project.width ?? 1080}
        compositionHeight={project.height ?? 1920}
        style={{ width: "100%", height: "100%" }}
        initiallyMuted={muted}
        acknowledgeRemotionLicense
      />,
    );
  },
  unmount() {
    root?.unmount();
    root = null;
    player = null;
  },
  play: () => player?.play(),
  pause: () => player?.pause(),
  seekTo: (frame) => player?.seekTo(frame),
  setMuted(value) {
    muted = value;
    if (value) player?.mute();
    else player?.unmute();
  },
  isPlaying: () => player?.isPlaying() ?? false,
  on(event, handler) {
    handlers.set(event, (handlers.get(event) ?? new Set()).add(handler));
  },
};
