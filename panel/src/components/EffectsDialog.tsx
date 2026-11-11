import { useEffect, useState } from "react";
import { api } from "../api.ts";
import type { Branding } from "../types.ts";
import { Dialog } from "./Dialog.tsx";

const GRADES = ["none", "warm", "cool", "sepia"];
const TRANSITIONS = ["crossfade", "wipe", "slide", "zoom", "iris", "flash", "none"];
const LAYERS = ["fog", "lightRays", "dust", "snow", "embers", "rain", "petals", "bokeh", "lightLeak"];

export const EffectsDialog = ({ onClose }: { onClose: () => void }) => {
  const [branding, setBranding] = useState<Branding | null>(null);

  useEffect(() => {
    void api.branding().then((body) => setBranding(body.branding));
  }, []);

  const patch = (value: Record<string, unknown>) => {
    void api.saveBranding({ effects: value }).then((body) => setBranding(body.branding));
  };

  if (!branding) return <Dialog title="Hiệu ứng" onClose={onClose}><p className="hint">Đang tải…</p></Dialog>;

  const effects = branding as unknown as {
    effects: {
      vignette: boolean;
      grain: boolean;
      grade: string;
      transition: { type: string; frames: number };
      layers: Record<string, { enabled: boolean; intensity: number }>;
    };
  };
  const fx = effects.effects;

  return (
    <Dialog title="Hiệu ứng" wide onClose={onClose}>
      <p className="hint">Thay đổi áp dụng vào branding và khung xem trước video (player render thật) tự cập nhật ngay.</p>

      <div className="field-row">
        <label className="field">
          <span className="field-label">Tông màu (grade)</span>
          <select value={fx.grade} onChange={(event) => patch({ ...fx, grade: event.target.value })}>
            {GRADES.map((grade) => <option key={grade} value={grade}>{grade}</option>)}
          </select>
        </label>
        <label className="field">
          <span className="field-label">Chuyển cảnh</span>
          <select value={fx.transition.type} onChange={(event) => patch({ ...fx, transition: { ...fx.transition, type: event.target.value } })}>
            {TRANSITIONS.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
        </label>
      </div>

      <div className="brand-section">
        <h3>Lớp nền</h3>
        <label className="brand-check">
          <input type="checkbox" checked={fx.vignette} onChange={(event) => patch({ ...fx, vignette: event.target.checked })} />
          Vignette
        </label>
        <label className="brand-check">
          <input type="checkbox" checked={fx.grain} onChange={(event) => patch({ ...fx, grain: event.target.checked })} />
          Grain
        </label>
      </div>

      <div className="brand-section">
        <h3>Lớp hiệu ứng</h3>
        {LAYERS.map((layer) => {
          const current = fx.layers[layer] ?? { enabled: false, intensity: 50 };
          return (
            <div key={layer} className="fx-row">
              <label className="brand-check">
                <input type="checkbox" checked={current.enabled} onChange={(event) => patch({ ...fx, layers: { ...fx.layers, [layer]: { ...current, enabled: event.target.checked } } })} />
                {layer}
              </label>
              <input type="range" min={0} max={100} value={current.intensity} disabled={!current.enabled} onChange={(event) => patch({ ...fx, layers: { ...fx.layers, [layer]: { ...current, intensity: Number(event.target.value) } } })} />
            </div>
          );
        })}
      </div>
    </Dialog>
  );
};
