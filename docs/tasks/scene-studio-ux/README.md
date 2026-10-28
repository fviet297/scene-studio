# Task: Sắp xếp lại giao diện Scene Studio (review panel)

Trạng thái (2026-10-28): **đã code 4 pha, đã commit** (`692683f`, `78cfdc1`, nhánh `feat/gia-long-prompt-rewrite`). Chưa chạy
tay các luồng tốn tiền / ghi dữ liệu (sinh ảnh, video, audio, render, import project, đổi giọng). Xem `progress.md`,
`handoff.md`.

Nguồn: đọc `scripts/review-panel.html`, `review-panel.js`, `review-server.mjs` (+ `review-timeline.js`, `review-script-gen.js`
khi cần); chạy panel local cổng 9123 để kiểm tra.

## Bối cảnh

Scene Studio (panel review, `npm run review`) lớn dần qua nhiều đợt MVP: topbar hàng 2 có 11 nút lẫn 3 phạm vi
(app / project / scene), dropdown giọng đọc nằm trong batch bar của timeline dù là cài đặt cả project, người mới khó
biết tính năng nào ở đâu. Yêu cầu: **tối ưu cái đã có, không thêm tính năng, không bỏ tính năng**.

## Cấu trúc panel (đã kiểm)

- Vanilla JS + 1 CSS + 1 HTML, không framework. 8 file JS: `panel`, `timeline`, `script-gen`, `char-image`, `menu`, `models`,
  `social`, `thumbnail`. Server `review-server.mjs` phục vụ tĩnh qua `PANEL_ASSETS`.
- Topbar 2 hàng, rail scene (Workbench), stage + inspector, timeline, console bar đáy, 14 dialog (overlay).
- Hai view đổi bằng `body.view-timeline` / `view-stage` (phím 1 / 2). Một `selected` Set dùng chung cho rail, timeline và
  dialog Kịch bản — chuyển view giữ lựa chọn.
- Không có URL state / hash routing. URL cần giữ: `/video`, `/video?f=9x16`, URL asset.
- Nút nối listener theo **id** (`$("btnX").addEventListener`) — đổi chỗ nút không ảnh hưởng handler nếu giữ id.

## Chỗ lệch giữa inventory ban đầu và code

| #   | Inventory ghi                         | Code thực tế                                                                                                |
| --- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 1   | Timeline có 2 chế độ xem trước        | Có 3: Nháp, Bản render, 9:16                                                                                |
| 2   | "Viết kịch bản AI" thuộc mục Kịch bản | Chỉ có trong dialog Dự án mới (`/api/script-generate`, `/api/project-create`)                               |
| 3   | Style DNA thuộc nhóm template         | Tách: nút Style (Style DNA, version) khác nút Template prompt (5 template còn lại + prompt hệ thống motion) |
| 4   | Chọn giọng nằm trong luồng scene      | Nằm trong batch bar timeline (cài đặt project, `/api/project-voice`) và dialog Dự án mới                    |
| 5   | "Gợi ý AI" cho thông tin nhân vật     | **Không thấy** trong code nhân vật; "Gợi ý bằng AI" chỉ có ở dialog Thumbnail                               |
| 6   | Tạo nhân vật bằng AI từ mô tả         | Dialog Thêm nhân vật chỉ tạo hồ sơ rồi mở bước Tạo ảnh nhân vật (AI vẽ ảnh, không sinh hồ sơ)               |
| 7   | Chọn lại scene lỗi là nút riêng       | Là option "Scene lỗi gần nhất" trong Chọn nhanh + nút trong toast                                           |
| 8   | Timeline chỉ chọn và chạy batch       | Còn chèn / xoá scene, undo / redo, thu phóng, dải nhân vật                                                  |

Có nhưng inventory không nêu: undo / redo ảnh-audio-motion theo scene (`/api/undo`, `/api/redo`), dải local services
(`/api/services`), 3 thanh tiến độ, lọc rail và Chọn nhanh, dialog xác nhận chi phí batch, lightbox ảnh nhân vật, phím
tắt, từ khoá tìm ảnh. "Kiểm tra" trong dialog Kịch bản là kiểm tra **JSON nhập vào**, không phải kiểm tra trước render.

## Bố cục sau khi sắp xếp

| Vùng               | Nội dung                                                                                                                    |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| Hàng 1 — ngữ cảnh  | Chọn project + Dự án mới · **Cài đặt dự án** (tỉ lệ khung, style version, giọng đọc) · local services · menu **Ứng dụng ▾** |
| Hàng 2 — công việc | Timeline / Bàn làm việc · menu **Dự án ▾** · menu **Đóng gói ▾** · tiến độ Ảnh/Audio/Motion · Mở MP4 · Render MP4           |
| Menu Dự án         | Kịch bản, Style, Template prompt, Logo & watermark                                                                          |
| Menu Đóng gói      | Thumbnail, Bài đăng                                                                                                         |
| Menu Ứng dụng      | Model & provider, Thư viện video, Thông báo (kèm số chưa đọc)                                                               |
| Batch bar timeline | Chạy cho scene chọn: Prompt, Ảnh, Audio, Motion, Gộp (không còn dropdown giọng)                                             |

Mỗi mục menu có một dòng mô tả ngắn. Mọi nút giữ nguyên `id`; dialog, API và dữ liệu không đổi.

## Bản đồ vị trí cũ → mới

| Tính năng                              | Cũ                 | Mới                                 |
| -------------------------------------- | ------------------ | ----------------------------------- |
| Giọng đọc                              | Batch bar timeline | Hàng 1, nhóm Cài đặt dự án          |
| Tỉ lệ khung, style version             | Hàng 1             | Hàng 1, nhóm Cài đặt dự án          |
| Kịch bản, Style, Template prompt, Logo | Hàng 2 (nút rời)   | Menu Dự án ▾                        |
| Thumbnail, Bài đăng                    | Hàng 2 (nút rời)   | Menu Đóng gói ▾                     |
| Model & provider, Thư viện video       | Hàng 2 (nút rời)   | Menu Ứng dụng ▾                     |
| Thông báo                              | Console bar        | Console bar (giữ) + menu Ứng dụng ▾ |
| Tiến độ Ảnh / Audio / Motion           | Hàng 1             | Hàng 2, cạnh Render MP4             |
| Mọi tính năng còn lại                  | —                  | Không đổi chỗ                       |

## File đã đổi

| File                           | Thay đổi                                                                                       |
| ------------------------------ | ---------------------------------------------------------------------------------------------- |
| `scripts/review-panel.html`    | Gom topbar thành nhóm / menu; bỏ select giọng khỏi batch bar; nhãn mới                         |
| `scripts/review-panel.css`     | Style `.project-settings`, `.menu`, `.menu-pop`, `.menu-item`; bỏ rule chiều rộng select giọng |
| `scripts/review-menu.js` (mới) | Mở / đóng menu, phím mũi tên, Home / End, Esc chỉ đóng menu, giữ popover trong viewport        |
| `scripts/review-panel.js`      | 1 dòng: click trong `[data-menu]` không làm panel thông báo tự đóng                            |
| `scripts/review-server.mjs`    | 1 dòng: route `/menu.js` trong `PANEL_ASSETS`                                                  |

## Nguồn tài liệu (index)

| Tài liệu          | Nội dung                                            |
| ----------------- | --------------------------------------------------- |
| `requirements.md` | Ràng buộc, phạm vi, tiêu chí nghiệm thu, câu hỏi mở |
| `decisions.md`    | Quyết định D1–D9 và phương án không chọn            |
| `progress.md`     | Đã làm / đã kiểm / chưa kiểm                        |
| `handoff.md`      | Việc tiếp theo và lưu ý                             |
