import { useEffect, useRef, useState } from "react";
import { sceneStartFrame, type Bundle } from "../bundle.ts";
import type { SceneState } from "../types.ts";
import { mountPreview } from "../preview-player.ts";

interface Props {
  scene: SceneState;
  aspect: string;
  bundle: Bundle | null;
}

/**
 * The real Remotion composition in the middle of the panel. It is bundled by the review server
 * (`/preview.js`) rather than imported here, so the panel never needs its own Remotion build.
 */
export const Stage = ({ scene, aspect, bundle }: Props) => {
  const host = useRef<HTMLDivElement>(null);
  const [playerFailed, setPlayerFailed] = useState(false);
  const startFrame = bundle ? sceneStartFrame(bundle, scene.scene) : 0;

  useEffect(() => {
    if (!bundle || !host.current) return;
    let cancelled = false;
    const element = host.current;
    void mountPreview(element, bundle, { controls: true }).then((preview) => {
      if (cancelled) return;
      setPlayerFailed(!preview);
      preview?.pause();
      preview?.seekTo(startFrame);
    });
    return () => {
      cancelled = true;
      window.scenePreview?.pause();
    };
    // A new bundle remounts; the current selection is applied by the effect below.
  }, [bundle]);

  // Selecting a scene (click, j/k, timeline) parks the player on its first frame.
  useEffect(() => {
    if (bundle) window.scenePreview?.seekTo(startFrame);
  }, [bundle, startFrame]);

  return (
    <section className="stage" aria-label="Scene đang mở">
      <div className="stage-head">
        <b>{scene.shotOf ? `Shot ${scene.shotIndex}/${scene.shotCount} của scene ${scene.shotOf}` : `Scene ${scene.scene}`}</b>
        <span className="stage-kind">{scene.isMap ? "Bản đồ vẽ bằng code" : scene.source === "upload" ? "Tải lên" : "AI"}</span>
        {scene.characters.length ? <span>nhân vật: {scene.characters.join(", ")}</span> : null}
        <span className="grow" />
        {scene.hasMotionVideo ? <span>motion</span> : scene.hasImage ? <span>ảnh tĩnh</span> : <span>chưa có ảnh</span>}
      </div>

      <div className="stage-frame" data-aspect={aspect}>
        {bundle ? (
          <div className="preview-host" ref={host} />
        ) : scene.imageUrl ? (
          <img className="stage-media" src={scene.imageUrl} alt={scene.title || `Scene ${scene.scene}`} />
        ) : (
          <p className="stage-empty">
            Chưa build được bản xem trước. Sửa prompt ở cột phải rồi bấm <b>Sinh ảnh</b>, hoặc tải ảnh lên.
          </p>
        )}
      </div>

      {scene.audioStale || scene.motionStale || !scene.hasAudio || playerFailed || scene.title ? (
        <div className="stage-foot">
          {scene.audioStale ? <span className="tag-warn">audio cũ hơn lời dẫn</span> : null}
          {scene.motionStale ? <span className="tag-warn">motion cũ hơn ảnh</span> : null}
          {scene.hasAudio ? null : <span>chưa có audio</span>}
          <span className="grow" />
          {playerFailed ? <span className="tag-warn">chưa tải được player</span> : null}
          {scene.title ? <span title="Tiêu đề trên hình">{scene.title}</span> : null}
        </div>
      ) : null}
    </section>
  );
};
