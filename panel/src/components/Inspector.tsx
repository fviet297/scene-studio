import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { cropImage } from "../crop.tsx";
import type { SceneState, StudioState } from "../types.ts";
import type { Studio } from "../useStudio.ts";
import { sceneLabel, seconds } from "../labels.ts";

interface Props {
  studio: Studio;
  state: StudioState;
  scene: SceneState;
}

interface FieldProps {
  label: string;
  hint?: string;
  value: string;
  rows?: number;
  placeholder?: string;
  onCommit: (value: string) => void;
}

/** A field saves itself when focus leaves it (or on Cmd/Ctrl+Enter); there is no Save button to forget. */
const Field = ({ label, hint, value, rows, placeholder, onCommit }: FieldProps) => {
  const [draft, setDraft] = useState(value);
  const commit = () => {
    if (draft.trim() !== value.trim()) onCommit(draft);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey || !rows)) (event.target as HTMLElement).blur();
  };
  const shared = { value: draft, onBlur: commit, onKeyDown, spellCheck: false, placeholder };
  return (
    <label className="field">
      <span className="field-label">
        {label}
        {hint ? <span className="hint"> {hint}</span> : null}
      </span>
      {rows ? (
        <textarea rows={rows} {...shared} onChange={(event) => setDraft(event.target.value)} />
      ) : (
        <input type="text" {...shared} onChange={(event) => setDraft(event.target.value)} />
      )}
    </label>
  );
};

const ACCEPT: Record<"image" | "video", string> = {
  image: "image/jpeg,image/png,image/webp",
  video: "video/mp4",
};

interface SlotProps {
  tone: "image" | "audio" | "motion";
  label: string;
  status: string;
  has: boolean;
  children?: ReactNode;
}

const Slot = ({ tone, label, status, has, children }: SlotProps) => (
  <div className="slot" data-tone={tone} data-on={has}>
    <span className="slot-label">{label}</span>
    <span className="slot-status">{status}</span>
    {children ? <div className="slot-controls">{children}</div> : null}
  </div>
);

const UploadButton = ({
  kind,
  has,
  onPick,
}: {
  kind: "image" | "video";
  has: boolean;
  onPick: (file: File) => void;
}) => {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <button type="button" className="btn sm" onClick={() => input.current?.click()}>
        {has ? "Thay file" : "Tải lên"}
      </button>
      <input
        ref={input}
        type="file"
        accept={ACCEPT[kind]}
        hidden
        aria-label={`Chọn file ${kind === "image" ? "ảnh" : "video"}`}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onPick(file);
          event.target.value = "";
        }}
      />
    </>
  );
};

/** One scene keeps snapshots per media kind; the arrows are dead when that side is empty. */
const HistoryButtons = ({ studio, scene, kind }: { studio: Studio; scene: SceneState; kind: "image" | "audio" | "motion" }) => {
  const history = scene.history?.[kind];
  return (
    <span className="history">
      <button
        type="button"
        className="btn sm quiet"
        disabled={!history?.undo}
        title={`Hoàn tác ${kind} (${history?.undo ?? 0} bước)`}
        onClick={() => void studio.actions.undo(scene.scene, kind)}
      >
        ↶
      </button>
      <button
        type="button"
        className="btn sm quiet"
        disabled={!history?.redo}
        title={`Làm lại ${kind} (${history?.redo ?? 0} bước)`}
        onClick={() => void studio.actions.redo(scene.scene, kind)}
      >
        ↷
      </button>
    </span>
  );
};

export const Inspector = ({ studio, state, scene }: Props) => {
  const n = scene.scene;
  const [imageModel, setImageModel] = useState(state.imageModels[0]?.id ?? "");
  const [motionModel, setMotionModel] = useState(state.motionVideoModels[0]?.id ?? "");
  const jobRunning = studio.jobs.some((job) => job.scenes.includes(n));
  const save = (field: string) => (value: string) => void studio.actions.saveField(n, field, value);

  const uploadSceneImage = async (file: File) => {
    const [w, h] = String(state.project.aspect || "9:16").split(":").map(Number);
    const ratio = w > 0 && h > 0 ? w / h : 9 / 16;
    const cropped = await cropImage(file, {
      aspect: ratio,
      title: `Cắt ảnh cho scene ${n}`,
      hint: `Khung theo tỉ lệ dự án (${state.project.aspect}). Kéo để chọn vùng, cuộn chuột để phóng to.`,
      padColor: "#000000",
      originalHint: "Dùng nguyên ảnh, khi render sẽ tự phủ kín khung",
    });
    if (cropped) void studio.actions.uploadImage(n, cropped);
  };

  return (
    <aside className="inspector" aria-label="Chi tiết scene">
      <h2 className="inspector-title">{sceneLabel(scene)}</h2>

      <div className="field-row">
        <Field label="Tiêu đề trên hình" value={scene.title} onCommit={save("title")} />
        <Field label="Tối thiểu" hint="giây" value={scene.duration ? String(scene.duration) : ""} onCommit={save("duration")} />
      </div>

      <Field
        label="Nhân vật"
        hint={state.characterList.length ? state.characterList.map((c) => c.id).join(", ") : "chưa có nhân vật"}
        value={scene.characters.join(", ")}
        onCommit={save("char")}
      />

      <Field
        label="Lời dẫn"
        hint={scene.shotOf ? `để trống: phát dưới lời dẫn của scene ${scene.shotOf}` : undefined}
        value={scene.narration}
        rows={4}
        onCommit={(value) => void studio.actions.saveNarration(n, value)}
      />

      <Field
        label="Prompt ảnh"
        hint={scene.isMap ? "scene bản đồ — vẽ bằng code" : "hành động, bối cảnh, bố cục; không tả mặt hay trang phục"}
        value={scene.prompt}
        rows={6}
        onCommit={(value) => void studio.actions.savePrompt(n, value)}
      />

      {scene.isMap ? (
        <Field
          label="Map spec (JSON)"
          hint="một dòng JSON: view, year, territories, arrows, labels. Trống = AI tự viết."
          value={scene.map}
          rows={3}
          onCommit={save("map")}
        />
      ) : null}

      <div className="slots">
        <Slot tone="image" label="Ảnh" has={scene.hasImage} status={scene.hasImage ? (scene.isMap ? "bản đồ" : "đã có") : "chưa có"}>
          {state.imageModels.length ? (
            <select value={imageModel} aria-label="Model ảnh" onChange={(event) => setImageModel(event.target.value)}>
              {state.imageModels.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.label}
                </option>
              ))}
            </select>
          ) : null}
          <button
            type="button"
            className="btn sm"
            disabled={jobRunning || (!scene.prompt && !scene.isMap)}
            title={scene.prompt ? imageModel : "viết prompt trước"}
            onClick={() => void studio.actions.generateImage(n, imageModel || undefined)}
          >
            {scene.hasImage ? "Sinh lại" : "Sinh ảnh"}
          </button>
          <UploadButton kind="image" has={scene.hasImage} onPick={(file) => void uploadSceneImage(file)} />
          <HistoryButtons studio={studio} scene={scene} kind="image" />
        </Slot>

        {scene.shotOf ? null : (
          <Slot
            tone="audio"
            label="Giọng đọc"
            has={scene.hasAudio}
            status={scene.hasAudio ? (scene.audioStale ? "cũ hơn lời dẫn" : "đã có") : "chưa có"}
          >
            <button
              type="button"
              className="btn sm"
              disabled={jobRunning || !scene.narration.trim()}
              onClick={() => void studio.actions.generateAudio(n)}
            >
              {scene.hasAudio ? "Sinh lại" : "Sinh audio"}
            </button>
            <HistoryButtons studio={studio} scene={scene} kind="audio" />
          </Slot>
        )}

        <Slot
          tone="motion"
          label="Motion"
          has={scene.hasMotionVideo}
          status={scene.hasMotionVideo ? (scene.motionStale ? "cũ hơn ảnh" : "đã có") : "dùng ảnh tĩnh"}
        >
          {state.motionVideoModels.length ? (
            <select value={motionModel} aria-label="Model motion" onChange={(event) => setMotionModel(event.target.value)}>
              {state.motionVideoModels.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.label}
                </option>
              ))}
            </select>
          ) : null}
          <button
            type="button"
            className="btn sm"
            disabled={jobRunning || !scene.hasImage}
            title={scene.hasImage ? undefined : "cần ảnh trước"}
            onClick={() => void studio.actions.generateMotion(n, motionModel || undefined)}
          >
            {scene.hasMotionVideo ? "Sinh lại" : "Sinh motion"}
          </button>
          <UploadButton kind="video" has={scene.hasMotionVideo} onPick={(file) => void studio.actions.uploadMotion(n, file)} />
          <HistoryButtons studio={studio} scene={scene} kind="motion" />
          {scene.hasMotionVideo ? (
            <button type="button" className="btn sm quiet" onClick={() => void studio.actions.removeMotion(n)}>
              Bỏ video
            </button>
          ) : null}
        </Slot>
      </div>

      {scene.motionPrompt ? (
        <p className="hint" title={scene.motionPrompt}>
          motion: {scene.motionPrompt.slice(0, 140)}
          {scene.motionPrompt.length > 140 ? "…" : ""}
        </p>
      ) : null}
      {scene.hasAudio && scene.shotOf ? <p className="hint">dùng audio của scene {scene.shotOf}</p> : null}
      {scene.duration ? <p className="hint">độ dài tối thiểu {seconds(scene.duration)}</p> : null}
    </aside>
  );
};
