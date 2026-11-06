# Handoff — scene-studio-text-style

## Việc tiếp theo

1. **Chạy tay bản render.** Render MP4 và xem Bản render / 9:16 với tiêu đề đổi style (font, viền, nền, vị trí giữa / dưới) cho
   cả project 9:16 và 16:9. Preview trong modal chỉ gần đúng. Cần kiểm: font nạp đúng trong Remotion, tiêu đề dài xuống dòng
   không tràn, vị trí "Dưới" không đè phụ đề, `scrim` tắt thì đầu khung không còn dải tối. → verify: khung hình khớp với
   preview, không có chữ bị cắt khi cắt 9:16 từ bản 16:9.
2. **Chuyển headline Thumbnail vào modal chung** (`review-thumbnail.js`, `review-thumbnail-styles.js`). Thumbnail vẽ chữ bằng
   canvas với 6 kiểu riêng (`TH_STYLES`: vàng, YouTube đậm, băng rôn, sơn mài, neon, giấy dó), mỗi kiểu có hàm `drawRow`. Hướng
   đề xuất: giữ engine canvas, để modal chung cấp các trường cơ bản (font, cỡ, màu, in hoa) và chọn mẫu qua `TS_TARGETS`.
   Không viết lại `drawRow` khi chưa cần. → verify: thumbnail cũ cho ra ảnh giống hệt khi chưa đổi gì.
3. **Chuyển tên thương hiệu** (`BrandOverlay.tsx`: font Arial cố định, `branding.name`, `logo.textSize`) vào modal chung nếu
   muốn cho đổi font và màu. Cân nhắc: tên chỉ là chữ phụ cạnh logo, có thể không đáng thêm tuỳ chỉnh.
4. **Tham khảo GitHub** cho mẫu style phụ đề / tiêu đề. Lần này máy không có `gh` nên chưa làm; 8 mẫu hiện tại do tự chọn.
5. **Câu hỏi mở:** cho người dùng lưu mẫu riêng (style của tôi) không? Hiện chỉ có 8 mẫu cố định trong `TS_PRESETS`.
6. (Tuỳ chọn) Test UI tự động cho modal bằng skill `webapp-testing`. Script thử đã dùng: mở `#tlCaptionsSettings` và
   `#tlTitleSettings`, bấm `.ts-preset[data-preset="impact"]`, kéo `#tsSize`, bấm `[data-ts-seg="position"] [data-value="middle"]`.

## Chạy panel để thử

```bash
npm run review                                    # cổng 9000
REVIEW_PORT=9123 node scripts/review-server.mjs   # cổng khác, khi 9000 đang bận
```

Server cổng 9000 đang chạy từ trước phiên này có thể còn là bản cũ (không có `/text-style.js`): khởi động lại. HTML / CSS / JS
được đọc từ đĩa mỗi request nên sửa file rồi tải lại trang là đủ.

## Lưu ý khi sửa tiếp

- **Thêm một lớp chữ mới vào modal:** thêm mục vào `TS_TARGETS`, `TS_SIZE_RANGE`, `TS_GEOMETRY` và thêm cột tương ứng vào
  mỗi mẫu trong `TS_PRESETS` (`review-text-style.js`). Control chỉ dành cho một lớp thì gắn `data-ts-for="<lớp>"`; control ghi
  vào trường nào thì gắn `data-ts="<trường>"`. Không cần viết listener cho từng control, modal bắt sự kiện chung.
- **Mặc định phải khớp ở bốn chỗ:** `DEFAULT_BRANDING` (`scripts/lib/branding.mjs`), `DEFAULT_CAPTION_STYLE` /
  `DEFAULT_TITLE_STYLE` (`src/`), `CAPTION_DEFAULTS` (`review-timeline.js`), `TITLE_DEFAULTS` (`review-text-style.js`). Đổi một
  chỗ thì đổi cả bốn, và cập nhật `branding.test.mjs`.
- **Danh sách font ở ba chỗ:** `CAPTION_FONTS` (`branding.mjs`), `CAPTION_FONTS` (`src/caption-fonts.ts`) và `TS_FONTS` +
  `@font-face` + `<option>` trong `review-text-style.js` / `review-panel.css` / `review-panel.html`.
- Mẫu chỉ đặt look (font, màu, viền, nền, in hoa, bóng), không đặt cỡ chữ và vị trí. Giữ vậy để áp mẫu không làm mất chỉnh tay.
- `applyBrandingPatch` (`review-timeline.js`) không remount player khi modal đang mở; modal remount một lần khi đóng
  (`closeTextStyle`). Giữ hành vi này, remount mỗi lần kéo slider rất chậm.
- Mọi `id` / `data-ts` giữ nguyên khi đổi giao diện. `review-text-style.js` phụ thuộc `updateCaptions`, `updateTitle`,
  `remountPlayer`, `isRenderMode`, `CAPTION_DEFAULTS` của `review-timeline.js`, nên phải nạp sau nó.
- Thêm file JS panel mới thì làm đủ hai chỗ: `PANEL_ASSETS` trong `review-server.mjs` và thẻ `<script>` trong
  `review-panel.html`.
- Khi thử UI trên project thật, `/api/branding` ghi lại `projects/<slug>/branding.json` (chuẩn hoá thành đủ trường). Lưu bản gốc
  và khôi phục (`git checkout -- projects/<slug>/branding.json`) nếu không muốn đổi file.
- `review-panel.html`, `review-panel.css`, `review-server.mjs` vốn dùng CRLF trên máy này; lần sửa này làm lẫn hoặc đổi sang LF.
  Git (`autocrlf`) chuẩn hoá khi commit nên diff vẫn sạch.
- 3 test đang fail sẵn trên Windows, không liên quan: hai ca trong `ensure-ffmpeg.test.mjs`, một ca trong `model-config.test.mjs`.
