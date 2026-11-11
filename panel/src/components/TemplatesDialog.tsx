import { useEffect, useState } from "react";
import { api } from "../api.ts";
import type { TemplateState } from "../types.ts";
import { Dialog } from "./Dialog.tsx";

const FIELDS: { key: keyof TemplateState; label: string; rows: number; hint?: string }[] = [
  { key: "styleDna", label: "Style DNA", rows: 3, hint: "phong cách chung cho mọi ảnh" },
  { key: "masterPrompt", label: "Template 1 người", rows: 4 },
  { key: "faceLockPrompt", label: "Template khóa mặt", rows: 4 },
  { key: "multiCharPrompt", label: "Template nhiều người", rows: 4 },
  { key: "text2img", label: "Template không người", rows: 4 },
  { key: "mapPrompt", label: "Template bản đồ", rows: 4 },
  { key: "guard", label: "Guard (danh sách cấm)", rows: 3 },
  { key: "motionSystem", label: "Prompt hệ thống motion", rows: 4, hint: "dùng khi viết prompt motion" },
];

export const TemplatesDialog = ({ onClose }: { onClose: () => void }) => {
  const [templates, setTemplates] = useState<TemplateState | null>(null);
  const [versions, setVersions] = useState<string[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void api.templates().then((body) => {
      setTemplates(body.templates);
      setVersions(body.versions);
      const initial: Record<string, string> = {};
      for (const field of FIELDS) initial[field.key] = String(body.templates[field.key] ?? "");
      setDraft(initial);
    });
  }, []);

  const save = () => {
    setSaving(true);
    void api
      .saveTemplates({ ...draft })
      .then((body) => {
        setTemplates(body.templates);
        setSaving(false);
      })
      .catch(() => setSaving(false));
  };

  const createVersion = () => {
    const name = window.prompt("Tên version mới (chữ thường, số, gạch ngang):");
    if (name) {
      void api.saveTemplates({ ...draft, version: name }).then((body) => {
        setTemplates(body.templates);
        void api.templates().then((next) => setVersions(next.versions));
      });
    }
  };

  const activate = (version: string) => {
    void api.activateTemplate(version).then((body) => setTemplates(body.templates));
  };

  return (
    <Dialog
      title="Style & template"
      wide
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Đóng
          </button>
          <button type="button" className="btn" onClick={createVersion}>
            Tạo version
          </button>
          <button type="button" className="btn primary" disabled={saving} onClick={save}>
            {saving ? "Đang lưu…" : "Lưu"}
          </button>
        </>
      }
    >
      <div className="field-row">
        <label className="field">
          <span className="field-label">Version đang dùng</span>
          <select value={templates?.activeVersion ?? ""} onChange={(event) => activate(event.target.value)}>
            {versions.map((version) => (
              <option key={version} value={version}>
                {version}
              </option>
            ))}
          </select>
        </label>
      </div>

      {FIELDS.map((field) => (
        <label key={field.key} className="field">
          <span className="field-label">
            {field.label}
            {field.hint ? <span className="hint"> {field.hint}</span> : null}
          </span>
          <textarea
            rows={field.rows}
            value={draft[field.key] ?? ""}
            spellCheck={false}
            onChange={(event) => setDraft((all) => ({ ...all, [field.key]: event.target.value }))}
          />
        </label>
      ))}
    </Dialog>
  );
};
