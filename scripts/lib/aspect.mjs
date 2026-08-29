// Single source of truth for a project's aspect ratio. A project declares `aspect: 16:9` (or
// `9:16`) on a line in its scene-plan.md header; every stage — image gen, motion-video gen,
// the Remotion composition size, and the review panel/upload checks — reads its ratio/size/
// dimension tokens from here so one knob flips the whole pipeline per project. Default 9:16
// keeps every existing vertical project unchanged when it declares no aspect.

export const DEFAULT_ASPECT = '9:16';

// Per-aspect tokens each provider/stage needs:
//  width/height  — Remotion composition pixels
//  ratio         — the `9:16`/`16:9` string most image/video APIs take (Seedream replicate, nano,
//                  grok, fal nano, fal video seedance/veo, replicate seedance)
//  falImageSize  — fal Seedream v4 `image_size` preset (it uses presets, not a ratio string)
//  vmediaImage   — Gommo generateImage `ratio` (underscore form)
//  orientation   — 'vertical' | 'horizontal' (drives the template composition wording + checks)
export const ASPECTS = {
  '9:16': { ratio: '9:16', width: 1080, height: 1920, orientation: 'vertical', falImageSize: 'portrait_16_9', vmediaImage: '9_16' },
  '16:9': { ratio: '16:9', width: 1920, height: 1080, orientation: 'horizontal', falImageSize: 'landscape_16_9', vmediaImage: '16_9' },
  '1:1': { ratio: '1:1', width: 1080, height: 1080, orientation: 'square', falImageSize: 'square_hd', vmediaImage: '1_1' },
};

export const normalizeAspect = (a) => (a && ASPECTS[String(a).trim()] ? String(a).trim() : DEFAULT_ASPECT);
export const aspectInfo = (a) => ASPECTS[normalizeAspect(a)];

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
