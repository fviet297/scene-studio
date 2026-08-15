# BỘ PROMPT — CHIBI LỊCH SỬ VIỆT NAM (Game Asset Style)

---

## 1. PHÂN TÍCH PHONG CÁCH (Style DNA)

| Yếu tố | Đặc điểm trong ảnh |
|---|---|
| **Thể loại** | Chibi 2D vector, game sprite sheet / mobile game asset |
| **Tỉ lệ** | ~2.5–3 đầu (head-to-body), đầu to tròn, thân ngắn, tay chân mập lùn, bàn tay không ngón rõ |
| **Nét viền** | Line art đồng đều, dày vừa, màu **nâu đen đậm** (không phải đen tuyệt đối), khép kín, sạch |
| **Đổ bóng** | Cel-shading phẳng, 1–2 tầng bóng, không gradient mềm, không highlight bóng loáng |
| **Bảng màu** | Đỏ son, vàng kim/hoàng thổ, xanh lam ngọc, xanh olive, tím trầm, nâu da thuộc — độ bão hòa trung bình, hơi "vintage" |
| **Khuôn mặt** | Mắt hạnh nhân nhỏ có tròng đen, lông mày đen dày sắc, mũi chấm nhỏ, miệng nhỏ, biểu cảm nghiêm nghị / kiên định |
| **Trang phục** | Giáp lam (lamellar), giáp vảy, giáp hộ tâm kính, hộ kiên đầu rồng/thú, khăn đóng, mũ trụ chóp, áo dài the, nón lá |
| **Bố cục** | Full body, chính diện hoặc 3/4, đứng trên nền trắng, **không bóng đổ dưới chân** hoặc bóng rất nhẹ |
| **Nền** | Trắng tinh / trong suốt, tách rời hoàn toàn khỏi nhân vật |
| **Chữ** | Nhãn in hoa dưới mỗi nhân vật, sans-serif hình học |

---

## 2. MASTER PROMPT (dùng cho mọi nhân vật)

> Thay phần `[...]` bằng mô tả nhân vật của bạn.

```
Chibi-style 2D vector game character illustration of [MÔ TẢ NHÂN VẬT],
Vietnamese historical theme.

STYLE: cute chibi proportions, 2.5-head tall, oversized round head, short
stubby body and limbs, simple mitten-like hands. Clean flat vector art with
bold uniform dark-brown outlines. Flat cel-shading with one soft shadow tone,
no gradients, no glossy highlights, no texture noise.

FACE: small almond-shaped eyes with dark pupils, thick sharp black eyebrows,
tiny dot nose, small mouth, determined serious expression.

COLOR: muted-saturated historical palette — crimson red, antique gold, ochre,
teal blue, olive green, deep purple accents, tanned leather brown.

DETAILS: authentic ancient Vietnamese design — lamellar/scale armor, ornate
beast-head shoulder pauldrons, round chest mirror plate, layered silk robes,
conical or cloth headwear, traditional patterns.

COMPOSITION: full body, front-facing (or slight 3/4 view), standing centered,
isolated on pure white background, no shadow on ground, no scenery,
no text, no watermark.

Mobile game character asset, sprite sheet style, high detail, crisp lines,
consistent art direction.
```

---

## 3. BIẾN THỂ THEO CÔNG CỤ

### 3.1 Midjourney / Niji

```
chibi 2D vector game character, [MÔ TẢ NHÂN VẬT], ancient Vietnamese warrior
design, oversized head 2.5 head-tall proportions, bold dark brown outlines,
flat cel shading, muted crimson gold teal olive palette, lamellar armor with
beast-head pauldrons, determined expression, full body front view, isolated
on pure white background, mobile game sprite sheet asset
--style raw --ar 2:3 --v 7 --s 150
```

### 3.2 Nano Banana / ChatGPT / Gemini (mô tả tự nhiên)

```
Vẽ nhân vật chibi phong cách game 2D vector: [MÔ TẢ NHÂN VẬT].
Tỉ lệ chibi 2.5 đầu, đầu to tròn, thân ngắn mập. Nét viền nâu đen dày đều,
tô màu phẳng cel-shading 1 tầng bóng, không gradient. Bảng màu đỏ son – vàng
kim – xanh ngọc – olive – nâu da. Giáp lam cổ Việt Nam, hộ kiên đầu thú,
hoa văn truyền thống. Mắt hạnh nhân nhỏ, lông mày đen sắc, biểu cảm nghiêm nghị.
Toàn thân, chính diện, nền trắng hoàn toàn, không bóng đổ, không chữ.
Đồng bộ như một bộ sprite sheet game mobile.
```

### 3.3 Stable Diffusion / Flux (+ Negative)

```
POSITIVE:
(chibi character:1.3), 2D vector game asset, ancient Vietnamese general,
[MÔ TẢ], 2.5 head tall, big round head, stubby limbs, bold dark brown
lineart, flat cel shading, muted crimson gold teal palette, lamellar armor,
beast pauldrons, serious face, full body, front view, white background,
masterpiece, clean lines

NEGATIVE:
realistic, 3d render, photo, gradient shading, glossy, soft blur, background
scenery, shadow on floor, text, watermark, extra limbs, deformed hands,
long legs, adult proportions, anime moe, sexy, modern clothing
```

---

## 4. PROMPT MẪU CHO TỪNG LOẠI NHÂN VẬT

> Ghép phần dưới vào chỗ `[MÔ TẢ NHÂN VẬT]` của Master Prompt.

### Nhân vật chính (Anh hùng)

| Mẫu | Mô tả điền vào |
|---|---|
| **Đại tướng chỉ huy** | `a stern bearded general in ornate multicolored lamellar armor with golden dragon-head shoulder guards, red-plumed helmet, one arm pointing forward commandingly, holding a jade seal` |
| **Tướng cầm giáo** | `a mustached commander in crimson-and-gold scale armor, black cloth turban headwrap, holding a long spear upright in one hand` |
| **Hoàng đế cưỡi ngựa** | `an emperor riding a tan warhorse with red tassels, wearing blue and gold imperial armor, yellow head scarf, raising a curved sword high` |
| **Văn thần / quân sư** | `a young scholar in a pale blue-and-teal silk robe, black square scholar hat, holding a brush and a paper scroll, calm intelligent expression` |
| **Nữ tướng** | `a female warrior in flowing crimson-and-gold armored dress, red phoenix crown headdress, long black hair, holding a straight sword at her side` |
| **Vua khởi nghĩa** | `a king in full golden-yellow armor with square chest plate, yellow head cloth, green cape, holding a long straight sword pointing down` |

### Nhân vật phụ (Quân lính & dân)

| Mẫu | Mô tả điền vào |
|---|---|
| **Bộ binh** | `a foot soldier in orange-brown padded armor, holding a spear and a round wooden shield` |
| **Cung thủ** | `an archer in green tunic and leather armor, top-knot hair, drawing a bow with an arrow nocked` |
| **Kiếm sĩ** | `a swordsman in dark blue tunic, black head wrap, holding a short curved sword ready to strike` |
| **Giáo binh** | `a spearman in grey iron helmet and green-purple layered armor, holding a long spear upright` |
| **Tướng giặc (phản diện)** | `an enemy invader general in dark grey heavy armor with red cape and horned helmet, aggressive scowling face, holding a broad sword` |
| **Voi chiến** | `a grey war elephant with red and gold decorated howdah carrying two tiny armored soldiers with spears, side view` |
| **Kỵ binh** | `a cavalry soldier on a brown horse, iron helmet, holding spear and shield, side view` |
| **Dân làng** | `a peasant villager in simple brown clothes and a conical straw hat, carrying two baskets on a shoulder pole` |

### Hành động (Action set — giữ nguyên 1 nhân vật)

Dùng để tạo **sprite động** cho cùng một nhân vật:

```
Same character, same outfit, same art style, sheet of 6 poses on white
background: 1) idle standing, 2) walking side view, 3) running,
4) attacking with sword raised, 5) defending behind shield,
6) victory pose with sword raised high and sparkle marks.
Consistent proportions and colors across all poses.
```

### Vũ khí & đạo cụ (Item icons)

```
Set of flat 2D vector game item icons in the same chibi art style:
straight sword, long spear, wooden bow, round bronze shield with pattern,
red war banner with gold character, war drum on wooden stand,
Vietnamese dragon-prow war boat with sail.
Bold dark brown outlines, flat cel shading, muted historical palette,
isolated on pure white background, no text.
```

---

## 5. PROMPT TẠO NGUYÊN BỘ SPRITE SHEET (như ảnh gốc)

```
A single character sheet image showing 6 chibi Vietnamese historical
characters in a row on a pure white background, all in the exact same art
style: 2D flat vector, 2.5-head chibi proportions, bold dark-brown outlines,
flat cel shading, muted crimson-gold-teal-olive palette, ancient Vietnamese
lamellar armor and silk robes, serious determined faces, full body front view,
evenly spaced, no shadows, no background elements.
Characters: [liệt kê 6 nhân vật].
Mobile game asset sheet, consistent art direction, clean and crisp.
```

---

## 6. MẸO GIỮ ĐỒNG BỘ (Style Consistency)

1. **Khoá "style block"** — luôn copy nguyên khối STYLE / FACE / COLOR / COMPOSITION, chỉ đổi phần mô tả nhân vật.
2. **Dùng ảnh tham chiếu**: Midjourney `--sref <link ảnh>` hoặc `--cref` cho nhân vật; Nano Banana/Gemini thì upload ảnh gốc + ghi "giữ nguyên phong cách trong ảnh này, chỉ đổi nhân vật thành...".
3. **Sinh từng nhân vật một** trên nền trắng rồi ghép sheet thủ công → sắc nét hơn sinh cả bảng cùng lúc.
4. **Cố định seed** (SD/Flux) hoặc dùng cùng một session chat để model nhớ style.
5. **Chốt bảng màu bằng mã hex** nếu công cụ hỗ trợ:
   `#B32C2C` đỏ son · `#D9A441` vàng kim · `#3E7B78` xanh ngọc · `#5C7A3F` olive · `#6B4A7A` tím trầm · `#7A5230` nâu da · `#2E2118` nâu viền
6. **Luôn thêm negative**: `no shadow on ground, no background, no text` — nếu không, AI hay thêm bóng và nền xám.
7. **Tỉ lệ khung**: 2:3 hoặc 1:1 cho nhân vật đơn; 16:9 hoặc 3:2 cho cả sheet.
