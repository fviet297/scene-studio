# Progress — scene-studio-ux

## Trạng thái

| Hạng mục                                                                  | Trạng thái                             |
| ------------------------------------------------------------------------- | -------------------------------------- |
| Audit code, lập inventory và bản đồ cũ → mới (`README.md`)                | **Xong 2026-10-28**                    |
| Pha 1 — nhóm topbar theo phạm vi, menu Dự án / Đóng gói / Ứng dụng        | **Xong 2026-10-28** — commit `692683f` |
| Pha 2 — giọng đọc lên Cài đặt dự án; nhãn batch bar; tiến độ xuống hàng 2 | **Xong 2026-10-28** — commit `692683f` |
| Pha 3 — mục Thông báo trong menu Ứng dụng                                 | **Xong 2026-10-28** — commit `78cfdc1` |
| Pha 3 — hàng Audio trong inspector                                        | **Bỏ** (D5)                            |
| Pha 4 — đổi nhãn "Kiểm tra JSON", "Tick nhanh…"                           | **Xong 2026-10-28** — commit `78cfdc1` |
| Regression tay các luồng tốn tiền / ghi dữ liệu                           | Chưa                                   |
| Kiểm trên Safari / Firefox                                                | Chưa                                   |

Hai commit nằm trên nhánh `feat/gia-long-prompt-rewrite` (nhánh có sẵn, tên không liên quan đến task này).

## Đã kiểm

Panel chạy local `REVIEW_PORT=9123 node scripts/review-server.mjs`, Chrome qua chrome-devtools, project `gia-long-p3`.

| Kiểm tra                                                                                                                                      | Kết quả                                           |
| --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `node --check` các file JS đã đổi                                                                                                             | OK                                                |
| `node --test scripts/lib/*.test.mjs`                                                                                                          | 55 pass, 0 fail (không test nào chạm phần đã đổi) |
| Quét diff tìm secret / `console.log`                                                                                                          | Sạch                                              |
| Console trình duyệt sau mỗi lần tải lại                                                                                                       | Không lỗi, không cảnh báo                         |
| Mỗi id nút đã chuyển (`btnScript`, `btnStyle`, `btnTemplates`, `btnBrand`, `btnThumb`, `btnSocial`, `btnModels`, `btnLibrary`, `voiceSelect`) | Còn đúng 1 lần trong HTML                         |
| Menu: click mở / đóng, mở menu khác đóng menu cũ, click ra ngoài đóng                                                                         | Đạt                                               |
| Bấm mục menu → mở đúng dialog, menu tự đóng (thử với Style, Model & provider)                                                                 | Đạt                                               |
| Bàn phím: ↓ từ nút mở menu và đi giữa mục; scene timeline không nhảy                                                                          | Đạt                                               |
| Esc khi menu + dialog cùng mở: lần 1 đóng menu, lần 2 đóng dialog                                                                             | Đạt                                               |
| Mục Thông báo: huy hiệu hiện ở menu và console bar; mở / đóng panel bằng mục menu; click ngoài đóng                                           | Đạt (giá trị chưa đọc đặt tay, không có job thật) |
| Bố cục 1440 px: mỗi hàng topbar cao 32 px, không wrap                                                                                         | Đạt                                               |
| 1024 px: không cuộn ngang; hàng 1 wrap thành 2 dòng (67 px), hàng 2 vẫn 1 dòng                                                                | Đạt (wrap là chủ ý)                               |
| 500 px (nhỏ nhất trình duyệt cho): popover của cả 3 menu nằm trong khung, không cuộn ngang                                                    | Đạt                                               |
| Chuyển sang Bàn làm việc: menu và ô giọng vẫn dùng được                                                                                       | Đạt                                               |
| Nhãn mới "Kiểm tra JSON", "Tick nhanh…" có trong DOM                                                                                          | Đạt (chưa mở dialog Kịch bản để xem bằng mắt)     |

## Chưa kiểm

- Đổi giọng thật (`/api/project-voice` ghi vào project). Element và listener `voiceSelect` không đổi.
- Sinh ảnh / video / audio, render MP4, import nhân vật từ project khác, tạo project mới, lưu template / style, lưu branding
  — tốn tiền hoặc ghi dữ liệu; giao diện các dialog này không đổi.
- Thông báo từ job thật (mới thử bằng cách đặt tay biến đếm chưa đọc).
- 390 px (cửa sổ trình duyệt test không nhỏ hơn 500 px); thiết bị thật; Safari, Firefox.
- Truy cập bằng đọc màn hình (menu dùng `role="menu"` / `menuitem`, `aria-expanded`, `aria-controls`, chưa thử với VoiceOver).
