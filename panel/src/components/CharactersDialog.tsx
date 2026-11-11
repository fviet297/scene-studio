import { useEffect, useRef, useState } from "react";
import { api } from "../api.ts";
import { cropImage } from "../crop.tsx";
import type { CharacterLibraryItem, CharacterRef, StudioState } from "../types.ts";
import type { Studio } from "../useStudio.ts";
import { Dialog } from "./Dialog.tsx";

interface Props {
  studio: Studio;
  state: StudioState;
  onClose: () => void;
}

const PROFILE_STRING_FIELDS = [
  ["display_name", "Tên hiển thị"],
  ["country", "Quốc gia"],
  ["period", "Thời kỳ"],
  ["dynasty", "Triều đại"],
  ["role", "Vai trò"],
] as const;
const PROFILE_LIST_FIELDS = [
  ["aliases", "Tên khác"],
  ["known_facts", "Dữ kiện đã biết"],
  ["unknowns", "Điểm chưa rõ"],
] as const;

export const CharactersDialog = ({ studio, state, onClose }: Props) => {
  const [view, setView] = useState<"gallery" | "new" | "library" | "profile">("gallery");
  const [active, setActive] = useState<CharacterRef | null>(null);
  const [library, setLibrary] = useState<CharacterLibraryItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (view === "library") {
      void api.characterLibrary().then((body) => setLibrary(body.characters)).catch((e: Error) => setError(e.message));
    }
  }, [view]);

  return (
    <Dialog title="Nhân vật dự án" wide onClose={onClose}>
      {error ? <p className="tag-warn">{error}</p> : null}

      {view === "gallery" ? (
        <>
          <div className="char-gallery">
            {state.characterList.map((character) => (
              <button key={character.id} type="button" className="char-card" onClick={() => { setActive(character); setView("profile"); }}>
                <span className="char-thumb">
                  {character.refUrl ? <img src={character.refUrl} alt="" /> : <span className="blank">chưa có ảnh</span>}
                </span>
                <b>{character.name}</b>
                <span className="hint">{character.scenes.length} scene</span>
              </button>
            ))}
            {!state.characterList.length ? <p className="hint">Chưa có nhân vật nào.</p> : null}
          </div>
          <div className="dialog-actions">
            <button type="button" className="btn" onClick={onClose}>Đóng</button>
            <button type="button" className="btn" onClick={() => setView("new")}>Thêm nhân vật</button>
            <button type="button" className="btn" onClick={() => setView("library")}>Từ project khác</button>
          </div>
        </>
      ) : null}

      {view === "new" ? <NewCharacter studio={studio} onDone={() => setView("gallery")} /> : null}
      {view === "library" ? <ImportCharacter studio={studio} library={library} onDone={() => setView("gallery")} /> : null}
      {view === "profile" && active ? <Profile studio={studio} state={state} character={active} onBack={() => setView("gallery")} /> : null}
    </Dialog>
  );
};

const NewCharacter = ({ studio, onDone }: { studio: Studio; onDone: () => void }) => {
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  return (
    <>
      <label className="field">
        <span className="field-label">Id (chữ thường, số, gạch ngang)</span>
        <input type="text" value={id} onChange={(event) => setId(event.target.value)} />
      </label>
      <label className="field">
        <span className="field-label">Tên nhân vật</span>
        <input type="text" value={name} onChange={(event) => setName(event.target.value)} />
      </label>
      <div className="dialog-actions">
        <button type="button" className="btn" onClick={onDone}>Huỷ</button>
        <button type="button" className="btn primary" disabled={!id.trim() || !name.trim()} onClick={() => { void studio.actions.createCharacter(id.trim(), name.trim()).then(onDone); }}>
          Thêm
        </button>
      </div>
    </>
  );
};

const ImportCharacter = ({ studio, library, onDone }: { studio: Studio; library: CharacterLibraryItem[]; onDone: () => void }) => {
  const [picked, setPicked] = useState<CharacterLibraryItem | null>(null);
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  useEffect(() => {
    if (picked) {
      setId(picked.id);
      setName(picked.name);
    }
  }, [picked]);
  return (
    <>
      <div className="char-gallery">
        {library.map((character) => (
          <button key={`${character.project}/${character.id}`} type="button" className="char-card" onClick={() => setPicked(character)}>
            <span className="char-thumb">{character.imageUrl ? <img src={character.imageUrl} alt="" /> : <span className="blank" />}</span>
            <b>{character.name}</b>
            <span className="hint">{character.projectTitle}</span>
          </button>
        ))}
        {!library.length ? <p className="hint">Không tìm thấy nhân vật nào ở project khác.</p> : null}
      </div>
      <div className="field-row">
        <label className="field">
          <span className="field-label">Id mới</span>
          <input type="text" value={id} onChange={(event) => setId(event.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">Tên</span>
          <input type="text" value={name} onChange={(event) => setName(event.target.value)} />
        </label>
      </div>
      <div className="dialog-actions">
        <button type="button" className="btn" onClick={onDone}>Huỷ</button>
        <button type="button" className="btn primary" disabled={!picked || !id.trim() || !name.trim()} onClick={() => { void studio.actions.importCharacter({ project: picked!.project, sourceId: picked!.id, id: id.trim(), name: name.trim() }).then(onDone); }}>
          Nhập
        </button>
      </div>
    </>
  );
};

const Profile = ({ studio, state, character, onBack }: { studio: Studio; state: StudioState; character: CharacterRef; onBack: () => void }) => {
  const [profile, setProfile] = useState<Record<string, unknown>>({});
  const [imageModel, setImageModel] = useState(state.imageModels[0]?.id ?? "");
  const [description, setDescription] = useState("");
  const [suggesting, setSuggesting] = useState(false);
  const refInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void api.characterProfile(character.id).then((body) => setProfile(body.profile));
  }, [character.id]);

  const patch = (key: string, value: unknown) => setProfile((all) => ({ ...all, [key]: value }));

  const suggest = () => {
    setSuggesting(true);
    void api
      .characterSuggest(character.id, profile)
      .then((body) => {
        // Only fill fields that are currently empty (D15): never overwrite what the user wrote.
        const next = { ...profile };
        for (const [key, value] of Object.entries(body.suggestion)) {
          const current = profile[key];
          if (current === undefined || current === "" || (Array.isArray(current) && current.length === 0)) next[key] = value;
        }
        setProfile(next);
        setSuggesting(false);
      })
      .catch(() => setSuggesting(false));
  };

  const generate = () => {
    void studio.actions.generateCharacterImage(character.id, imageModel, description);
  };

  const uploadReference = async (file: File) => {
    const cropped = await cropImage(file, {
      aspect: 1,
      title: "Cắt ảnh tham chiếu",
      hint: "Ảnh tham chiếu là hình vuông. Kéo để chọn vùng giữ lại, cuộn chuột để phóng to.",
      originalHint: "Bỏ qua bước cắt: máy chủ tự lấy hình vuông ở giữa ảnh",
    });
    if (cropped) void studio.actions.uploadCharacterReference(character.id, cropped);
  };

  return (
    <>
      <header className="profile-head">
        <h3>{character.name}</h3>
        <button type="button" className="btn sm quiet" onClick={onBack}>← Quay lại</button>
      </header>

      {PROFILE_STRING_FIELDS.map(([key, label]) => (
        <label key={key} className="field">
          <span className="field-label">{label}</span>
          <input type="text" value={String(profile[key] ?? "")} onChange={(event) => patch(key, event.target.value)} />
        </label>
      ))}
      {PROFILE_LIST_FIELDS.map(([key, label]) => (
        <label key={key} className="field">
          <span className="field-label">{label} (mỗi dòng một mục)</span>
          <textarea rows={3} value={Array.isArray(profile[key]) ? (profile[key] as string[]).join("\n") : String(profile[key] ?? "")} onChange={(event) => patch(key, event.target.value.split("\n"))} />
        </label>
      ))}
      <label className="field">
        <span className="field-label">Diễn giải / ngoại hình (tiếng Anh)</span>
        <textarea rows={4} value={String(profile.interpretation ?? "")} onChange={(event) => patch("interpretation", event.target.value)} />
      </label>

      <div className="char-image-tools">
        <select value={imageModel} aria-label="Model ảnh nhân vật" onChange={(event) => setImageModel(event.target.value)}>
          {state.imageModels.map((model) => (
            <option key={model.id} value={model.id}>{model.label}</option>
          ))}
        </select>
        <label className="field">
          <span className="field-label">Mô tả tạo ảnh</span>
          <textarea rows={2} value={description} onChange={(event) => setDescription(event.target.value)} />
        </label>
        <button type="button" className="btn sm" disabled={!description.trim()} onClick={generate}>Tạo ảnh nháp</button>
        <button type="button" className="btn sm" onClick={() => void refInput.current?.click()}>Tải ảnh tham chiếu</button>
        <input ref={refInput} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadReference(file); event.target.value = ""; }} />
      </div>

      <div className="dialog-actions">
        <button type="button" className="btn" onClick={suggest} disabled={suggesting || studio.busy > 0}>
          {suggesting ? "Đang gợi ý…" : "Gợi ý AI (ô trống)"}
        </button>
        <button type="button" className="btn primary" onClick={() => void studio.actions.saveCharacterProfile(character.id, profile)}>
          Lưu hồ sơ
        </button>
      </div>
    </>
  );
};
