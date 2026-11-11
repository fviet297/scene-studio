import { useState } from "react";
import type { SceneState, StudioState } from "../types.ts";
import { thumbUrl } from "../labels.ts";
import type { Studio } from "../useStudio.ts";

interface Props {
  studio: Studio;
  state: StudioState;
  selected: number;
  onSelect: (scene: number) => void;
  checked: number[];
  onToggle: (scene: number) => void;
}

const Dots = ({ scene }: { scene: SceneState }) => (
  <span
    className="dots"
    aria-label={`Ảnh ${scene.hasImage ? "có" : "thiếu"}, audio ${scene.hasAudio ? "có" : "thiếu"}, motion ${scene.hasMotionVideo ? "có" : "thiếu"}`}
  >
    <i data-tone="image" data-on={scene.hasImage} />
    {scene.shotOf ? null : <i data-tone="audio" data-on={scene.hasAudio} />}
    <i data-tone="motion" data-on={scene.hasMotionVideo} />
  </span>
);

const SceneItem = ({
  scene,
  active,
  checked,
  onSelect,
  onToggle,
}: {
  scene: SceneState;
  active: boolean;
  checked: boolean;
  onSelect: () => void;
  onToggle: () => void;
}) => (
  <li className={scene.shotOf ? "is-shot" : undefined}>
    <div className="rail-row">
      <input
        type="checkbox"
        className="rail-check"
        checked={checked}
        aria-label={`Chọn scene ${scene.scene} cho thao tác hàng loạt`}
        onChange={onToggle}
        onClick={(event) => event.stopPropagation()}
      />
      <button type="button" className="scene-item" aria-current={active} onClick={onSelect}>
        <span className="scene-thumb">
          {scene.imageUrl ? <img src={thumbUrl(scene.imageUrl, 120) ?? scene.imageUrl} alt="" loading="lazy" /> : <span className="blank">trống</span>}
        </span>
        <span className="scene-text">
          <span className="scene-head">
            <b>{scene.shotOf ? `Shot ${scene.shotIndex}/${scene.shotCount}` : `Scene ${scene.scene}`}</b>
            <Dots scene={scene} />
          </span>
          <span className="scene-snippet">
            {scene.shotOf ? `dùng lời dẫn scene ${scene.shotOf}` : scene.narration || "Chưa có lời dẫn"}
          </span>
        </span>
      </button>
    </div>
  </li>
);

export const SceneRail = ({ studio, state, selected, onSelect, checked, onToggle }: Props) => {
  const [filter, setFilter] = useState("");
  const scenes = state.scenes;
  const current = scenes.find((scene) => scene.scene === selected);
  const needle = filter.trim().toLowerCase();
  const visible = needle
    ? scenes.filter(
        (scene) =>
          String(scene.scene) === needle ||
          scene.narration.toLowerCase().includes(needle) ||
          scene.title.toLowerCase().includes(needle),
      )
    : scenes;

  /** A new scene goes below the selection and takes a narration of its own. */
  const addScene = () => {
    void studio.actions.insertScene(selected + 1, "Lời dẫn mới");
  };

  /** A shot is a scene without narration: it plays on under the narration above it (D10). */
  const addShot = () => {
    if (!current) return;
    const head = current.shotOf ?? current.scene;
    const group = scenes.filter((scene) => scene.scene === head || scene.shotOf === head);
    const end = group[group.length - 1].scene;
    void studio.actions.insertScene(end + 1, "", current.characters.join(", "));
  };

  const remove = () => {
    if (!current) return;
    const ok = window.confirm(
      `Xoá scene ${current.scene}? Ảnh, audio và motion của nó được chuyển vào tmp/deleted-scenes, các scene sau lùi lên một số.`,
    );
    if (ok) void studio.actions.deleteScene(current.scene);
  };

  return (
    <aside className="rail" aria-label="Danh sách scene">
      <div className="rail-tools">
        <button type="button" className="btn sm" onClick={addScene} title="Chèn scene có lời dẫn riêng ngay dưới scene đang chọn">
          Thêm scene
        </button>
        <button type="button" className="btn sm" onClick={addShot} title="Thêm shot dùng chung lời dẫn của scene đang chọn">
          Thêm shot
        </button>
        <button type="button" className="btn sm quiet" onClick={remove} title="Xoá scene đang chọn">
          Xoá
        </button>
      </div>
      <div className="rail-tools">
        <input
          className="rail-filter"
          type="text"
          value={filter}
          placeholder="Lọc scene hoặc narration…"
          aria-label="Lọc scene"
          onChange={(event) => setFilter(event.target.value)}
        />
      </div>
      <ol className="scene-list">
        {visible.map((scene) => (
          <SceneItem
            key={scene.scene}
            scene={scene}
            active={scene.scene === selected}
            checked={checked.includes(scene.scene)}
            onSelect={() => onSelect(scene.scene)}
            onToggle={() => onToggle(scene.scene)}
          />
        ))}
      </ol>
    </aside>
  );
};
