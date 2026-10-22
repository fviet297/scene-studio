// Character reference images made in the review panel: drawn from a text description, or
// redrawn from a source image (an uploaded photo/drawing, or the character's current reference).
// The result becomes the reference every scene image of that character is locked to, so it is
// drawn in the active template's style DNA, as one full-body figure on a plain background.
// Square, because the panel crops every reference to 1024×1024 (review-server optimizeCharacterImage).

import { download, getTemplates, NO_TEXT_POLICY, runImageModel } from './replicate-image.mjs';

export const MAX_CHARACTER_DESCRIPTION = 1500;

const FRAME = 'Square 1:1 character reference: exactly one person, full body from head to feet, standing in a relaxed neutral pose turned three-quarters toward the viewer, centred with clear margin around the head and feet, face fully visible and evenly lit. Plain flat light-grey background with no scenery, floor, props or other people.';
const NEGATIVE = 'NEGATIVE: a different art style, multiple people, cropped head or feet, scenery, text, watermark.';

const fromText = (styleDna, description) => `${NO_TEXT_POLICY}

CHARACTER REFERENCE. STYLE: ${styleDna}.

CHARACTER: ${description}

${FRAME}

${NEGATIVE}`;

const fromImage = (styleDna, description) => `${NO_TEXT_POLICY}

CHARACTER REFERENCE redrawn from the reference image. STYLE: ${styleDna}.

SAME PERSON: keep the reference's face shape, eyes, nose, mouth, skin tone, hair, facial hair and apparent age. ${description ? `CHANGES: ${description}` : 'Keep their clothing and accessories.'}

${FRAME}

${NEGATIVE} A different face.`;

// Generate one character image into `outPath`. `sourcePath` (optional) switches to redraw-from-image;
// `description` is then an optional change request. `signal` cancels the provider call.
export const generateCharacterImage = async ({ description = '', sourcePath, model, outPath, signal, onLog = () => {} }) => {
  const { styleDna } = getTemplates();
  const prompt = sourcePath ? fromImage(styleDna, description) : fromText(styleDna, description);
  onLog(`model=${model}, ${sourcePath ? 'vẽ lại từ ảnh nguồn' : 'từ mô tả'}, prompt=${prompt.length} ký tự`);
  const url = await runImageModel(process.env.REPLICATE_API_TOKEN, model, {
    prompt, refPaths: sourcePath ? [sourcePath] : [], aspect: '1:1', onLog, signal,
  });
  signal?.throwIfAborted(); // cancelled while the provider finished: keep the previous draft
  onLog('đang tải ảnh về');
  await download(url, outPath);
};
