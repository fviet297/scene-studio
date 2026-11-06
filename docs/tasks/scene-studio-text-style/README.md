# Task: Style chữ trên video (Phụ đề, Tiêu đề scene) và modal chỉnh chữ dùng chung

Trạng thái (2026-11-06): **đã code Phụ đề + Tiêu đề scene, chưa commit**. Thumbnail và tên thương hiệu chưa chuyển sang
modal chung. Chưa chạy Render MP4 để xem chữ trong video thật. Xem `handoff.md`.

## Yêu cầu gốc

1. Thêm tuỳ chỉnh style cho Tiêu đề scene, có style mẫu và cho phép chỉnh tiếp.
2. Tách bạch giao diện chỉnh Tiêu đề scene với chỉnh Phụ đề.
3. Mọi chức năng chỉnh text trong panel dùng chung một modal với các thuộc tính cơ bản (font, màu, cỡ chữ, viền, nền, vị trí)
   và các style mẫu, không quá phức tạp.
4. Tham khảo các dự án tương tự trên GitHub.

## Đã làm

- **Dữ liệu** (`scripts/lib/branding.mjs`): `branding.json` → `title` mở rộng thành `enabled, font, size, color, strokeWidth,
strokeColor, backgroundOpacity, uppercase, shadow, scrim, position, offsetY`. `captions` thêm `strokeColor`. Giá trị mặc định
  của `title` giữ đúng hình dạng cũ (trắng, 52px, bóng nhẹ, không viền) nên file `branding.json` cũ vẫn chạy.
- **Render Remotion**: `src/SceneTitle.tsx` (mới, vẽ tiêu đề theo style), `src/text-style.ts` (mới, viền chữ dùng chung cho
  phụ đề và tiêu đề), `src/CaptionTrack.tsx` (màu viền), `src/ScenePlanVideo.tsx` (`SceneView` nhận `titleStyle` thay cho
  `titleFontId`, dải tối đầu khung tắt được), `src/SceneOneVideo.tsx`, `src/BrandOverlay.tsx` (kiểu dữ liệu).
- **Panel**: hai cặp nút tách bạch trên thanh transport, "Phụ đề" và "Tiêu đề" (nút bật/tắt + nút mở modal). Popover phụ
  đề cũ đã bỏ. Modal `#tsOverlay` trong `scripts/review-text-style.js` (mới) dùng chung cho cả hai: preview trên ảnh scene đang
  chọn, 8 mẫu (Mặc định, Vàng điện ảnh, YouTube đậm, Thư pháp, Bản tin, Truyện tranh, Tối giản, Đỏ sơn mài), font, cỡ, màu, viền,
  nền, in hoa, vị trí, đặt lại. Mục chỉ có ở phụ đề: màu đã đọc / chưa đọc, hiệu ứng chữ đang đọc, bám theo vùng crop / khung
  16:9. Mục chỉ có ở tiêu đề: bóng đổ, dải tối đầu khung.
- **Test**: `scripts/lib/branding.test.mjs` cập nhật và thêm ca cho `title`. Đã chạy panel cổng 9123 bằng Playwright: mở hai
  modal, chọn mẫu, kéo cỡ chữ, đổi vị trí, lưu vào server, Esc đóng, không lỗi console.

## File đã đổi

| File                                                                           | Thay đổi                                                                                                         |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `scripts/lib/branding.mjs`, `branding.test.mjs`                                | Mở rộng `title`, thêm `captions.strokeColor`, hằng số `TITLE_SIZE_RANGE`                                         |
| `src/SceneTitle.tsx`, `src/text-style.ts`                                      | Mới                                                                                                              |
| `src/CaptionTrack.tsx`, `ScenePlanVideo.tsx`, `SceneOneVideo.tsx`, `BrandOverlay.tsx` | Nối style tiêu đề và màu viền                                                                             |
| `scripts/review-text-style.js`                                                 | Mới: modal, mẫu, preview                                                                                         |
| `scripts/review-panel.html`                                                    | Thay popover phụ đề bằng nút Phụ đề / Tiêu đề, thêm `#tsOverlay`, nạp `/text-style.js`                           |
| `scripts/review-panel.css`                                                     | `@font-face` cho font nhúng sẵn (từ `/public/fonts/`), style `.ts-*`                                              |
| `scripts/review-timeline.js`                                                   | Bỏ popover cũ, thêm `updateTitle`, nút bật/tắt tiêu đề; không remount player khi modal đang mở                    |
| `scripts/review-panel.js`                                                      | Esc đóng modal chữ                                                                                               |
| `scripts/review-server.mjs`                                                    | Route `/text-style.js` trong `PANEL_ASSETS`, sửa comment `/api/branding`                                         |

## Nguồn tài liệu

| Tài liệu     | Nội dung                  |
| ------------ | ------------------------- |
| `handoff.md` | Việc làm sau và lưu ý     |
