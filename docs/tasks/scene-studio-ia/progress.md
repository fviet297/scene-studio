# Progress — Scene Studio IA (vòng 2)

Cập nhật: 2026-10-28.

## Trạng thái

| Hạng mục                                                           | Trạng thái                   |
| ------------------------------------------------------------------ | ---------------------------- |
| Audit inventory ↔ code, chỗ lệch, bản đồ vị trí                    | **Xong** — `requirements.md` |
| P1 — số scene trên nút batch, ô loại prompt rail, "Scene N", giọng | **Xong** (D12, D13)          |
| P2 — Cài đặt dự án ▾ hàng 1, Kịch bản thành nút                    | **Xong** (D10)               |
| P3 — gộp Style + Template                                          | **Xong** (D11)               |
| P4 — link theo ngữ cảnh, mục Nhân vật dự án thu gọn                | **Xong**                     |
| Độ dài tối thiểu của scene                                         | **Xong** (D14)               |
| Gợi ý AI cho hồ sơ nhân vật                                        | **Xong** (D15)               |
| Dịch trực tiếp                                                     | **Bỏ** (D16)                 |
| Sửa lỗi thêm nhân vật khi plan thiếu `## characters`               | **Xong** (D17)               |
| Regression thật                                                    | **Xong** — bảng dưới         |
| Commit                                                             | **Chưa** — chờ user          |
| Safari / Firefox, thiết bị thật, VoiceOver                         | Chưa                         |

## Baseline

| Mục                                  | Giá trị                                                         |
| ------------------------------------ | --------------------------------------------------------------- |
| Commit                               | `78cfdc1` (nhánh `feat/gia-long-prompt-rewrite`)                |
| `node --test scripts/lib/*.test.mjs` | 55 pass                                                         |
| Console panel khi tải trang          | 1 issue có sẵn: "No label associated with a form field" (2 chỗ) |

## Test tự động

`node --test scripts/lib/*.test.mjs` → **69 pass, 0 fail** (55 cũ + 14 mới).

| File mới                  | Phủ                                                                                                            |
| ------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `scene-timing.test.mjs`   | audio/clip/placeholder, tối thiểu không cắt narration, parse "8" / "7.5s" / "4,5", từ chối 0 / âm / chữ / >600 |
| `profile-writer.test.mjs` | request chỉ trích scene có nhân vật, fallback cả kịch bản, chuẩn hoá trả lời, từ chối trả lời rỗng             |
| `plan-writer.test.mjs`    | thêm nhân vật vào khối có sẵn, plan thiếu khối `## characters`                                                 |

Không có test UI tự động (repo chưa có Playwright). Regression dưới đây chạy tay qua chrome-devtools MCP, gọi đúng handler của
nút (click DOM), server thật ở cổng 9000.

## Regression thật (2026-10-28)

Dự án test: `zz-ia-regression` (tạo thủ công, 4 scene, 16:9) và `zz-ia-script-ai` (tạo bằng AI, 3 scene).

| Luồng                                                             | Kết quả                                                                                                             |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Tạo dự án thủ công; tự chuyển sang dự án mới                      | Đạt                                                                                                                 |
| Tạo dự án bằng AI (3 scene)                                       | Đạt — ~50 s, có narration, nhân vật, prompt, motion, bản dịch; dialog Kịch bản tự mở                                |
| Chuyển dự án về `gia-long-p3`                                     | Đạt — `active.json` đúng, 21 scene                                                                                  |
| Đổi tỉ lệ 16:9 → 9:16 → 16:9                                      | Đạt — có xác nhận, lưu đúng                                                                                         |
| Logo & watermark từ menu Cài đặt dự án                            | Đạt — tên, vị trí, độ đậm lưu vào `branding.json`                                                                   |
| Kịch bản: JSON hỏng → Kiểm tra                                    | Đạt — "JSON lỗi: …" ở ô preview, Áp dụng tắt                                                                        |
| Kịch bản: JSON đúng (1 cập nhật, 1 thêm) → Áp dụng                | Đạt                                                                                                                 |
| Copy JSON                                                         | Đạt — 5 scene                                                                                                       |
| Chèn scene / Xoá scene                                            | Đạt — xoá có xác nhận, đánh số lại                                                                                  |
| Gộp 2 scene, chọn giữ scene sau, sửa narration gộp                | Đạt                                                                                                                 |
| Thêm nhân vật không ảnh → mở dialog Tạo ảnh                       | **Lỗi có sẵn** khi plan thiếu `## characters` → sửa (D17) → Đạt                                                     |
| Nhập nhân vật từ dự án khác                                       | Đạt — có ảnh tham chiếu                                                                                             |
| Hồ sơ + **Gợi ý bằng AI**                                         | Đạt — 11 s, điền 7 ô trống, ô "Vai trò" đã gõ giữ nguyên; lưu xong mô tả tự điền vào dialog Tạo ảnh                 |
| Tạo ảnh nhân vật từ mô tả → dùng làm tham chiếu                   | Đạt (`meta:muse-image-1.0`, 23 s)                                                                                   |
| Tạo ảnh nhân vật "Từ ảnh" (ảnh tham chiếu hiện tại)               | Đạt (bản nháp, không áp)                                                                                            |
| Tải ảnh tham chiếu nhân vật                                       | Đạt                                                                                                                 |
| Tiêu đề, gán 1 và 2 nhân vật cho scene                            | Đạt                                                                                                                 |
| **Độ dài tối thiểu**: 700 → bị từ chối; 6.5 → lưu                 | Đạt — toast nêu giới hạn; file có `duration: 6.5`                                                                   |
| **Độ dài tối thiểu** trong preview Nháp và dữ liệu render         | Đạt — scene 2 audio 2,88 s → 6,5 s (+0,5 s nghỉ = 7 s); scene khác không đổi                                        |
| Viết prompt từ narration                                          | Đạt qua API (40 s); lần bấm trên UI gặp `fetch failed` (D19)                                                        |
| Batch Prompt ở rail với loại "Chỉ ảnh"                            | Đạt — ô Timeline đổi theo; nút ghi `2`; chỉ field ảnh bị ghi                                                        |
| Chọn lại scene lỗi (nút trong thông báo, option Chọn nhanh)       | Đạt — chọn đúng scene 3                                                                                             |
| Viết prompt cho scene 2 nhân vật                                  | **Lỗi có sẵn** `fetch failed` ~61 s (D19); prompt viết tay để test tiếp                                             |
| Sửa / lưu prompt, nhãn "chưa lưu"                                 | Đạt                                                                                                                 |
| Xem bản dịch (có / chưa có)                                       | Đạt                                                                                                                 |
| Viết prompt thiếu (dialog Kịch bản)                               | Đạt                                                                                                                 |
| Style & template: sửa Guard → Tạo version                         | Đạt — nội dung vào đúng version mới; ô version ở hàng 1 đổi theo                                                    |
| Style & template: sửa DNA + motion system → 1 lần Lưu → Tải lại   | Đạt — cả 3 field còn                                                                                                |
| Đổi version ở hàng 1 → dialog đổi theo, version gốc không bị đụng | Đạt                                                                                                                 |
| Link "Sửa prompt hệ thống viết motion" từ dialog Motion           | Đạt — đóng Motion, mở dialog, bung Nâng cao, focus đúng ô                                                           |
| Esc đóng dialog Style & template                                  | Đạt                                                                                                                 |
| Sinh ảnh 1 scene                                                  | Đạt (`meta:muse-image-1.0`, 15 s)                                                                                   |
| Sinh ảnh hàng loạt 2 scene (Timeline)                             | Đạt — xác nhận "2 × ~$0.01 ≈ $0.02", nút ghi `2`                                                                    |
| Xoá hàng chờ                                                      | Đạt — job chờ bị bỏ, scene không sinh                                                                               |
| Huỷ job đang chạy                                                 | Đạt — client dừng ngay, server hết job sau 4 s                                                                      |
| Tải ảnh scene; hoàn tác / làm lại ảnh                             | Đạt — tag "ảnh của bạn"                                                                                             |
| Bật OmniVoice và muse2api từ bảng service                         | Đạt                                                                                                                 |
| Đổi giọng → `Giọng: …` ở inspector đổi theo                       | Đạt                                                                                                                 |
| Sinh audio 1 scene; hàng loạt 3 scene (rail, nút ghi `3`)         | Đạt                                                                                                                 |
| Viết motion bằng AI, sửa, lưu, xem bản dịch                       | Đạt                                                                                                                 |
| Sinh motion 1 scene                                               | Plenx: hết credit (không phải lỗi code). `muse:muse-video`: Đạt — log "clip sized to the minimum", clip 8 s ≥ 6,5 s |
| Sinh motion hàng loạt                                             | Đạt (`muse:muse-video`)                                                                                             |
| Tải video thay thế                                                | Clip 1248×704 bị từ chối đúng luật (≥1280 cạnh dài); clip 1280×720: Đạt                                             |
| Dùng ảnh thay video; hoàn tác motion                              | Đạt                                                                                                                 |
| Timeline Nháp ↔ Bản render, phát                                  | Đạt — player lên sau 2 s                                                                                            |
| Đổi thư mục lưu → Render MP4 → Mở MP4                             | Đạt — 1920×1080, 21,8 s, ở `tmp/ia-out/`; `/video` trả 206 `video/mp4`                                              |
| Thư viện video; trả về thư mục mặc định                           | Đạt — 15 video cũ còn nguyên, file test không bị chuyển / xoá                                                       |
| Bài đăng (YouTube/TikTok/Facebook), copy hashtag, copy tất cả     | Đạt                                                                                                                 |
| Thumbnail: gợi ý chữ AI, sinh nền, tải PNG                        | Đạt (`muse:muse-image`), PNG 1280×720                                                                               |
| Model & provider: thêm model → có ở picker → xoá                  | Đạt — `data/models.json` trở lại y như trước                                                                        |
| Thông báo khi job xong / lỗi; xoá hết                             | Đạt — chỉ xoá của dự án test; `gia-long-p3` còn nguyên                                                              |
| Copy log                                                          | Đạt                                                                                                                 |
| Bố cục 1440 px và 1024 px                                         | Đạt — không cuộn ngang, menu nằm trong khung                                                                        |
| Console sau cả đợt                                                | Chỉ lỗi mạng từ ca test cố ý (400/500/404) + issue label có sẵn; không lỗi JS                                       |

### Chưa chạy

- Render bản 9:16 và nút "Mở 9:16"; chế độ preview 9:16 mới mở chứ chưa render.
- 390 px, thiết bị thật, Safari, Firefox, VoiceOver.
- Audit `web-design-guidelines`.

## Chi phí đã gọi

| Provider                             | Lượt                                                                     | Ước tính           |
| ------------------------------------ | ------------------------------------------------------------------------ | ------------------ |
| `meta:muse-image-1.0` (Meta)         | 6 ảnh (2 nhân vật, 3 scene, 1 bị huỷ giữa chừng — có thể vẫn tính phí)   | ~$0.06             |
| `muse:muse-image`, `muse:muse-video` | 1 nền thumbnail, 2 video                                                 | quota web miễn phí |
| Plenx `omni-flash-video`             | 1 lượt bị từ chối (hết credit)                                           | 0                  |
| OpenAI (prompt-writer, gpt-5)        | ~7 lượt, gồm 3 lượt `fetch failed` và 2 lượt probe chẩn đoán             | không đo           |
| LLM `LLM_*` (deepseek-flash)         | gợi ý hồ sơ, viết motion, bài đăng, gợi ý thumbnail, kịch bản AI 3 scene | không đo           |
