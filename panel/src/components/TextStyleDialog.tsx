import { useEffect, useState } from "react";
import { api } from "../api.ts";
import type { Branding } from "../types.ts";
import { Dialog } from "./Dialog.tsx";

const FONTS = ["be-vietnam", "montserrat", "anton", "bangers", "playfair", "charm", "lobster", "arial"];
const POSITIONS = ["top", "middle", "bottom"];
const HIGHLIGHTS = ["karaoke", "word", "none"];

const FONT_FAMILY: Record<string, string> = {
  "be-vietnam": '"Be Vietnam Pro", Arial, sans-serif',
  montserrat: "Montserrat, Arial, sans-serif",
  anton: "Anton, Arial, sans-serif",
  bangers: "Bangers, Arial, sans-serif",
  playfair: '"Playfair Display", Georgia, serif',
  charm: "Charm, Georgia, serif",
  lobster: "Lobster, Georgia, serif",
  arial: "Arial, sans-serif",
};

/** Captions and scene title are part of branding.json (caption/title text styles). */
export const TextStyleDialog = ({ onClose }: { onClose: () => void }) => {
  const [branding, setBranding] = useState<Branding | null>(null);

  useEffect(() => {
    void api.branding().then((body) => setBranding(body.branding));
  }, []);

  const patch = (section: "captions" | "title", value: Record<string, unknown>) => {
    void api.saveBranding({ [section]: { ...branding![section], ...value } }).then((body) => setBranding(body.branding));
  };

  if (!branding) return <Dialog title="Kiểu chữ" onClose={onClose}><p className="hint">Đang tải…</p></Dialog>;

  const captions = branding.captions as Record<string, unknown>;
  const title = branding.title as Record<string, unknown>;

  const captionStyle = {
    fontFamily: FONT_FAMILY[String(captions.font)] ?? "Arial, sans-serif",
    fontSize: `${Math.max(12, Math.min(72, Number(captions.size) / 1.6))}px`,
    color: String(captions.unspokenColor),
    WebkitTextStroke: `${Math.max(0, Number(captions.strokeWidth) / 4)}px ${String(captions.strokeColor)}`,
    background: `rgba(0,0,0,${Math.min(0.8, Number(captions.backgroundOpacity))})`,
  };
  const titleStyle = {
    fontFamily: FONT_FAMILY[String(title.font)] ?? "Arial, sans-serif",
    fontSize: `${Math.max(14, Math.min(72, Number(title.size) / 1.4))}px`,
    color: String(title.color),
    textShadow: title.shadow ? "0 2px 8px rgba(0,0,0,0.8)" : "none",
  };

  return (
    <Dialog title="Kiểu chữ" wide onClose={onClose}>
      <section className="style-preview">
        <p className="style-preview-caption" style={captionStyle}>
          Lời dẫn mẫu trên hình
        </p>
        <p className="style-preview-title" style={titleStyle}>
          Tiêu đề mẫu
        </p>
      </section>

      <section className="brand-section">
        <h3>Caption (lời dẫn)</h3>
        <label className="brand-check">
          <input type="checkbox" checked={Boolean(captions.enabled)} onChange={(event) => patch("captions", { enabled: event.target.checked })} />
          Bật caption
        </label>
        <div className="field-row">
          <label className="field">
            <span className="field-label">Font</span>
            <select value={String(captions.font)} onChange={(event) => patch("captions", { font: event.target.value })}>
              {FONTS.map((font) => <option key={font} value={font}>{font}</option>)}
            </select>
          </label>
          <label className="field">
            <span className="field-label">Cỡ</span>
            <input type="number" value={Number(captions.size)} onChange={(event) => patch("captions", { size: Number(event.target.value) })} />
          </label>
        </div>
        <div className="field-row">
          <label className="field">
            <span className="field-label">Vị trí</span>
            <select value={String(captions.position)} onChange={(event) => patch("captions", { position: event.target.value })}>
              {POSITIONS.map((position) => <option key={position} value={position}>{position}</option>)}
            </select>
          </label>
          <label className="field">
            <span className="field-label">Nhấn chữ</span>
            <select value={String(captions.highlight)} onChange={(event) => patch("captions", { highlight: event.target.value })}>
              {HIGHLIGHTS.map((highlight) => <option key={highlight} value={highlight}>{highlight}</option>)}
            </select>
          </label>
        </div>
        <div className="field-row">
          <label className="field">
            <span className="field-label">Màu chữ đã đọc</span>
            <input type="color" value={String(captions.spokenColor)} onChange={(event) => patch("captions", { spokenColor: event.target.value })} />
          </label>
          <label className="field">
            <span className="field-label">Màu chữ chưa đọc</span>
            <input type="color" value={String(captions.unspokenColor)} onChange={(event) => patch("captions", { unspokenColor: event.target.value })} />
          </label>
        </div>
      </section>

      <section className="brand-section">
        <h3>Tiêu đề trên hình</h3>
        <label className="brand-check">
          <input type="checkbox" checked={Boolean(title.enabled)} onChange={(event) => patch("title", { enabled: event.target.checked })} />
          Bật tiêu đề
        </label>
        <div className="field-row">
          <label className="field">
            <span className="field-label">Font</span>
            <select value={String(title.font)} onChange={(event) => patch("title", { font: event.target.value })}>
              {FONTS.map((font) => <option key={font} value={font}>{font}</option>)}
            </select>
          </label>
          <label className="field">
            <span className="field-label">Cỡ</span>
            <input type="number" value={Number(title.size)} onChange={(event) => patch("title", { size: Number(event.target.value) })} />
          </label>
        </div>
        <label className="field">
          <span className="field-label">Màu</span>
          <input type="color" value={String(title.color)} onChange={(event) => patch("title", { color: event.target.value })} />
        </label>
      </section>
    </Dialog>
  );
};
