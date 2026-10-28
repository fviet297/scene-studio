# Decisions — scene-studio-ux

## D1. Chỉ sắp xếp lại, giữ nguyên `id`, dialog, API

- **Quyết định**: đổi chỗ nút / thêm lớp bọc (nhóm, menu), không đổi id, không đổi dialog, API, dữ liệu.
- **Lý do**: handler nối theo id (`$("btnX").addEventListener`) và `review-script-gen.js` còn gọi `$("btnScript").click()`;
  giữ id thì không phải sửa logic. Panel không có URL state nên không có deep link cần giữ.

## D2. Giọng đọc chuyển lên topbar hàng 1 (user chốt 2026-10-28)

- Giọng là cài đặt cả project (`/api/project-voice`), trước đây nằm cạnh nút Audio trong batch bar nên dễ hiểu nhầm
  chỉ áp cho scene đã chọn. Giờ nằm trong nhóm **Cài đặt dự án** cùng tỉ lệ khung và style version.
- Nút Audio ở batch bar đứng riêng (bỏ wrapper `batch-unit`, sửa bo góc). Tooltip nút Audio và nút Sinh audio trong
  Narration nói giọng chọn ở thanh trên.

## D3. Gom nút topbar bằng dropdown menu mới (user chốt 2026-10-28)

- Ba menu theo phạm vi: **Dự án** (Kịch bản, Style, Template prompt, Logo & watermark), **Đóng gói** (Thumbnail, Bài đăng),
  **Ứng dụng** (Model & provider, Thư viện video, Thông báo). Mỗi mục kèm một dòng mô tả lấy từ tooltip cũ.
- Đã cân nhắc chỉ nhóm nút có nhãn, không thêm menu (ít rủi ro hơn); user chọn menu.
- Logic gói trong `review-menu.js` (một file, 96 dòng), không phụ thuộc `panel.js`.

## D4. Tiến độ Ảnh / Audio / Motion chuyển xuống hàng 2

- Sau khi thêm 3 ô cài đặt vào hàng 1, thanh tiến độ bị đẩy xuống dòng giữa ở 1440 px và kéo nút Ứng dụng theo.
  Hàng 2 còn trống và tiến độ đứng cạnh Render MP4 đọc tự nhiên (làm đủ → render).

## D5. Không thêm hàng Audio vào inspector (lệch kế hoạch ban đầu)

- Kế hoạch có "Audio thành hàng thứ ba cạnh Ảnh / Motion". Bỏ vì: CSS hiện có ghi rõ chủ ý để nút Sinh audio + trạng thái
  nằm trong khối Narration ("audio sinh từ chính khối chứa narration"); các hàng Ảnh / Motion là nút mở popup chỉnh, còn
  audio không còn cài đặt nào để đưa vào popup (giọng đã lên topbar).

## D6. Hành vi menu

- Click nút để mở / đóng; mở menu khác thì đóng menu đang mở; click ra ngoài đóng.
- Bàn phím: ↓ / ↑ mở và đi giữa các mục, Home / End, Tab đóng, Esc đóng và trả focus về nút.
- Esc xử lý ở capture phase: khi menu mở, Esc **chỉ** đóng menu, lần sau mới đóng dialog / panel thông báo bên dưới.
- Khi focus trong menu đang mở, phím khác không lan lên shortcut của panel (1 / 2, j / k, mũi tên, Space).
- Không đóng menu theo `focusout`: Safari / Firefox macOS không focus button khi click, `relatedTarget` null sẽ đóng menu
  trước khi click tới mục.
- `keepInViewport`: topbar wrap ở cửa sổ hẹp nên nút có thể ở bất kỳ đâu; dịch popover vào trong khung (`translate`) +
  `max-width: calc(100vw - 16px)`.
- `z-index: 24`: dưới dialog (30), trên console (20).

## D7. Click trong menu không làm panel thông báo tự đóng

- Handler click-ra-ngoài của panel thông báo coi nút trigger menu là "ngoài" và đóng panel, rồi mục Thông báo trong menu
  mở lại ⇒ không thể đóng panel bằng mục menu. Thêm `[data-menu]` vào danh sách phần tử được bỏ qua
  (`review-panel.js`, 1 dòng). Tác dụng phụ: bấm menu khác khi panel đang mở không đóng panel.

## D8. Đổi nhãn

- "Kiểm tra" → **"Kiểm tra JSON"** (và câu hướng dẫn): nút này kiểm tra JSON nhập vào, không phải kiểm tra trước render.
- Ô "Chọn nhanh…" trong dialog Kịch bản → **"Tick nhanh…"**: chỉ đổi các scene đang tick trong dialog, không đổi lựa chọn
  timeline (theo comment trong `review-panel.js`: ticks của dialog Kịch bản tách khỏi lựa chọn timeline).
- Nhãn batch bar "Chạy" → **"Chạy cho scene chọn"** (tooltip: chưa chọn thì chạy cho scene đang mở).
- Giữ "Gộp đã chọn": chữ do JS đặt động kèm số lượng.

## D9. Tạm bỏ qua "gợi ý AI cho nhân vật" (user chốt 2026-10-28)

- Không có trong code; không thêm tính năng mới (ràng buộc 1). Ghi ở câu hỏi mở `requirements.md`.

## Phương án không chọn

- **Chỉ nhóm nút, không menu** — ít rủi ro hơn nhưng hàng 2 vẫn dài; user chọn menu.
- **Dựng lại Workbench bằng 3 hàng sản xuất đồng dạng** — xem D5.
- **Đóng menu theo `focusout`** — xem D6.
