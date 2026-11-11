import { useEffect, useRef } from "react";
import { clipsOf, introOffset, type Bundle } from "../bundle.ts";
import { thumbUrl } from "../labels.ts";
import { loadPreview } from "../preview-player.ts";
import type { StudioState } from "../types.ts";

interface Props {
  bundle: Bundle;
  state: StudioState;
  selected: number;
  onSelect: (scene: number) => void;
}

const clock = (frames: number, fps: number): string => {
  const total = Math.round(frames / fps);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};

/**
 * Clip widths are flex-grow = frames, so they are exactly proportional and the playhead can be a
 * plain percentage. Frame updates move the playhead through refs: a scrub must not re-render the
 * panel thirty times a second.
 */
export const Timeline = ({ bundle, state, selected, onSelect }: Props) => {
  const playhead = useRef<HTMLDivElement>(null);
  const time = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let instance: Awaited<ReturnType<typeof loadPreview>> = null;
    let cancelled = false;
    const show = (frame: number) => {
      if (playhead.current) playhead.current.style.left = `${(frame / bundle.durationInFrames) * 100}%`;
      if (time.current) time.current.textContent = clock(frame, bundle.fps);
    };
    void loadPreview().then((preview) => {
      if (cancelled || !preview) return;
      instance = preview;
      preview.on("frameupdate", show);
      show(0);
    });
    return () => {
      cancelled = true;
      instance?.off("frameupdate", show);
    };
  }, [bundle]);

  const clips = clipsOf(bundle);
  const introFrames = introOffset(bundle);
  // Scene selection parks the player after the intro, so this is the only way to watch it.
  const playIntro = () => {
    window.scenePreview?.seekTo(0);
    window.scenePreview?.play();
  };
  const byNumber = new Map(state.scenes.map((scene) => [scene.scene, scene]));

  return (
    <section className="timeline" aria-label="Timeline">
      <div className="timeline-meta">
        <span ref={time}>0:00</span>
        <span className="timeline-total">/ {clock(bundle.durationInFrames, bundle.fps)}</span>
      </div>
      <div className="timeline-track">
        {introFrames > 0 ? (
          <button
            type="button"
            className="clip clip-intro"
            style={{ flexGrow: introFrames }}
            data-kind="intro"
            onClick={playIntro}
            title={`Intro · ${(introFrames / bundle.fps).toFixed(1)} giây (gồm đoạn nghỉ trước scene 1) — bấm để xem từ đầu`}
          >
            <span className="clip-number">Intro</span>
          </button>
        ) : null}
        {clips.map((clip) => {
          const scene = byNumber.get(clip.scene);
          const motion = Boolean(scene?.hasMotionVideo);
          return (
            <button
              key={clip.scene}
              type="button"
              className="clip"
              style={{ flexGrow: clip.frames }}
              data-kind={motion ? "motion" : scene?.hasImage ? "image" : "empty"}
              data-shot={clip.isShot}
              aria-current={clip.scene === selected}
              onClick={() => onSelect(clip.scene)}
              title={`Scene ${clip.scene} · ${(clip.frames / bundle.fps).toFixed(1)} giây`}
            >
              {scene?.imageUrl ? <img src={thumbUrl(scene.imageUrl, 220) ?? scene.imageUrl} alt="" loading="lazy" /> : null}
              <span className="clip-number">{clip.scene}</span>
            </button>
          );
        })}
        <div className="playhead" ref={playhead} aria-hidden="true" />
      </div>
    </section>
  );
};
