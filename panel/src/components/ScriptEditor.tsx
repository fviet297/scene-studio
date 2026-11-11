import { useEffect, useMemo, useRef, useState } from "react";
import type { ScenePatch } from "../api.ts";
import type { SceneState, StudioState } from "../types.ts";
import type { Studio } from "../useStudio.ts";

interface Props {
  studio: Studio;
  state: StudioState;
  onClose: () => void;
}

type FieldKey = "narration" | "cue" | "prompt" | "camera" | "action" | "env";

const FIELDS: { key: FieldKey; label: string; rows?: number }[] = [
  { key: "narration", label: "Lời dẫn", rows: 3 },
  { key: "cue", label: "Cue", rows: 0 },
  { key: "prompt", label: "Prompt ảnh", rows: 3 },
  { key: "camera", label: "Camera", rows: 0 },
  { key: "action", label: "Action", rows: 0 },
  { key: "env", label: "Env", rows: 0 },
];

const patchOf = (scene: SceneState): ScenePatch => ({
  scene: scene.scene,
  narration: scene.narration,
  cue: scene.cue,
  prompt: scene.prompt,
  camera: scene.camera,
  action: scene.action,
  env: scene.env,
});

const rowIsDirty = (patch: ScenePatch, scene: SceneState): boolean =>
  (patch.narration ?? "") !== scene.narration ||
  (patch.cue ?? "") !== scene.cue ||
  (patch.prompt ?? "") !== scene.prompt ||
  (patch.camera ?? "") !== scene.camera ||
  (patch.action ?? "") !== scene.action ||
  (patch.env ?? "") !== scene.env;

/**
 * The full-script editor: every scene's narration, cue, image prompt and motion parts in one
 * table, saved in one `/api/scenes-update` call. JSON import goes through the same validation the
 * old panel used — nothing is written until "Áp dụng" followed by "Lưu".
 */
export const ScriptEditor = ({ studio, state, onClose }: Props) => {
  const dialog = useRef<HTMLDialogElement>(null);
  const [drafts, setDrafts] = useState<Record<number, ScenePatch>>(() =>
    Object.fromEntries(state.scenes.map((scene) => [scene.scene, patchOf(scene)])),
  );
  const [json, setJson] = useState("");
  const [jsonNote, setJsonNote] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  const dirty = useMemo(
    () =>
      state.scenes
        .filter((scene) => {
          const patch = drafts[scene.scene];
          return patch && rowIsDirty(patch, scene);
        })
        .map((scene) => drafts[scene.scene]),
    [drafts, state.scenes],
  );

  const edit = (scene: number, key: FieldKey, value: string) =>
    setDrafts((all) => ({ ...all, [scene]: { ...all[scene], [key]: value } }));

  const missingPrompts = state.scenes.filter((scene) => !scene.isMap && !scene.prompt.trim() && scene.narration.trim());
  const missingMotion = state.scenes.filter(
    (scene) => !scene.motion && !scene.camera.trim() && !scene.action.trim() && !scene.env.trim() && scene.narration.trim(),
  );

  const exportJson = () => {
    const rows = state.scenes.map((scene) => drafts[scene.scene] ?? patchOf(scene));
    setJson(JSON.stringify(rows, null, 1));
    setJsonNote(`${rows.length} scene đã xuất`);
  };

  const applyJson = () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch (error) {
      setJsonNote(`JSON lỗi: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }
    const rows = Array.isArray(parsed) ? parsed : (parsed as { scenes?: unknown })?.scenes;
    if (!Array.isArray(rows)) {
      setJsonNote("JSON phải là một mảng scene, hoặc { scenes: [...] }");
      return;
    }
    const next = { ...drafts };
    const errors: string[] = [];
    for (const row of rows as Record<string, unknown>[]) {
      const scene = Number(row?.scene);
      if (!Number.isInteger(scene) || !next[scene]) {
        errors.push(`scene ${row?.scene}: không có trong kịch bản hiện tại`);
        continue;
      }
      const patch: ScenePatch = { scene };
      for (const field of FIELDS) {
        const value = row[field.key];
        if (value === undefined) continue;
        if (typeof value !== "string") {
          errors.push(`scene ${scene}: ${field.key} phải là chuỗi`);
          continue;
        }
        patch[field.key] = value;
      }
      next[scene] = { ...next[scene], ...patch };
    }
    setDrafts(next);
    setJsonNote(errors.length ? `${rows.length} dòng, ${errors.length} lỗi: ${errors.slice(0, 3).join("; ")}` : `${rows.length} dòng hợp lệ — bấm Lưu để ghi`);
  };

  const save = async () => {
    if (!dirty.length) return;
    setSaving(true);
    await studio.actions.scenesUpdate(dirty);
    setSaving(false);
  };

  return (
    <dialog
      ref={dialog}
      className="dialog wide"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === dialog.current) onClose();
      }}
    >
      <div className="dialog-form script-form">
        <header className="script-head">
          <h2>Kịch bản</h2>
          <span className="hint">
            {state.scenes.length} scene · {dirty.length} dòng chưa lưu
          </span>
          <span className="grow" />
          <button type="button" className="btn sm" disabled={!missingPrompts.length || studio.busy > 0} onClick={() => void studio.actions.generatePromptsBatch(missingPrompts.map((s) => s.scene))}>
            Viết prompt còn thiếu ({missingPrompts.length})
          </button>
          <button type="button" className="btn sm" disabled={!missingMotion.length || studio.busy > 0} onClick={() => void studio.actions.generateMotionPromptsBatch(missingMotion.map((s) => s.scene))}>
            Viết motion còn thiếu ({missingMotion.length})
          </button>
        </header>

        <div className="script-rows">
          {state.scenes.map((scene) => {
            const patch = drafts[scene.scene] ?? patchOf(scene);
            const dirtyRow = rowIsDirty(patch, scene);
            return (
              <section key={scene.scene} className="script-row" data-dirty={dirtyRow}>
                <h3>
                  {scene.shotOf ? `Shot ${scene.shotIndex}/${scene.shotCount} · scene ${scene.shotOf}` : `Scene ${scene.scene}`}
                  {dirtyRow ? <span className="script-dirty">chưa lưu</span> : null}
                </h3>
                {FIELDS.map((field) => (
                  <label key={field.key} className={`field${field.rows ? "" : " inline"}`}>
                    <span className="field-label">{field.label}</span>
                    {field.rows ? (
                      <textarea
                        rows={field.rows}
                        value={patch[field.key] ?? ""}
                        spellCheck={false}
                        onChange={(event) => edit(scene.scene, field.key, event.target.value)}
                      />
                    ) : (
                      <input
                        type="text"
                        value={patch[field.key] ?? ""}
                        spellCheck={false}
                        onChange={(event) => edit(scene.scene, field.key, event.target.value)}
                      />
                    )}
                  </label>
                ))}
              </section>
            );
          })}
        </div>

        <details className="script-json">
          <summary>Nhập / xuất JSON</summary>
          <div className="script-json-tools">
            <button type="button" className="btn sm" onClick={exportJson}>
              Xuất JSON
            </button>
            <button type="button" className="btn sm" onClick={applyJson}>
              Kiểm tra JSON
            </button>
            <button type="button" className="btn sm" onClick={() => void navigator.clipboard.writeText(json)} disabled={!json}>
              Copy
            </button>
            {jsonNote ? <span className="hint">{jsonNote}</span> : null}
          </div>
          <textarea
            rows={8}
            value={json}
            spellCheck={false}
            placeholder='[{"scene":1,"narration":"...","prompt":"..."}]'
            onChange={(event) => setJson(event.target.value)}
          />
        </details>

        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onClose}>
            Đóng
          </button>
          <button type="button" className="btn primary" disabled={!dirty.length || saving} onClick={() => void save()}>
            {saving ? "Đang lưu…" : dirty.length ? `Lưu ${dirty.length} scene` : "Lưu"}
          </button>
        </div>
      </div>
    </dialog>
  );
};
