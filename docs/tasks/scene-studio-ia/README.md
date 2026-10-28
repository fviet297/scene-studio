# Task: Scene Studio — kiến trúc thông tin (vòng 2)

Cập nhật lần cuối: 2026-10-28. Nhánh `feat/gia-long-prompt-rewrite`, **chưa commit** (diff nằm trong working tree).

## Mục tiêu

Tiếp tục tối ưu Scene Studio (`npm run review`) theo yêu cầu "tối ưu cái đã có, không thêm tính năng, không bỏ tính năng",
sau vòng 1 ở `../scene-studio-ux/` (commit `692683f`, `78cfdc1`). Vòng này:

1. Audit lại toàn bộ inventory với code, ghi chỗ lệch.
2. Làm rõ phạm vi batch, gom cài đặt dự án về một chỗ, gộp dialog Style + Template.
3. Làm 2 mục inventory có nhưng code chưa có (user chốt "làm luôn"): **độ dài tối thiểu của scene** và **gợi ý AI cho hồ sơ
   nhân vật**. Mục dịch tiếng Việt trực tiếp: user chốt **bỏ qua**.
4. Chạy regression thật trên dự án test, gồm cả luồng tốn phí (user chốt "chạy thật"; sau đó chốt "chỉ gọi muse để test").

**Không đổi kiến trúc.** Vẫn vanilla HTML/CSS/JS, giữ mọi `id` nút, API cũ giữ hợp đồng. Đọc `../scene-studio-ux/README.md`
và `decisions.md` (D1–D9) trước khi sửa tiếp.

## Bố cục sau vòng này

```
Hàng 1 — ngữ cảnh
[Scene Studio] [Dự án ▾][Dự án mới] │ [16:9▾][Style▾][Giọng▾][Cài đặt dự án ▾] │ services … [Ứng dụng ▾]
                                                             ├ Style & template
                                                             └ Logo & watermark
Hàng 2 — công việc
[Timeline | Bàn làm việc] │ [Kịch bản] [Đóng gói ▾] … tiến độ Ảnh/Audio/Motion │ [Mở MP4] [Render MP4]
```

| Thay đổi                       | Trước (sau vòng 1)                      | Sau vòng 2                                                                             |
| ------------------------------ | --------------------------------------- | -------------------------------------------------------------------------------------- |
| Kịch bản                       | Menu Dự án ▾ (hàng 2)                   | Nút trực tiếp hàng 2                                                                   |
| Style DNA, version             | Dialog **Style** riêng                  | Dialog **Style & template** (hàng version trên cùng)                                   |
| 5 template ảnh + motion system | Dialog **Template prompt** riêng        | Cùng dialog; prompt hệ thống motion trong mục **Nâng cao**                             |
| Logo & watermark               | Menu Dự án ▾ (hàng 2)                   | Menu **Cài đặt dự án ▾** (hàng 1, cạnh tỉ lệ / style / giọng)                          |
| Menu Dự án ▾                   | Hàng 2                                  | **Bỏ** — các mục chia về Kịch bản + Cài đặt dự án                                      |
| Loại prompt cho batch ở rail   | Đọc ngầm từ ô ở Timeline (view đang ẩn) | Ô chọn riêng trong batch bar rail, đồng bộ 2 chiều                                     |
| Nút batch (2 bar)              | Không nói chạy cho bao nhiêu scene      | Số scene **đủ điều kiện** ngay trên nút (vd. chọn 3, chỉ 2 scene AI → `Ảnh 2`)         |
| Nhân vật ở rail                | Lẫn trong vùng cuộn danh sách scene     | Mục thu gọn **Nhân vật dự án (n)**, nhớ trạng thái mở/đóng                             |
| Inspector                      | Tiêu đề "Chi tiết scene"                | "Scene N"; dưới narration ghi `Giọng: <tên>` (chỉ đọc)                                 |
| Dialog Ảnh / Motion            | Không có đường tới cài đặt dự án        | Trong "Nâng cao": link mở Style & template đúng ô (Style DNA / prompt hệ thống motion) |
| **Mới — độ dài tối thiểu**     | Không có                                | Ô **Tối thiểu (giây)** cạnh Tiêu đề; field `duration:` trong scene-plan                |
| **Mới — gợi ý AI hồ sơ**       | Không có                                | Nút **Gợi ý bằng AI** trong dialog Hồ sơ nhân vật — chỉ điền ô trống, chưa lưu         |

## File đã đổi

| File                                            | Thay đổi                                                                                                                                        |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/review-panel.html`                     | Topbar, dialog gộp, ô loại prompt rail, số đếm batch, mục nhân vật, ô duration, nút gợi ý hồ sơ, link                                           |
| `scripts/review-panel.css`                      | Style cho các phần trên (dùng token có sẵn); bỏ `.style-dialog`                                                                                 |
| `scripts/review-panel.js`                       | `TEMPLATE_FIELDS` một danh sách, `openTemplateDialog(field)`, `showBatchCounts`, đồng bộ loại prompt, duration, `profileFormPatch`, gợi ý hồ sơ |
| `scripts/review-script-gen.js`                  | Ghi `Giọng: <tên>` vào inspector khi điền ô giọng                                                                                               |
| `scripts/review-timeline.js`                    | Preview Nháp tính độ dài tối thiểu                                                                                                              |
| `scripts/review-server.mjs`                     | State trả `duration`; `/api/scene-field` nhận `duration`; motion đặt độ dài theo max(audio, tối thiểu); `POST /api/character-suggest`           |
| `scripts/build-remotion.mjs`                    | Độ dài scene khi render đi qua `sceneContentSeconds`                                                                                            |
| `scripts/lib/scene-timing.mjs` (mới)            | Quy tắc độ dài scene + parse `duration:`                                                                                                        |
| `scripts/lib/profile-writer.mjs` (mới)          | LLM gợi ý hồ sơ nhân vật                                                                                                                        |
| `scripts/lib/parse-plan.mjs`, `plan-writer.mjs` | Đọc/ghi field `duration`; **sửa lỗi có sẵn**: thêm nhân vật vào plan thiếu khối `## characters`                                                 |
| `scripts/lib/*.test.mjs` (3 file mới)           | `scene-timing`, `profile-writer`, `plan-writer`                                                                                                 |

## Cách dùng bộ tài liệu này

| Tài liệu          | Nội dung                                                              |
| ----------------- | --------------------------------------------------------------------- |
| `requirements.md` | Inventory đã đối chiếu, chỗ lệch, bản đồ vị trí cho **mọi** tính năng |
| `decisions.md`    | D10–D19 (nối tiếp D1–D9 của vòng 1)                                   |
| `progress.md`     | Trạng thái, kết quả regression thật từng luồng, chi phí đã tiêu       |
| `handoff.md`      | Việc tiếp theo, dữ liệu test còn để lại, điểm dễ vấp                  |
