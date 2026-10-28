# Handoff — scene-studio-ux

## Việc tiếp theo

1. **Chạy tay regression** các luồng chưa kiểm (`progress.md` §Chưa kiểm), ưu tiên: đổi giọng rồi sinh audio một scene và
   batch; mở từng dialog từ menu (Style, Template, Kịch bản, Logo, Thumbnail, Bài đăng, Model, Thư viện) rồi lưu / đóng;
   Thông báo khi một job thật xong hoặc lỗi. → verify: mỗi dialog mở đúng, handler cũ chạy, không lỗi console.
2. **Quyết định nhánh**: 2 commit đang ở `feat/gia-long-prompt-rewrite`. Tách sang nhánh riêng nếu cần PR riêng cho phần UI.
3. Trả lời câu hỏi mở 1 (`requirements.md`): "gợi ý AI cho nhân vật" có thật không.
4. (Tuỳ chọn) Thêm test UI tự động cho menu và các luồng không tốn tiền — hiện chưa có test UI nào; dùng skill
   `webapp-testing` (Playwright), không thêm dependency vào `package.json` nếu chưa cần.

## Chạy panel để thử

```bash
cd /Users/fviet/PET/compare-image
npm run review                              # cổng 9000
REVIEW_PORT=9123 node scripts/review-server.mjs   # cổng khác, khi 9000 đang bận
```

Server đọc HTML / CSS / JS từ đĩa mỗi request — sửa file rồi tải lại trang (Cmd+Shift+R), không cần khởi động lại.

## Lưu ý khi sửa tiếp

- **Giữ nguyên `id` của các nút** trong menu; handler nối theo id, và `review-script-gen.js` gọi `$("btnScript").click()`
  (nút phải còn trong DOM, menu đóng cũng được).
- Thêm mục menu mới: thêm `<button class="menu-item" role="menuitem" id="…">` vào `.menu-pop` tương ứng — `review-menu.js`
  tự nhận, không cần sửa JS. Mục nào cần mở panel thông báo dùng `data-notif-toggle`.
- `review-menu.js` được phục vụ qua `/menu.js` (`PANEL_ASSETS` trong `review-server.mjs`) và nạp trong `review-panel.html`
  ngay trước `models.js`. Thêm file JS panel mới thì làm đủ cả hai chỗ.
- Hàng 1 topbar đã gần đầy ở 1440 px; thêm control vào hàng 1 dễ làm hàng wrap. Control mới ưu tiên đặt vào menu hoặc hàng 2.
- Shortcut của panel (1 / 2, j / k, mũi tên, Space trên timeline) bị chặn khi focus nằm trong menu đang mở — chủ ý (D6).
- Lựa chọn trong dialog Kịch bản (tick) tách khỏi lựa chọn của timeline / rail; đừng gộp khi sửa `selectScenes` /
  `pickScriptScenes`.
- Giọng đọc: `renderVoiceSelect()` trong `review-script-gen.js` điền `#voiceSelect`; `syncGlobalButtons` trong
  `review-panel.js` khoá nó khi có job toàn cục. Cả hai chạy theo id nên không bị ảnh hưởng bởi chỗ đặt.
- Task này không đổi dữ liệu project hay API; dòng cuối để nhắc: đừng đổi lại hợp đồng `/api/*` khi sửa giao diện.
