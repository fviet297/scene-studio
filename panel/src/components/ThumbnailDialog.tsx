import { useEffect, useState } from "react";
import { api } from "../api.ts";
import type { ThumbnailIdeas } from "../types.ts";
import { Dialog } from "./Dialog.tsx";

interface Props {
  onClose: () => void;
  imageModels: { id: string; label: string }[];
  characterList: { id: string; name: string }[];
}

export const ThumbnailDialog = ({ onClose, imageModels, characterList }: Props) => {
  const [ideas, setIdeas] = useState<ThumbnailIdeas | null>(null);
  const [headline, setHeadline] = useState("");
  const [prompt, setPrompt] = useState("");
  const [chars, setChars] = useState<string[]>([]);
  const [side, setSide] = useState<"left" | "right">("right");
  const [model, setModel] = useState(imageModels[0]?.id ?? "");
  const [backgrounds, setBackgrounds] = useState<{ file: string; url: string }[]>([]);
  const [image, setImage] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [letterModel, setLetterModel] = useState(imageModels[0]?.id ?? "");
  const [letterStyle, setLetterStyle] = useState("");
  const [letterLines, setLetterLines] = useState("");
  const [letterKicker, setLetterKicker] = useState("");
  const [lettering, setLettering] = useState(false);

  useEffect(() => {
    void api.thumbnailBackgrounds().then((body) => setBackgrounds(body.items));
  }, []);

  const suggest = () => {
    setRunning(true);
    void api
      .thumbnailIdeas(headline)
      .then((body) => {
        setIdeas(body);
        setHeadline(body.headlines[0] ?? "");
        setPrompt(body.prompt);
        setChars(body.chars);
        setRunning(false);
      })
      .catch((e: Error) => {
        setError(e.message);
        setRunning(false);
      });
  };

  const generate = () => {
    setRunning(true);
    void api
      .thumbnailGenerate({ model, prompt, chars, side }, {
        onLog: () => undefined,
      })
      .then((done) => {
        const url = (done as { url?: string })?.url;
        if (url) setImage(url);
        setRunning(false);
        void api.thumbnailBackgrounds().then((body) => setBackgrounds(body.items));
      })
      .catch((e: Error) => {
        setError(e.message);
        setRunning(false);
      });
  };

  const toggleChar = (id: string) =>
    setChars((list) => (list.includes(id) ? list.filter((item) => item !== id) : [...list, id]));

  const letter = async () => {
    if (!image || !letterStyle.trim() || !letterLines.trim()) return;
    setLettering(true);
    try {
      // The lettering endpoint needs the chosen background as a base64 JPEG (data URL).
      const blob = await (await fetch(image)).blob();
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1]);
        reader.onerror = () => reject(new Error("Không đọc được ảnh."));
        reader.readAsDataURL(blob);
      });
      const done = await api.thumbnailLettering(
        {
          model: letterModel,
          image: base64,
          kicker: letterKicker.trim(),
          lines: letterLines.split("\n").map((line) => line.trim()).filter(Boolean),
          styleHint: letterStyle.trim(),
          side,
        },
        { onLog: () => undefined },
      );
      const url = (done as { url?: string })?.url;
      if (url) setImage(url);
      setLettering(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setLettering(false);
    }
  };

  return (
    <Dialog
      title="Thumbnail YouTube"
      wide
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>Đóng</button>
          <button type="button" className="btn" disabled={running} onClick={suggest}>
            {running ? "Đang nghĩ…" : "Gợi ý bằng AI"}
          </button>
          <button type="button" className="btn primary" disabled={!prompt.trim() || running} onClick={generate}>
            Sinh nền AI
          </button>
        </>
      }
    >
      {error ? <p className="tag-warn">{error}</p> : null}

      <div className="thumb-layout">
        <section className="thumb-controls">
          {ideas ? (
            <details open>
              <summary>3 ý tưởng</summary>
              {ideas.concepts.map((concept) => (
                <button
                  key={concept.id}
                  type="button"
                  className={`thumb-idea${concept.id === ideas.recommended ? " is-recommended" : ""}`}
                  onClick={() => {
                    setHeadline(concept.headline);
                    setPrompt(concept.prompt);
                    setChars(concept.chars);
                  }}
                >
                  <b>{concept.headline}</b>
                  <span className="hint">{concept.prompt}</span>
                </button>
              ))}
            </details>
          ) : null}

          <label className="field">
            <span className="field-label">Tiêu đề (headline)</span>
            <input type="text" value={headline} onChange={(event) => setHeadline(event.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">Prompt nền (tiếng Anh)</span>
            <textarea rows={4} value={prompt} onChange={(event) => setPrompt(event.target.value)} />
          </label>

          <div className="field-row">
            <label className="field">
              <span className="field-label">Model</span>
              <select value={model} onChange={(event) => setModel(event.target.value)}>
                {imageModels.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
            </label>
            <label className="field">
              <span className="field-label">Phía chữ</span>
              <select value={side} onChange={(event) => setSide(event.target.value as "left" | "right")}>
                <option value="left">Trái</option>
                <option value="right">Phải</option>
              </select>
            </label>
          </div>

          {characterList.length ? (
            <div className="thumb-cast">
              <span className="field-label">Nhân vật (khoá mặt)</span>
              {characterList.map((character) => (
                <label key={character.id} className="brand-check">
                  <input type="checkbox" checked={chars.includes(character.id)} onChange={() => toggleChar(character.id)} />
                  {character.name}
                </label>
              ))}
            </div>
          ) : null}

          {image ? (
            <details>
              <summary>Viết chữ lên ảnh bằng AI</summary>
              <div className="field-row">
                <label className="field">
                  <span className="field-label">Model</span>
                  <select value={letterModel} onChange={(event) => setLetterModel(event.target.value)}>
                    {imageModels.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                  </select>
                </label>
              </div>
              <label className="field">
                <span className="field-label">Dòng nhỏ phía trên (tuỳ chọn)</span>
                <input type="text" value={letterKicker} onChange={(event) => setLetterKicker(event.target.value)} />
              </label>
              <label className="field">
                <span className="field-label">Tiêu đề (mỗi dòng một hàng)</span>
                <textarea rows={3} value={letterLines} onChange={(event) => setLetterLines(event.target.value)} />
              </label>
              <label className="field">
                <span className="field-label">Kiểu chữ cho AI</span>
                <input type="text" value={letterStyle} onChange={(event) => setLetterStyle(event.target.value)} placeholder="Ví dụ: bold condensed serif, cream fill, heavy black outline, drop shadow" />
              </label>
              <button type="button" className="btn sm" disabled={lettering || !letterStyle.trim() || !letterLines.trim()} onClick={() => void letter()}>
                {lettering ? "Đang viết chữ…" : "Viết chữ AI"}
              </button>
            </details>
          ) : null}
        </section>

        <section className="thumb-preview">
          {image ? (
            <a href={image} download target="_blank" rel="noopener">
              <img src={image} alt="Thumbnail" />
            </a>
          ) : (
            <p className="stage-empty">Chưa có ảnh. Sinh nền hoặc chọn ảnh có sẵn bên dưới.</p>
          )}
          <div className="thumb-backgrounds">
            {backgrounds.map((item) => (
              <button key={item.file} type="button" className="thumb-bg" onClick={() => setImage(item.url)}>
                <img src={item.url} alt="" loading="lazy" />
              </button>
            ))}
          </div>
        </section>
      </div>
    </Dialog>
  );
};
