import type { Bundle } from "./bundle.ts";

export type PreviewEvent = "frameupdate" | "play" | "pause" | "ended";

export interface ScenePreview {
  mount(host: HTMLElement, project: unknown, options?: { controls?: boolean }): void;
  unmount(): void;
  play(): void;
  pause(): void;
  seekTo(frame: number): void;
  setMuted(muted: boolean): void;
  isPlaying(): boolean;
  on(event: PreviewEvent, handler: (frame: number) => void): void;
  off(event: PreviewEvent, handler: (frame: number) => void): void;
}

declare global {
  interface Window {
    scenePreview?: ScenePreview;
  }
}

let script: Promise<ScenePreview | null> | null = null;

/**
 * The review server bundles the real Remotion composition at /preview.js (an IIFE that fills
 * window.scenePreview); loading it once is enough for the whole page.
 */
export const loadPreview = (): Promise<ScenePreview | null> => {
  if (window.scenePreview) return Promise.resolve(window.scenePreview);
  script ??= new Promise((resolve) => {
    const element = document.createElement("script");
    element.src = "/preview.js";
    element.onload = () => resolve(window.scenePreview ?? null);
    element.onerror = () => resolve(null);
    document.head.append(element);
  });
  return script;
};

export const mountPreview = async (
  host: HTMLElement,
  bundle: Bundle,
  options: { controls?: boolean } = {},
): Promise<ScenePreview | null> => {
  const preview = await loadPreview();
  if (!preview) return null;
  preview.mount(host, bundle, options);
  return preview;
};
