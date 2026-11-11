import { useState } from "react";
import type { Studio } from "../useStudio.ts";
import { Dialog } from "./Dialog.tsx";

const slugify = (title: string): string =>
  title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

export const NewProjectDialog = ({ studio, onClose }: { studio: Studio; onClose: () => void }) => {
  const [mode, setMode] = useState<"ai" | "manual">("ai");
  const [request, setRequest] = useState("");
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [aspect, setAspect] = useState("9:16");
  const [sceneCount, setSceneCount] = useState("15");
  const [style, setStyle] = useState("standard");
  const [motionDuration, setMotionDuration] = useState("");
  const [plan, setPlan] = useState("");
  const [running, setRunning] = useState(false);

  const buildSlug = (value: string) => setSlug(slugify(value || request || title));

  const createManual = () => {
    if (!slugify(slug)) return;
    void studio.actions.createProject({
      slug: slugify(slug),
      title: title.trim() || slug,
      aspect,
      motionDuration: motionDuration || undefined,
      plan,
    });
    onClose();
  };

  const generateAi = () => {
    if (!request.trim() || running) return;
    setRunning(true);
    const targetSlug = slugify(slug) || undefined;
    const targetTitle = title.trim() || request.trim().slice(0, 60);
    void studio.actions
      .scriptGenerate({
        request: request.trim(),
        sceneCount: Number(sceneCount),
        style,
        slug: targetSlug,
        title: targetTitle,
        aspect,
        motionDuration: motionDuration || undefined,
      })
      .finally(() => setRunning(false));
  };

  return (
    <Dialog title="Dự án mới" wide onClose={onClose}>
      <div className="segmented">
        <button type="button" aria-pressed={mode === "ai"} onClick={() => setMode("ai")}>
          Viết bằng AI
        </button>
        <button type="button" aria-pressed={mode === "manual"} onClick={() => setMode("manual")}>
          Thủ công
        </button>
      </div>

      {mode === "ai" ? (
        <>
          <label className="field">
            <span className="field-label">Yêu cầu video</span>
            <textarea rows={4} value={request} onChange={(event) => setRequest(event.target.value)} placeholder="Ví dụ: Ngô Quyền và trận Bạch Đằng năm 938" />
          </label>
          <div className="field-row">
            <label className="field">
              <span className="field-label">Số scene</span>
              <input type="number" min={3} value={sceneCount} onChange={(event) => setSceneCount(event.target.value)} />
            </label>
            <label className="field">
              <span className="field-label">Kiểu video</span>
              <select value={style} onChange={(event) => setStyle(event.target.value)}>
                <option value="standard">Kể chuyện thường</option>
                <option value="map">Kể trên bản đồ</option>
              </select>
            </label>
          </div>
        </>
      ) : (
        <>
          <label className="field">
            <span className="field-label">Kịch bản (scene-plan.md)</span>
            <textarea rows={10} value={plan} spellCheck={false} onChange={(event) => setPlan(event.target.value)} placeholder="Dán nội dung scene-plan.md, hoặc để trống tạo project rỗng" />
          </label>
        </>
      )}

      <div className="field-row">
        <label className="field">
          <span className="field-label">Tiêu đề video</span>
          <input type="text" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ngô Quyền và trận Bạch Đằng" />
        </label>
        <label className="field">
          <span className="field-label">Slug (thư mục)</span>
          <input type="text" value={slug} onChange={(event) => setSlug(event.target.value)} onBlur={() => buildSlug(slug)} placeholder="tu-dong" />
        </label>
      </div>

      <div className="field-row">
        <label className="field">
          <span className="field-label">Tỉ lệ khung</span>
          <select value={aspect} onChange={(event) => setAspect(event.target.value)}>
            <option value="9:16">9:16 dọc</option>
            <option value="16:9">16:9 ngang</option>
            <option value="1:1">1:1 vuông</option>
          </select>
        </label>
        <label className="field">
          <span className="field-label">Độ dài motion</span>
          <select value={motionDuration} onChange={(event) => setMotionDuration(event.target.value)}>
            <option value="">Theo audio</option>
            <option value="5">5 giây</option>
            <option value="8">8 giây</option>
            <option value="10">10 giây</option>
          </select>
        </label>
      </div>

      <div className="dialog-actions">
        <button type="button" className="btn" onClick={onClose}>
          Huỷ
        </button>
        {mode === "ai" ? (
          <button
            type="button"
            className="btn primary"
            disabled={!request.trim() || running || studio.busy > 0}
            onClick={() => {
              void generateAi();
              onClose();
            }}
          >
            {running ? "Đang viết…" : "Viết kịch bản"}
          </button>
        ) : (
          <button type="button" className="btn primary" disabled={!slugify(slug)} onClick={createManual}>
            Tạo dự án
          </button>
        )}
      </div>
    </Dialog>
  );
};
