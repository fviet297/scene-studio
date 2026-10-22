# New comparison project

Fastest route: in the review panel, **Dự án mới → Từ yêu cầu (AI)** — describe the video, pick the
scene count and the OmniVoice voice, and an LLM (`LLM_*` in `.env`) writes the narration, the cast
(with profiles) and every scene's image + motion prompt into a new project. Then give each character
a reference image with **Tạo ảnh** on its card (from a description or from an image). The manual
route:

1. Copy this directory: `cp -r projects/_template projects/<slug>` (slug: lowercase, `a-z0-9-`).
2. Edit `projects/<slug>/scene-plan.md`: title, `## characters` (id = path to each reference PNG), and each `## scene N` block (`title/cue/host/narration/char/prompt`). Narration can also be pasted as JSON from the review panel once the project is active.
3. Drop each character's reference PNG into `public/projects/<slug>/characters/` at the path named in the `## characters` block.
4. Add `projects/<slug>/characters/<id>/profile.json` for each character (copy the shape from an existing project; `display_name` drives the label shown in the panel gallery and Remotion puppet preview).
5. Make the project active: pick it from the dropdown in the review panel (or create it there via "New project"), or set `projects/active.json` to `{ "active": "<slug>" }`.
6. Have prompts but not written? In the panel, per scene use "Generate prompt from narration" (Inspector), or select several scenes in the contact sheet and hit "Generate prompts" — both call OpenAI (needs `OPENAI_API_KEY` in `.env`) and follow the house prompt-writing rules (action/setting only, never appearance; physical + cultural continuity). CLI equivalent: `node scripts/generate-prompts.mjs`.
7. Run the rest of the pipeline: `node scripts/generate-visuals.mjs` (or the panel) → approve → generate audio → `node scripts/generate-puppet-references.mjs` for the character gallery's v2 puppets → finalize/render.
