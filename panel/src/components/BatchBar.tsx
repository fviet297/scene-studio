import type { StudioState } from "../types.ts";
import type { Studio } from "../useStudio.ts";

interface Props {
  studio: Studio;
  state: StudioState;
  checked: number[];
  onClear: () => void;
  onSelect: (scenes: number[]) => void;
}

/** Batch actions apply to the ticked scenes only; every button states how many it would run on. */
export const BatchBar = ({ studio, state, checked, onClear, onSelect }: Props) => {
  const picked = new Set(checked);
  const scenes = state.scenes.filter((scene) => picked.has(scene.scene));
  const narrations = scenes.filter((scene) => !scene.shotOf && scene.narration.trim());
  const withPrompt = scenes.filter((scene) => scene.prompt.trim() || scene.isMap);
  const withImage = scenes.filter((scene) => scene.hasImage);
  const images = scenes.filter((scene) => scene.isMap || scene.prompt.trim());
  const canMerge = checked.length >= 2 && isAdjacent([...checked].sort((a, b) => a - b));

  const model = state.imageModels[0]?.id;
  const motionModel = state.motionVideoModels[0]?.id;

  const merge = () => {
    const list = [...checked].sort((a, b) => a - b);
    const keep = list[0];
    const ok = window.confirm(
      `Gộp scene ${list.join(", ")} thành scene ${keep}? Narration được nối lại, scene ${keep} giữ prompt/nhân vật, media của các scene bị gộp chuyển vào tmp/deleted-scenes.`,
    );
    if (ok) void studio.actions.mergeScenes(list, keep);
  };

  const quickSelect = (kind: string) => {
    const matches = (scene: StudioState["scenes"][number]): boolean => {
      switch (kind) {
        case "all": return true;
        case "needImg": return scene.kind === "ai" && !scene.hasImage && !scene.isMap;
        case "map": return scene.isMap;
        case "needAud": return !scene.hasAudio;
        case "staleAud": return scene.audioStale;
        case "needPrompt": return scene.kind === "ai" && !scene.isMap && !scene.prompt.trim();
        case "needMotion": return scene.hasImage && scene.hasAudio && !scene.hasMotionVideo;
        default: return false;
      }
    };
    onSelect(state.scenes.filter(matches).map((scene) => scene.scene));
  };

  return (
    <div className="batchbar" role="region" aria-label="Thao tác hàng loạt">
      <span className="batch-info">
        <b>{checked.length}</b> scene chọn
      </span>
      <select
        className="quick-select"
        aria-label="Chọn nhanh scene theo điều kiện"
        defaultValue=""
        onChange={(event) => {
          if (event.target.value) quickSelect(event.target.value);
          event.target.value = "";
        }}
      >
        <option value="" disabled>
          Chọn nhanh…
        </option>
        <option value="all">Tất cả</option>
        <option value="needImg">Thiếu ảnh</option>
        <option value="map">Scene bản đồ</option>
        <option value="needAud">Thiếu audio</option>
        <option value="staleAud">Audio cũ</option>
        <option value="needPrompt">Thiếu prompt</option>
        <option value="needMotion">Thiếu motion</option>
      </select>
      <button type="button" className="btn sm quiet" onClick={onClear}>
        Bỏ chọn
      </button>
      <span className="bar-sep" />
      <button type="button" className="btn sm" disabled={!narrations.length} onClick={() => void studio.actions.generatePromptsBatch(narrations.map((s) => s.scene))}>
        Viết prompt ảnh{narrations.length ? ` (${narrations.length})` : ""}
      </button>
      <button type="button" className="btn sm" disabled={!narrations.length} onClick={() => void studio.actions.generateMotionPromptsBatch(narrations.map((s) => s.scene))}>
        Viết prompt motion{narrations.length ? ` (${narrations.length})` : ""}
      </button>
      <span className="bar-sep" />
      <button type="button" className="btn sm" disabled={!images.length} onClick={() => void studio.actions.generateImagesBatch(images.map((s) => s.scene), model)}>
        Sinh ảnh{images.length ? ` (${images.length})` : ""}
      </button>
      <button type="button" className="btn sm" disabled={!narrations.length} onClick={() => void studio.actions.generateAudioBatch(narrations.map((s) => s.scene))}>
        Sinh audio{narrations.length ? ` (${narrations.length})` : ""}
      </button>
      <button type="button" className="btn sm" disabled={!withImage.length} title="Motion cần ảnh trước" onClick={() => void studio.actions.generateMotionsBatch(withImage.map((s) => s.scene), motionModel)}>
        Sinh motion{withImage.length ? ` (${withImage.length})` : ""}
      </button>
      <span className="bar-sep" />
      <button type="button" className="btn sm" disabled={!canMerge} title={canMerge ? undefined : "chỉ gộp được các scene liền kề"} onClick={merge}>
        Gộp đã chọn
      </button>
      <button type="button" className="btn sm quiet" onClick={onClear}>
        Bỏ chọn
      </button>
      <span className="grow" />
      <span className="batch-hint">
        prompt có sẵn: {withPrompt.length}/{scenes.length}
      </span>
    </div>
  );
};

const isAdjacent = (list: number[]): boolean => list.every((value, index) => index === 0 || value === list[index - 1] + 1);
