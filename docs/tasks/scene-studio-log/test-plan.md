# Test plan — Log hoạt động (drawer "Xem log")

Phạm vi: drawer log mới của panel Scene Studio (`scripts/review-log.js`) và các điểm ghi log trong
`review-panel.js`, `review-timeline.js`, `review-server.mjs`. Chạy trên server test riêng
(`REVIEW_PORT=9100`), mọi API ghi dữ liệu hoặc tốn phí được mock bằng Playwright, nên không đụng
project thật và không gọi provider.

## Chức năng, nói cho người dùng

| Thành phần | Dùng để làm gì |
| --- | --- |
| Nút **Xem log** (thanh dưới cùng) | Mở/đóng drawer log. Drawer trượt lên **đè lên** vùng làm việc, không đẩy hay thu nhỏ stage/timeline. Đóng bằng **Ẩn log**, nút **×**, hoặc **Esc**. |
| Huy hiệu đỏ trên **Xem log** | Số lỗi mới xảy ra khi log đang đóng. Mở log thì về 0. |
| Mỗi dòng log | `giờ · nguồn · nội dung`. Màu theo mức: xanh = thành công, vàng = cảnh báo/bỏ qua/huỷ, đỏ = lỗi, xám = thông tin. |
| Nguồn | prompt, motion prompt, ảnh, audio, motion, render, nhân vật, thumbnail, kịch bản, dự án, timeline, hàng chờ, thông báo, api, lỗi JS. |
| Lọc **Mọi mức / Lỗi + cảnh báo / Chỉ lỗi** | Thu gọn log khi chỉ cần tìm chỗ hỏng. |
| Lọc **nguồn** | Chỉ xem một luồng, ví dụ chỉ audio. |
| **Copy log** | Copy các dòng đang hiện (theo bộ lọc), kèm thời gian ISO, mức, nguồn — dán thẳng vào bug report. |
| **Xoá log** | Xoá toàn bộ log đã lưu trên trình duyệt này. |
| Lưu trữ | Log của cả phiên, tối đa 2000 dòng, lưu trong trình duyệt nên reload vẫn còn. Mỗi lần mở panel có dòng `— Mở panel —` làm mốc. |

Những gì được ghi:

- **Job** (ảnh, motion, audio, prompt, motion prompt, render): xếp hàng, bắt đầu, từng dòng server gửi
  về (model, provider, từng scene, thời gian từng scene), kết thúc kèm tổng thời gian và số scene
  thành công / lỗi / bỏ qua, huỷ.
- **Prompt đơn**: nội dung prompt vừa viết và bản dịch.
- **Request lỗi**: method, endpoint, scene, mã HTTP, thông báo lỗi; mất kết nối server; phản hồi không phải JSON.
- **Request thành công** (POST): endpoint, scene, thời gian.
- **Thông báo** (toast) và lỗi hiển thị trong panel.
- **Lỗi JS** không được bắt và promise bị từ chối.
- **Timeline**: file audio/video không đọc được, lỗi dựng dữ liệu render.

## Test case

Ký hiệu: **UI** = thao tác như người dùng; **Mock** = API được giả lập.

### A. Drawer

| ID | Kịch bản | Kỳ vọng |
| --- | --- | --- |
| A1 | Bàn làm việc, bấm **Xem log** | Drawer hiện ngay trên thanh console; kích thước vùng làm việc không đổi; nút thành **Ẩn log**, `aria-expanded=true`. |
| A2 | Đóng bằng **Ẩn log**, **×**, **Esc** (3 lần riêng) | Drawer ẩn (`visibility: hidden`, `inert`), nút về **Xem log**. |
| A3 | Timeline, mở log | Preview/track không co lại. |
| A4 | Bấm **Xem log** 2 lần thật nhanh | Trạng thái cuối nhất quán: đóng. |
| A5 | Mở log rồi mở dialog **Kịch bản** | Dialog nằm trên drawer. |
| A6 | Màn hình 390×844 | Drawer hoạt động, ẩn cột nguồn, không tràn ngang. |

### B. Ghi log

| ID | Kịch bản | Kỳ vọng |
| --- | --- | --- |
| B1 | Mở trang | Có dòng `— Mở panel (…) —`. |
| B2 | UI + Mock 500: sửa narration, **Lưu narration** | Dòng đỏ `POST /api/narration · scene N → 500: …`; toast trùng nội dung không bị ghi lặp; huy hiệu đỏ = 1 khi log đóng; mở log thì huy hiệu biến mất. |
| B3 | Mock SSE: batch ảnh 2 scene, scene 2 lỗi | Đủ: xếp/bắt đầu, `→ POST`, `image batch … model=…`, `✓ scene 1 (…, 12.0s)` xanh, `✗ scene 2: …` đỏ, `■ Kết thúc … 1 thành công, 1 lỗi` đỏ; drawer tự mở vì job lỗi. |
| B4 | Mock SSE: audio 1 scene | Các dòng có nguồn **audio** (trước đây audio không có log). |
| B5 | Mock: viết prompt 1 scene | Dòng `✓ Scene N prompt: …` và `Bản dịch: …`. |
| B6 | Mock SSE: motion 1 scene | Nguồn **motion**, dòng kết thúc xanh. |
| B7 | Mock: job ảnh treo, bấm **Huỷ** | Dòng vàng `đã huỷ` và `■ Đã huỷ …`. |
| B8 | Hai job ảnh liên tiếp | Job thứ 2 có dòng `Xếp hàng #1: …`. |
| B9 | Mock mất mạng | `không gọi được server (…)`. |
| B10 | Mock 502 trả HTML | Lỗi đọc được, không vỡ panel. |
| B11 | Lỗi JS không bắt | Dòng nguồn **lỗi JS** kèm file:dòng. |

### C. Công cụ và edge case

| ID | Kịch bản | Kỳ vọng |
| --- | --- | --- |
| C1 | Lọc **Chỉ lỗi**, rồi **Lỗi + cảnh báo** | Chỉ còn dòng đúng mức. |
| C2 | Lọc nguồn **audio** | Chỉ dòng audio. |
| C3 | Bộ lọc không khớp dòng nào | `Không có dòng nào khớp bộ lọc.` |
| C4 | **Copy log** khi đang lọc | Clipboard chỉ chứa dòng đang hiện, có `[error]`/nguồn. |
| C5 | **Xoá log** | `Chưa có hoạt động nào.`, đếm `0 dòng`, nút Xoá bị khoá. |
| C6 | Reload | Log cũ còn, thêm mốc `— Mở panel —` mới. |
| C7 | Ghi 2100 dòng | Giữ đúng 2000 dòng mới nhất. |
| C8 | Một dòng 5000 ký tự | Cắt còn 1500 + `(+3500 ký tự)`. |
| C9 | Đang cuộn lên đọc, có dòng mới | Không bị kéo xuống cuối. |
| C10 | Nội dung chứa HTML `<img onerror>` | Hiện dạng chữ, không chạy script. |
| C11 | `localStorage` bị chặn | Panel vẫn chạy, log vẫn ghi trong phiên. |

## Kết quả chạy

**2026-11-01** — Chrome (headed) + Playwright, server test cổng 9100, project
`gieng-tien-phu-quoc-nguyen-anh` (60 scene). **25/25 pass** sau khi sửa 1 bug.

- Lần chạy đầu: C9 fail. Khi log đã đủ 2000 dòng, mỗi dòng mới dựng lại toàn bộ 2000 dòng và kéo cuộn
  xuống cuối, nên người đang đọc bị mất chỗ và panel giật. Đã sửa: chỉ gỡ dòng cũ nhất khỏi DOM.
- B11 fail lần đầu do lỗi của chính script test (await promise bị reject), không phải của panel.
- A1: vùng làm việc giữ nguyên 776px khi mở log; drawer cao 414px, nằm sát trên thanh console.
- B10: server trả HTML 502 thì lỗi hiện là `Bad Gateway`, panel không vỡ.

Script test nằm ngoài repo (không có hạ tầng UI test). Muốn chạy lại: cài `playwright-core`, chạy
server với `REVIEW_PORT=9100`, rồi chạy script với `BASE=http://127.0.0.1:9100`.
