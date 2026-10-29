import { continueRender, delayRender, staticFile } from "remotion";
import { useEffect, useRef, useState } from "react";

// Caption fonts ship in public/fonts so Windows, macOS and the headless render machine draw the
// same glyphs (a system font such as Arial differs per OS). Every file covers Vietnamese.
// Ids mirror CAPTION_FONTS in scripts/lib/branding.mjs and the <option>s in review-panel.html.

export type CaptionFontId =
  | "be-vietnam"
  | "montserrat"
  | "anton"
  | "bangers"
  | "arial";

interface CaptionFontSpec {
  family: string;
  // CSS font-weight used for the text; for variable fonts also the descriptor range.
  weight: number;
  file?: string;
  fileWeight?: string;
}

export const CAPTION_FONTS: Record<CaptionFontId, CaptionFontSpec> = {
  "be-vietnam": {
    family: "SceneStudio Be Vietnam Pro",
    weight: 800,
    file: "fonts/BeVietnamPro-ExtraBold.ttf",
  },
  montserrat: {
    family: "SceneStudio Montserrat",
    weight: 800,
    file: "fonts/Montserrat-Variable.ttf",
    fileWeight: "100 900",
  },
  anton: {
    family: "SceneStudio Anton",
    weight: 400,
    file: "fonts/Anton-Regular.ttf",
  },
  bangers: {
    family: "SceneStudio Bangers",
    weight: 400,
    file: "fonts/Bangers-Regular.ttf",
  },
  arial: { family: "Arial, sans-serif", weight: 800 },
};

const pending = new Map<CaptionFontId, Promise<void>>();

const loadFont = (id: CaptionFontId): Promise<void> => {
  const spec = CAPTION_FONTS[id];
  if (!spec.file) return Promise.resolve();
  const cached = pending.get(id);
  if (cached) return cached;
  const face = new FontFace(spec.family, `url(${staticFile(spec.file)})`, {
    weight: spec.fileWeight ?? String(spec.weight),
  });
  const loading = face.load().then((loaded) => {
    document.fonts.add(loaded);
  });
  // A failed load must not block the render forever; drop it so the next call can retry.
  loading.catch(() => pending.delete(id));
  pending.set(id, loading);
  return loading;
};

// Holds the render (delayRender) until the chosen font is ready, so no frame is ever drawn in a
// fallback face. Falls back to the system font when the file cannot be loaded.
export const useCaptionFont = (id: CaptionFontId): CaptionFontSpec => {
  const spec = CAPTION_FONTS[id] ?? CAPTION_FONTS["be-vietnam"];
  const [readyId, setReadyId] = useState<CaptionFontId | null>(
    spec.file ? null : id,
  );
  // One render hold for the first load; later font changes are interactive (panel) only.
  const [handle] = useState(() =>
    spec.file ? delayRender(`caption font ${id}`) : null,
  );
  const released = useRef(false);

  useEffect(() => {
    let cancelled = false;
    loadFont(id)
      .catch(() => undefined)
      .then(() => {
        if (cancelled) return;
        setReadyId(id);
        if (handle !== null && !released.current) {
          released.current = true;
          continueRender(handle);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [id, handle]);

  return readyId === id || !spec.file ? spec : CAPTION_FONTS.arial;
};
