from pathlib import Path

skill_dir = Path("/mnt/data/history-comparison-tiktok")
skill_dir.mkdir(parents=True, exist_ok=True)

content = r"""---
name: history-comparison-tiktok
description: Create engaging ~2-minute TikTok videos comparing two historical figures, especially Vietnamese vs Chinese figures. Use a hook-driven narrative, historical conflict, meaningful comparison, hypothetical matchup, verdict, and scene-by-scene narration suitable for Remotion/AI video production.
---

# History Comparison TikTok Skill

## 1. Purpose

Create short-form historical comparison content designed for TikTok.

Default format:
- Duration: ~2 minutes
- Language: Vietnamese
- Characters: 2 historical figures
- Preferred pairing: Vietnam vs China
- Scenes: 20–25
- Narration: optimized for voice-over
- Style: cinematic storytelling, concise, dramatic, easy to understand
- Goal: maximize curiosity, retention, and discussion without sacrificing historical accuracy

The video must feel like a historical "matchup", not a Wikipedia summary.

Core formula:

A + B
→ Hook
→ Setup
→ Background
→ Similarities
→ Differences
→ Hypothetical matchup
→ Verdict
→ CTA

---

# 2. Core principle

Do NOT simply write:

Character A biography
→ Character B biography
→ conclusion.

Instead, create a narrative that makes the audience continuously ask:

- Why are these two being compared?
- What makes them similar?
- What makes them different?
- Who would be better in a specific situation?
- What is the final verdict?

The viewer should feel like they are watching a historical battle of abilities.

---

# 3. Default 2-minute structure

Use this timing as a guideline.

## 0–8s — HOOK

The strongest part of the video.

The hook must:
- create curiosity immediately
- introduce a meaningful contrast
- avoid generic introductions
- avoid "Hôm nay chúng ta sẽ..."
- avoid excessive exposition

Good hook patterns:

### Contrast
"Một người nổi tiếng vì tốc độ. Một người nổi tiếng vì mưu lược. Nếu hai người đối đầu, ai đáng sợ hơn?"

### Hypothetical
"Nếu hai thiên tài quân sự này sống cùng thời, ai sẽ là người thắng?"

### Paradox
"Cả hai đều từng ở vị trí thấp. Nhưng cuối cùng, cả hai đều thay đổi lịch sử."

### Strong claim
"Quang Trung có thể đánh nhanh hơn Hàn Tín. Nhưng trong một cuộc chiến kéo dài, cán cân có thể đảo ngược."

Generate several possible hooks internally and choose the strongest one.

---

## 8–20s — CHARACTER SETUP

Introduce both figures quickly.

Each character should receive approximately 1–2 concise sentences.

Explain:
- who they were
- why they matter
- what makes the comparison interesting

Do not give full biographies.

---

## 20–40s — BACKGROUND

Select only historical events that support the comparison.

Focus on:
- origin
- turning point
- major challenge
- important achievement

Do not list dates unless they are useful to understanding the story.

Every historical fact should serve the narrative.

---

## 40–55s — SIMILARITIES

Identify 2–3 meaningful similarities.

Examples:
- both emerged during periods of political instability
- both started without absolute political power
- both demonstrated exceptional military ability
- both influenced the political order of their time

Do not use trivial similarities.

The similarities should make the audience think:

"These two really are comparable."

---

## 55–85s — DIFFERENCES

This is the main comparison section.

Use 3 strong dimensions.

Possible dimensions:

- strategic thinking
- battlefield tactics
- speed of decision-making
- ability to adapt
- leadership
- logistics
- psychological warfare
- use of terrain
- political influence
- relationship with soldiers
- ability to recover from setbacks
- scale and duration of campaigns

For each dimension:

1. Explain A briefly.
2. Explain B briefly.
3. State the meaningful difference.

Do not mechanically repeat:

"A thì..., B thì..."

Vary sentence structure.

Example:

"Quang Trung nổi bật ở tốc độ. Ông thường tìm cách tạo ra một đòn đánh đủ mạnh để kết thúc cục diện trước khi đối phương kịp ổn định.

Hàn Tín lại nguy hiểm theo cách khác. Ông có thể kéo đối thủ vào một thế trận mà chính họ không nhận ra mình đang bị dẫn dắt."

---

# 4. Hypothetical matchup

This is the entertainment engine of the format.

Never present speculation as historical fact.

Clearly signal hypothetical reasoning:

- "Nếu đặt họ vào cùng một chiến trường..."
- "Nếu giả định..."
- "Trong một kịch bản giả định..."
- "Nếu chỉ xét riêng khả năng..."

Break the matchup into conditions.

Example:

### Short decisive battle
Advantage may go to the figure with:
- speed
- shock tactics
- decisive leadership
- rapid mobilization

### Long campaign
Advantage may go to the figure with:
- logistics
- adaptation
- deception
- patience
- strategic depth

Do not force one universal winner if the evidence does not support it.

A nuanced verdict is often more interesting.

---

# 5. Verdict

The conclusion must be specific.

Avoid:

"Cả hai đều là những vị tướng tài ba."

Instead, use conditional verdicts:

"Nếu xét tốc độ và khả năng tạo đột biến: Quang Trung nhỉnh hơn.

Nếu xét nghệ thuật điều binh và khả năng biến thế yếu thành thế mạnh: Hàn Tín có lợi thế.

Vì vậy, nếu chỉ được chọn một người cho một trận đánh quyết định trong vài ngày, tôi nghiêng về Quang Trung."

The verdict must follow the comparison instead of appearing arbitrary.

---

# 6. CTA

End with a discussion question.

Good CTA:

- "Nếu chỉ được chọn một người làm tổng tư lệnh, bạn chọn ai?"
- "Bạn nghĩ ai sẽ thắng trong một trận chiến kéo dài?"
- "Quang Trung hay Hàn Tín?"
- "Nếu có thể thêm một nhân vật khác vào cuộc so sánh, bạn chọn ai?"

Do not use generic:
"Like và follow để xem phần tiếp theo."

The CTA should encourage an opinion.

---

# 7. Narration style

The narration must sound natural when spoken aloud.

Rules:
- prefer short and medium sentences
- vary sentence length
- use strong verbs
- avoid academic language
- avoid excessive adjectives
- avoid unnecessary dates
- avoid repetitive sentence patterns
- use pauses naturally
- emphasize important statements with short standalone sentences

Preferred rhythm:

Short sentence.
Explanation.
Short sentence.
Payoff.

Example:

"Ông thất bại.

Không chỉ một lần.

Nhưng điều đáng sợ là sau mỗi lần thất bại, ông lại trở nên nguy hiểm hơn."

---

# 8. Storytelling transitions

Use transitions to maintain retention.

Useful concepts:
- "Nhưng đây mới là điểm đáng nói."
- "Và chính lúc này, mọi thứ thay đổi."
- "Nhưng nếu chỉ nhìn như vậy thì chưa đủ."
- "Điểm khác biệt thực sự nằm ở đây."
- "Và đây là lúc hai người bắt đầu khác nhau."
- "Nhưng nếu cuộc chiến kéo dài thì sao?"

Do not overuse exact phrases.
Vary wording naturally.

---

# 9. Historical accuracy

Historical accuracy has priority over dramatic storytelling.

Rules:
- never invent events
- never fabricate quotes
- never present legends as certain facts
- distinguish historical evidence from later tradition
- distinguish historical fact from hypothetical comparison
- do not exaggerate achievements
- do not claim certainty where historians reasonably disagree

For speculative matchup sections, explicitly frame the reasoning as hypothetical.

If the user provides facts that appear questionable, flag the issue rather than silently repeating it.

---

# 10. Avoid nationalism bait

The Vietnam vs China format can create engagement, but avoid shallow nationalism.

Do not write:
- "Người Việt luôn giỏi hơn người Trung Quốc."
- "Tướng Trung Quốc không thể thắng."
- "Việt Nam đánh bại Trung Quốc nên nhân vật Việt Nam chắc chắn mạnh hơn."

Instead compare:
- military context
- available resources
- strategic conditions
- tactical strengths
- campaign objectives
- historical circumstances

The goal is compelling historical analysis, not rage bait.

---

# 11. Scene design

Default to 20–25 scenes for ~2 minutes.

A recommended structure:

Scene 1–3:
HOOK

Scene 4–5:
CHARACTER INTRODUCTION

Scene 6–9:
BACKGROUND

Scene 10–11:
SIMILARITIES

Scene 12–17:
DIFFERENCES

Scene 18–21:
HYPOTHETICAL MATCHUP

Scene 22–23:
VERDICT

Scene 24:
CTA

Adjust scene count based on narration length.

Do not force exactly 24 scenes if the narration becomes unnatural.

---

# 12. Scene narration

Each scene should normally contain:
- one clear idea
- one visualizable moment
- 1–2 spoken sentences

Avoid putting multiple unrelated ideas into one scene.

A scene should be easy to turn into:
- an image
- a camera movement
- a character pose
- a battlefield shot
- a map shot
- a symbolic visual

---

# 13. Visual thinking

When generating narration, think visually.

Prefer:

"Quân đội tiến qua màn đêm."

over:

"Ông có khả năng lãnh đạo quân đội rất tốt."

Prefer:

"Hàng vạn quân lính di chuyển trong đêm, không để đối phương kịp chuẩn bị."

over:

"Ông có chiến thuật đánh bất ngờ rất hiệu quả."

Narration should naturally suggest visuals for AI image/video generation.

---

# 14. Visual variety

For a ~2-minute video, avoid showing the same static portrait repeatedly.

Rotate between:

- character close-up
- character full body
- battlefield
- marching army
- map
- strategic planning
- confrontation
- symbolic scene
- reaction
- victory
- aftermath

Use close-ups for emotion and key statements.

Use wide shots for scale.

Use maps or diagrams for strategic explanations.

---

# 15. Retention rules

Every 5–10 seconds, introduce at least one of:

- new information
- contrast
- question
- visual change
- escalation
- surprising fact
- strategic dilemma
- mini payoff

Avoid long stretches of pure exposition.

Use "open loops":

"Nhưng đây chưa phải lợi thế lớn nhất của ông."

Then resolve the idea later.

---

# 16. Information density

For ~2 minutes:

Target approximately:
- 250–330 Vietnamese words depending on speaking speed
- 20–25 scenes
- 1 major idea per scene
- 3 comparison dimensions
- 1 hypothetical scenario
- 1 final verdict

Do not sacrifice clarity just to increase information density.

---

# 17. Output format

When the user asks for a scene-based script, default to:

[
  {
    "scene": 1,
    "narration": "",
    "char": "char-a"
  }
]

Allowed `char` values:

- `"char-a"` — narration mainly about character A
- `"char-b"` — narration mainly about character B
- `"both"` — both characters or direct comparison
- `"none"` — environment, battle, map, symbolic scene

If the user provides a different schema, follow that schema exactly.

If the user asks for narration only, output only narration.

If the user asks for JSON:
- return valid JSON
- no markdown
- no comments
- no explanation outside JSON

---

# 18. Internal writing workflow

Before producing the final output, internally perform:

### Step 1 — Identify the matchup
Who are A and B?

### Step 2 — Find the comparison axis
What makes this matchup interesting?

Examples:
- speed vs strategy
- conqueror vs strategist
- rebel leader vs empire builder
- defensive genius vs offensive genius
- battlefield commander vs political founder

### Step 3 — Generate 3 hooks
Choose the most curiosity-driven one.

### Step 4 — Select historical facts
Keep only facts that support the comparison.

### Step 5 — Build the conflict
Define where A has the advantage and where B has the advantage.

### Step 6 — Build the hypothetical scenario
Specify the conditions.

### Step 7 — Determine the verdict
Make the verdict evidence-based and conditional when necessary.

### Step 8 — Convert into scenes
Ensure each scene has one clear purpose.

### Step 9 — Rewrite for spoken delivery
Remove robotic, academic, repetitive, or overly long sentences.

### Step 10 — Final quality check
Check:
- hook strength
- historical accuracy
- logical comparison
- natural narration
- pacing
- scene count
- visualizability
- verdict consistency
- CTA quality

---

# 19. Quality checklist

Before final output, verify:

- [ ] The first 8 seconds create curiosity.
- [ ] The two characters are introduced quickly.
- [ ] The video does not read like two biographies.
- [ ] Similarities are meaningful.
- [ ] Differences are specific.
- [ ] There are approximately 3 comparison dimensions.
- [ ] Hypothetical claims are clearly marked as hypothetical.
- [ ] The verdict follows the evidence.
- [ ] Narration sounds natural when spoken.
- [ ] Scenes are visually useful.
- [ ] There is a meaningful CTA.
- [ ] No fabricated historical facts or quotes.
- [ ] No shallow nationalist bait.
- [ ] No unnecessary exposition.
- [ ] No generic "Hôm nay chúng ta sẽ..." introduction.

---

# 20. Example matchup logic

For:

Quang Trung vs Hàn Tín

Possible central concept:

"Speed vs strategic deception"

Potential structure:

Hook:
"Quang Trung thắng bằng tốc độ. Hàn Tín thắng bằng cách khiến đối thủ không biết mình đang thua."

Then:
- establish both
- compare origins
- compare military environments
- compare decisive campaigns
- compare battlefield styles
- hypothetical short war
- hypothetical prolonged war
- verdict by condition
- audience question

Do not blindly copy this example.
Generate a fresh narrative for every matchup.
"""

path = skill_dir / "SKILL.md"
path.write_text(content, encoding="utf-8")

print(path)
print(f"Size: {path.stat().st_size:,} bytes")
