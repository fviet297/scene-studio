# Requirements — scene-studio-ux

## Mục tiêu

Người mới phân biệt được luồng sản xuất chính với cấu hình nâng cao / gỡ lỗi, và thấy rõ thao tác nào áp cho app, project,
một scene hay một batch — mà **không mất tính năng nào** của Scene Studio.

## Ràng buộc (từ yêu cầu gốc)

1. Giữ mọi tính năng, tích hợp, luồng đang có; không thêm tính năng mới.
2. Không bỏ / vô hiệu hoá tính năng chỉ vì ít dùng hoặc khó xếp.
3. Không viết lại app, không đổi framework; tái dùng component, API, dữ liệu hiện có.
4. Giữ nguyên dữ liệu project, API contract, hành vi sinh, provider.
5. Phân biệt sắp xếp UI với refactor backend; chỉ đổi backend khi cần.
6. Không thao tác phá huỷ lên dữ liệu người dùng, media đã sinh, hàng đợi, template đã lưu.
7. Tính năng nâng cao vẫn truy cập được.

## Phạm vi

- Trong phạm vi: topbar (hàng 1 / 2), batch bar timeline, nhãn nút / ô chọn gây nhầm, lối vào Thông báo.
- Ngoài phạm vi: nội dung các dialog, API, schema dữ liệu, rail / inspector của Workbench (chỉ đổi tooltip nút Sinh audio),
  thêm tính năng (kể cả "gợi ý AI cho nhân vật" — xem câu hỏi mở).

## Tiêu chí nghiệm thu

1. Mọi tính năng trong inventory có chỗ đến được ghi trong `README.md` (bản đồ cũ → mới).
2. Không tính năng nào bị bỏ, vô hiệu hoá hoặc thay bằng placeholder.
3. Giọng đọc là cài đặt project, không còn nằm trong nhóm nút chạy theo scene chọn.
4. Timeline (Nháp / Bản render / 9:16) và Workbench giữ nguyên hành vi.
5. Menu dùng được bằng chuột và bàn phím; Esc đóng menu trước, dialog sau; popover không tràn khỏi cửa sổ.
6. Không lỗi console; không cuộn ngang ở 1024 px và 500 px.
7. Diff chỉ gồm thay đổi truy được về yêu cầu.

## Câu hỏi mở

1. **"Gợi ý AI cho thông tin nhân vật"** có trong inventory nhưng không thấy trong code (dialog Hồ sơ chỉ nhập tay / JSON).
   Người dùng chọn tạm bỏ qua (2026-10-28). Cần xác nhận tính năng này có thật ở đâu, hay inventory ghi nhầm
   "Gợi ý bằng AI" của Thumbnail.
2. Ba route server chưa tìm thấy chỗ client gọi theo chuỗi literal: `/api/generate-puppets`, `/api/audio` (đơn lẻ),
   `/api/character-source` (hai route đầu có thể gọi qua chuỗi ghép; chưa xác minh). Không đụng tới trong task này.
3. Chưa có test UI tự động; luồng tốn tiền (sinh ảnh / video / audio, render) chưa chạy lại sau khi đổi giao diện.
