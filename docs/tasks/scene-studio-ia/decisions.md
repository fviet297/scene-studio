# Decisions — Scene Studio IA (vòng 2)

Định dạng: quyết định / bối cảnh / hệ quả. Số nối tiếp vòng 1 (`../scene-studio-ux/decisions.md` dừng ở D9), nên quyết định
đầu tiên của vòng này là **D10**. D1 (giữ `id`, dialog, API) vẫn có hiệu lực. **D9 bị thay bằng D15.**

## D10 — Cài đặt dự án về hàng 1, Kịch bản thành nút trực tiếp (user chốt 2026-10-28)

- **Bối cảnh**: sau vòng 1, cấu hình dự án nằm 2 nơi: tỉ lệ / style / giọng ở hàng 1, Style / Template / Logo trong menu Dự án
  ở hàng 2, chung menu với Kịch bản (nội dung, không phải cấu hình).
- **Quyết định**: menu **Cài đặt dự án ▾** ở hàng 1, ngay sau 3 ô chọn (Style & template, Logo & watermark). Kịch bản thành nút
  trực tiếp ở hàng 2. Bỏ menu Dự án ▾. Giữ `menuProjectBtn` / `menuProject` cho menu mới.
- **Hệ quả**: hàng 1 = mọi thứ cấp dự án/app, hàng 2 = nội dung + sản xuất. Ở 1024 px hàng 1 wrap (đã có từ vòng 1), không cuộn
  ngang. `review-script-gen.js` vẫn gọi `$("btnScript").click()` sau khi viết kịch bản AI — đã kiểm vẫn mở.

## D11 — Gộp dialog Style và Template prompt (user chốt 2026-10-28)

- **Bối cảnh**: một style version gói Style DNA + 5 template + prompt hệ thống motion, nhưng sửa ở 2 dialog, 2 nút Lưu. Nút
  "Tạo version" (dialog Style) đọc cả 6 ô của dialog Template **đang ẩn**, kể cả chỗ sửa chưa lưu.
- **Quyết định**: một dialog `#tplOverlay` "Style & template": hàng version trên cùng, rồi Style DNA, 5 template, mục Nâng cao
  (`<details>`) chứa prompt hệ thống motion. Một nút Lưu ghi `TEMPLATE_FIELDS` (một danh sách thay cho `STYLE_FIELDS` +
  `PROMPT_FIELDS`). Xoá `#styleOverlay`, `#btnStyle`, `#styleSave`, `#styleReload`, `#styleClose`.
- **Hệ quả**: body `POST /api/templates` không đổi dạng, chỉ luôn gửi đủ 6 field. Server vẫn giữ giá trị cũ cho field trống
  (không xoá trắng được một ô — như trước). `openTemplateDialog(fieldId)` mở đúng ô, tự bung Nâng cao nếu ô nằm trong đó.

## D12 — Số scene đủ điều kiện hiện trên nút batch

- **Bối cảnh**: audit tưởng phạm vi batch bị ẩn, thực tế Timeline đã ghi "Chưa chọn · chạy cho scene N" và batch bar rail chỉ
  hiện khi có tick. Chỗ còn mờ: chọn 3 scene nhưng chỉ 2 scene AI thì nút Ảnh chạy 2, không ai biết trước.
- **Quyết định**: `showBatchCounts()` ghi số vào `[data-count-for]` trong nút Prompt / Ảnh / Audio / Motion của cả 2 bar, lấy
  đúng biến mà `renderSelection()` dùng để bật/tắt nút. Nút tắt thì không hiện số. Có `aria-description`.
- **Hệ quả**: không đổi `batchTargets()` hay điều kiện chạy.

## D13 — Ô loại prompt riêng ở batch bar rail

- **Bối cảnh**: nút Prompt ở rail đọc loại (ảnh / motion / cả hai) từ `#batchPromptKind` nằm ở Timeline — view đang ẩn khi dùng rail.
- **Quyết định**: thêm `#railPromptKind`, đồng bộ 2 chiều với `#batchPromptKind`. `promptKind()` vẫn chỉ đọc
  `#batchPromptKind` (một nguồn). Nhãn rail ngắn ("Cả hai") vì cột hẹp; xác nhận ghi đè vẫn dùng nhãn đầy đủ của Timeline.

## D14 — Độ dài scene là **mức tối thiểu** (user chốt 2026-10-28)

- **Bối cảnh**: inventory có "sửa duration"; code không có. 3 phương án: tối thiểu / cố định (cắt narration) / chỉ lưu độ dài motion.
- **Quyết định**: field `duration:` (giây) trong scene-plan. Scene dài = max(audio, clip, duration); scene chưa có audio dùng
  duration thay placeholder 4 s. Không bao giờ cắt narration. Quy tắc ở một chỗ: `scripts/lib/scene-timing.mjs`
  (`sceneContentSeconds`, `parseMinDuration`), dùng bởi `build-remotion.mjs`; `review-timeline.js` (trình duyệt) nhân bản quy
  tắc, có comment trỏ về. Sinh motion (đơn và batch) đặt độ dài theo max(audio, duration), log ghi rõ khi duration dài hơn audio.
- **Ràng buộc**: 0 < duration ≤ 600; nhận "8", "7.5s", "4,5". Ô trống → xoá field. Giá trị sai → server trả 400, không ghi.
  Parser gặp giá trị sai trong file → cảnh báo và bỏ qua.
- **Hệ quả**: không chạm JSON import/export (field vắng thì không bị đụng). Gộp scene giữ duration của scene được giữ lại.
  Clip ngắn hơn scene vẫn bị làm chậm cho phủ hết (hành vi cũ) — đặt duration lớn sẽ làm clip chậm nhiều.

## D15 — Gợi ý AI cho hồ sơ nhân vật: chỉ điền ô trống, không tự lưu (user chốt 2026-10-28, thay D9)

- **Quyết định**: `POST /api/character-suggest { id, current }` → `scripts/lib/profile-writer.mjs` (một lượt `chatJson`, LLM
  cấu hình `LLM_*`). Đầu vào: tên, hồ sơ hiện có, narration các scene có nhân vật (không có scene nào → cả kịch bản). Ngôn ngữ
  từng field theo `script-writer.mjs` (tên khác có dấu; quốc gia / thời kỳ / triều đại / vai trò / dữ kiện tiếng Anh; ngoại hình
  tiếng Anh 40–80 từ → `interpretation`). Panel chỉ điền **ô đang trống**, báo số ô đã điền; người dùng bấm Lưu hồ sơ như cũ.
- **Hệ quả**: server không ghi gì. Mô tả ngoại hình vừa gợi ý tự điền sẵn vào dialog Tạo ảnh nhân vật (hành vi cũ đọc
  `interpretation`).

## D16 — Dịch tiếng Việt trực tiếp: không làm (user chốt 2026-10-28)

Nút Dịch giữ nguyên: hiện bản `*_vi` đã lưu. Prompt tự sửa / template tự tạo vẫn báo "Chưa có bản dịch".

## D17 — Sửa lỗi có sẵn: thêm nhân vật vào plan thiếu khối `## characters`

- **Bối cảnh**: regression tạo dự án thủ công từ scene-plan dán tay không có `## characters` → "Thêm nhân vật" lỗi
  `scene-plan.md has no "## characters" block`. Luồng đang được hỗ trợ bị gãy.
- **Quyết định**: `addCharacterToPlan` tự mở khối `## characters` ngay trước scene đầu tiên (hoặc cuối file). Có test.

## D18 — Regression thật trên dự án test, chỉ gọi muse cho ảnh / motion (user chốt 2026-10-28)

- Dữ liệu test ở dự án riêng (`zz-ia-regression`, `zz-ia-script-ai`), không đụng `gia-long-p3`.
- File dùng chung bị test ghi (`scripts/prompt-templates.json`, `data/models.json`, `projects/output-dir.json`) được sao lưu
  trước và trả lại sau; MP4 test render vào `tmp/ia-out/` để không lẫn vào thư mục iCloud.
- Từ giữa đợt test: ảnh / motion chỉ gọi `muse:muse-image`, `muse:muse-video`. Trước mốc đó đã dùng `meta:muse-image-1.0`
  (xem `progress.md`).

## D19 — Không sửa: `fetch failed` ~60 s khi viết prompt cho scene nhiều nhân vật

- **Bối cảnh**: `prompt-writer.mjs` gọi thẳng `api.openai.com` (gpt-5, không stream). Scene 2 nhân vật: qua server lỗi
  `fetch failed` đúng ~61 s (3/3 lần); gọi hàm trực tiếp từ terminal thành công ở 55,5 s.
- **Quyết định**: ngoài phạm vi (không do vòng này gây ra). Ghi vào `handoff.md`.
