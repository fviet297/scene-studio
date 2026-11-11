import type { SceneState } from "./types.ts";

export const sceneLabel = (scene: SceneState): string =>
  scene.shotOf ? `Shot ${scene.shotIndex}/${scene.shotCount} của scene ${scene.shotOf}` : `Scene ${scene.scene}`;

export const seconds = (value: number): string => `${value.toFixed(1)} giây`;

/**
 * The review server can downscale on request (`?w=`), which is the difference between 59 clips
 * pulling 534 ms originals and 40 ms thumbnails. The version query is kept, the width is added.
 */
export const thumbUrl = (url: string | null, width: number): string | null =>
  url ? `${url}${url.includes("?") ? "&" : "?"}w=${width}` : null;
