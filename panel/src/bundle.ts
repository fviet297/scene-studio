/** The built Remotion data in src/projects-data/<slug>.json — what the render actually plays. */
export interface BundleScene {
  scene: number;
  narration: string;
  shotOf?: number;
  shotIndex?: number;
  shotCount?: number;
  hasAudio?: boolean;
  image?: { kind?: string; prompt?: string };
}

export interface Bundle {
  slug: string;
  title: string;
  aspect: string;
  width: number;
  height: number;
  fps: number;
  durationInFrames: number;
  introFrames?: number;
  introPadFrames?: number;
  scenes: BundleScene[];
  sceneDurations: number[];
}

/** The intro plays before scene 1; scene time in the timeline is shifted by these frames. */
export const introOffset = (bundle: Bundle): number => (bundle.introFrames ?? 0) + (bundle.introPadFrames ?? 0);

export interface Clip {
  scene: number;
  start: number;
  frames: number;
  isShot: boolean;
}

/** Scene → frame range, laid out exactly like the render (rounded per scene, intro shifted). */
export const clipsOf = (bundle: Bundle): Clip[] => {
  let start = introOffset(bundle);
  return bundle.scenes.map((scene, index) => {
    const frames = Math.max(1, Math.round((bundle.sceneDurations[index] ?? 0) * bundle.fps));
    const clip = { scene: scene.scene, start, frames, isShot: Boolean(scene.shotOf) };
    start += frames;
    return clip;
  });
};

export const sceneStartFrame = (bundle: Bundle, scene: number): number =>
  clipsOf(bundle).find((clip) => clip.scene === scene)?.start ?? introOffset(bundle);

export const loadBundle = async (): Promise<Bundle | null> => {
  const res = await fetch("/api/bundle");
  if (res.ok) return (await res.json()) as Bundle;
  // No bundle on disk yet: this path rebuilds it first, so it is slow but only runs once.
  const rebuilt = await fetch("/api/preview-data");
  if (!rebuilt.ok) return null;
  const body = (await rebuilt.json()) as { project?: Bundle };
  return body.project ?? null;
};
