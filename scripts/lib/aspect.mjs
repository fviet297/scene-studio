// Single source of truth for a project's aspect ratio. A project declares `aspect: 16:9` (or
// `9:16`) on a line in its scene-plan.md header; every stage — image gen, motion-video gen,
// the Remotion composition size, and the review panel/upload checks — reads its ratio/size/
// dimension tokens from here so one knob flips the whole pipeline per project. Default 9:16
// keeps every existing vertical project unchanged when it declares no aspect.

export const DEFAULT_ASPECT = '9:16';

// Per-aspect tokens each provider/stage needs:
//  width/height  — Remotion composition pixels
//  ratio         — the `9:16`/`16:9` string most image/video APIs take (Seedream replicate, nano,
//                  grok, replicate seedance, muse2api)
//  metaImageSize — Meta Model API `size` (read as an aspect ratio only, not exact pixels)
//  openaiImageSize — `size` of a provider added in the model manager: the sizes OpenAI's
//                  gpt-image models accept (1024x1024, 1024x1536, 1536x1024)
//  orientation   — 'vertical' | 'horizontal' (drives the template composition wording + checks)
//  frame         — the [FRAME] template text: frame shape plus the zones the Remotion overlay
//                  covers. Vertical: title scrim over the top ~18%, caption scrim over the bottom
//                  ~24%. Wide: title over the top ~15%, and wrap-vertical.mjs later centre-crops
//                  16:9 to 3:2, so the outer ~8% of each side is lost.
export const ASPECTS = {
  '9:16': { ratio: '9:16', width: 1080, height: 1920, orientation: 'vertical', metaImageSize: '1080x1920', openaiImageSize: '1024x1536',
    frame: '9:16 vertical story frame; top sixth and bottom quarter calm and low-detail for title and captions, key action between them.' },
  '16:9': { ratio: '16:9', width: 1920, height: 1080, orientation: 'horizontal', metaImageSize: '1920x1080', openaiImageSize: '1536x1024',
    frame: '16:9 landscape cinematic story frame; top sixth calm for the title, key action inside the central five-sixths of the width.' },
  '1:1': { ratio: '1:1', width: 1080, height: 1080, orientation: 'square', metaImageSize: '1080x1080', openaiImageSize: '1024x1024',
    frame: '1:1 square story frame; top sixth calm for the title, key action clear of the edges.' },
};

export const normalizeAspect = (a) => (a && ASPECTS[String(a).trim()] ? String(a).trim() : DEFAULT_ASPECT);
export const aspectInfo = (a) => ASPECTS[normalizeAspect(a)];
export const frameText = (a) => aspectInfo(a).frame;

// Pull `aspect:` from a scene-plan's raw markdown (a header line, anywhere in the file). Missing
// or unknown value → DEFAULT_ASPECT, so a plan that never mentions aspect stays 9:16.
export const parsePlanAspect = (raw) => normalizeAspect(raw.match(/^\s*aspect\s*:\s*(\S+)\s*$/mi)?.[1]);

// Rewrite the aspect wording baked into the (shared, global) prompt templates so a 16:9 project
// asks the model to compose for landscape instead of a portrait frame. Only the aspect tokens are
// swapped; the art-style DNA and every other rule are left untouched, so both the built-in
// defaults and any saved template override are handled the same way. A vertical project is a
// no-op (the templates are already authored 9:16).
export const applyAspectText = (text, aspect) => {
  const info = aspectInfo(aspect);
  if (info.orientation === 'vertical') return text;
  if (info.orientation === 'horizontal') {
    return text
      .replaceAll('9:16 vertical', '16:9 horizontal (landscape)')
      .replaceAll('9:16', '16:9')
      .replaceAll('leave the lower 22% relatively uncluttered for Vietnamese subtitles', 'leave the lower 18% relatively uncluttered for Vietnamese subtitles')
      .replaceAll('reserve calm negative space only at top for captions', 'reserve calm negative space along the lower edge for captions')
      .replaceAll('negative space at top', 'negative space along the lower edge');
  }
  return text.replaceAll('9:16 vertical', '1:1 square').replaceAll('9:16', '1:1');
};
