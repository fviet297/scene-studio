// Close Vietnamese translations of the default prompt templates (scripts/lib/replicate-image.mjs
// TEMPLATE_DEFAULTS). Read-only reading aids shown next to each template field in the review panel,
// replacing the old runtime Google Translate call. Placeholders ([STYLE], [GUARD],
// [SCENE-SPECIFIC PROMPT]) are kept verbatim so the reader sees where the pieces get substituted.
//
// These translate the SHIPPED defaults. A user-authored template version (created in the panel) is
// English the user wrote themselves, so no Vietnamese is stored for it — the panel then shows a
// "chưa có bản dịch" note. If the English default here changes, update the matching field below.

export const TEMPLATE_VI_DEFAULTS = {
  styleDna: `Tranh chibi vector 2D kiểu game-asset — tỉ lệ chibi 2,5 đầu, đầu tròn quá khổ, thân và tay chân mập ngắn, bàn tay kiểu găng; nét viền nâu sẫm đều và đậm; tô phẳng cel-shading, một tông bóng mềm, không gradient, không highlight bóng loáng, không nhiễu texture; mắt hạnh nhân nhỏ đồng tử sẫm, chân mày đen dày sắc, mũi chấm, miệng nhỏ, biểu cảm nghiêm nghị kiên định; bảng màu lịch sử trầm gồm đỏ thẫm, vàng cổ, thổ hoàng, xanh mòng két, ô liu, tím thẫm và nâu da thuộc`,

  guard: `đúng bối cảnh lịch sử của thời kỳ, khung dọc 9:16, chủ thể trung tâm rõ ràng, chừa khoảng trống phía trên, mọi bề mặt hoàn toàn trơn, không chữ viết, không ký hiệu, không watermark, không vật thể hiện đại, không trang bị sai niên đại, không giáp kiểu fantasy`,

  masterPrompt: `MỘT tranh chibi cartoon phẳng. Ảnh tham chiếu = phong cách vẽ cho TOÀN BỘ ảnh (không phải một sticker dán vào).

PHONG CÁCH: [STYLE]. Cảnh vật ở xa = các mảng cartoon phẳng có viền, chỉ dùng tông lạnh hơn. Không nền vẽ kiểu sơn dầu, không sương mù, không mờ nhòe.

MỌI nhân vật (lính, đám đông, người qua đường) đều dùng cùng tỉ lệ chibi 2,5 đầu, đầu tròn, bàn tay kiểu găng, độ dày nét, kiểu mắt, cel-shading và mức chi tiết như nhân vật chính. Không được phác sơ sài hơn, bán tả thực, vẽ sơn dầu hay chỉ là bóng đen. Đám đông = nhiều nhân vật chibi nhỏ, không phải một khối vân texture.

CHỈ MỘT NỀN VĂN HÓA: Theo đúng quốc gia + thế kỷ của CẢNH cho kiến trúc, trang phục, giáp, cờ và vũ khí. Tuyệt đối không pha trộn (đặc biệt là Trung Hoa ↔ Việt Nam).

NHÂN VẬT CHÍNH: Khóa theo ảnh tham chiếu — giữ nguyên mặt, tóc, da, tỉ lệ, trang phục, giáp, màu sắc và vũ khí. Chỉ được đổi tư thế, biểu cảm, hướng nhìn, hành động, góc máy và ánh sáng. Không thiết kế lại mặt/giáp. Nhân vật phụ mặc đồ đơn giản hơn; không sao chép mặt, mũ giáp hay bộ giáp vàng của nhân vật chính.

BỀ MẶT TRƠN: mọi cờ phướn, lá cờ, khiên và tường là một mảng màu phẳng liền mạch, kín từ mép tới mép — vải nhuộm chỉ hiện nếp gấp và đường viền, gỗ sơn trơn, đá mộc. Giữ mọi bề mặt hoàn toàn trơn, không mang ký hiệu.

CẤM CHỮ: không có ký tự nào nhìn thấy được, không có dấu vết xếp thành chữ viết, không trang trí kiểu typography ở bất cứ đâu trong khung hình. Thông tin thị giác chỉ được truyền tải bằng hình khối, màu sắc, chấm trơn và đường nét trơn.

CẢNH:
[SCENE-SPECIFIC PROMPT]

BỐ CỤC: khung dọc 9:16, cảnh kể chuyện rộng có môi trường, không bao giờ là chân dung cận. Nhân vật chính cố ý để nhỏ, khoảng 20–30% chiều cao khung, chừa nhiều khung cảnh xung quanh. Dùng các lớp tiền cảnh, trung cảnh và hậu cảnh, đường dẫn mắt rõ, tỉ lệ đa dạng, và hoạt động thấy được quanh nhân vật. Ưu tiên bố cục bất đối xứng hoặc chéo hơn là hàng ngang tĩnh căn giữa. Đầu/mặt vẫn đọc được và không bị cắt; chỉ chừa khoảng trống tĩnh ở phía trên cho phụ đề.

LOẠI TRỪ (chỉ nêu tính chất phong cách — tuyệt đối không nêu tên vật thể có thể vẽ ở đây, model sẽ vẽ ra bất cứ thứ gì được nêu tên): pha trộn phong cách/tỉ lệ, nền sơn dầu/mờ đục, người bán tả thực, bóng đen silhouette, gradient, highlight bóng loáng, sương mù/mờ nhòe, pha trộn văn hóa, sai niên đại, mặt/trang phục nhân vật chính bị vẽ lại, nhân vật chính chiếm hết khung, nền trống trơn, nhân vật phụ mặc giáp của nhân vật chính, tỉ lệ người lớn, bàn tay dị dạng, ảnh chân thực, 3D, chữ, watermark.`,

  faceLockPrompt: `CÙNG MỘT NGƯỜI, CẢNH KHÁC — MỘT tranh chibi cartoon phẳng. Ảnh tham chiếu = phong cách vẽ cho TOÀN BỘ ảnh (không phải sticker).

PHONG CÁCH: [STYLE]. Cảnh vật ở xa = các mảng cartoon phẳng có viền, chỉ dùng tông lạnh hơn. Không nền vẽ kiểu sơn dầu, không sương mù, không mờ nhòe.

MỌI nhân vật dùng cùng tỉ lệ chibi 2,5 đầu, đầu tròn, bàn tay kiểu găng, độ dày nét, mắt, cel-shading và chi tiết như nhau. Không phác sơ sài hơn, bán tả thực, sơn dầu hay bóng đen. Đám đông = nhiều nhân vật chibi nhỏ, không phải khối vân texture.

CHỈ MỘT NỀN VĂN HÓA: Theo đúng quốc gia + thế kỷ của CẢNH một cách nghiêm ngặt. Không pha trộn văn hóa theo bất kỳ chiều nào.

ẢNH THAM CHIẾU = chỉ KHUÔN MẶT + DANH TÍNH: giữ nguyên chính xác hình dạng/đường nét khuôn mặt, mắt, mũi, miệng, kiểu tóc, màu tóc, tông da, độ tuổi biểu kiến và tỉ lệ chibi. Không đổi mặt, kiểu tóc hay độ tuổi.

TRANG PHỤC + TƯ THẾ theo CẢNH (không theo ảnh tham chiếu). Mặc theo cảnh dù ảnh tham chiếu đang mặc giáp. Mọi thứ khác (người khác, công trình, địa hình) cũng lấy từ CẢNH.

BỀ MẶT TRƠN: mọi cờ phướn, lá cờ, khiên và tường là một mảng màu phẳng liền mạch, kín từ mép tới mép — vải nhuộm chỉ hiện nếp gấp và đường viền, gỗ sơn trơn, đá mộc. Giữ mọi bề mặt hoàn toàn trơn, không mang ký hiệu.

CẤM CHỮ: không có ký tự nào nhìn thấy được, không có dấu vết xếp thành chữ viết, không trang trí kiểu typography ở bất cứ đâu trong khung hình. Thông tin thị giác chỉ được truyền tải bằng hình khối, màu sắc, chấm trơn và đường nét trơn.

CẢNH:
[SCENE-SPECIFIC PROMPT]

BỐ CỤC: khung dọc 9:16, cảnh kể chuyện rộng có môi trường, không bao giờ là chân dung cận. Nhân vật cố ý để nhỏ, khoảng 20–30% chiều cao khung, chừa nhiều khung cảnh xung quanh. Dùng các lớp tiền cảnh, trung cảnh và hậu cảnh, đường dẫn mắt rõ, tỉ lệ đa dạng, và hoạt động thấy được quanh nhân vật. Ưu tiên bố cục bất đối xứng hoặc chéo hơn là hàng ngang tĩnh căn giữa. Đầu/mặt vẫn đọc được và không bị cắt; chỉ chừa khoảng trống tĩnh ở phía trên cho phụ đề.

LOẠI TRỪ (chỉ nêu tính chất phong cách — tuyệt đối không nêu tên vật thể có thể vẽ, model sẽ vẽ bất cứ thứ gì được nêu tên): pha trộn phong cách/tỉ lệ, nền sơn dầu/mờ đục, người bán tả thực, bóng đen silhouette, gradient, highlight bóng loáng, sương mù/mờ nhòe, pha trộn văn hóa, sai niên đại, khác mặt/kiểu tóc/người/độ tuổi, nền trống trơn, tỉ lệ người lớn, bàn tay dị dạng, ảnh chân thực, 3D, chữ, watermark.`,

  multiCharPrompt: `NHIỀU NGƯỜI KHÁC NHAU TRONG MỘT CẢNH — MỘT tranh chibi cartoon phẳng. Các ảnh tham chiếu định phong cách vẽ cho TOÀN BỘ ảnh, không phải sticker.

PHONG CÁCH: [STYLE]. Cảnh vật ở xa dùng các mảng phẳng có viền, tông lạnh hơn.

MỌI NGƯỜI: cùng tỉ lệ chibi, độ dày nét, mắt và cel-shading. Đám đông gồm các nhân vật chibi nhỏ, phân biệt được với nhau.

THỨ TỰ THAM CHIẾU: ảnh 1 = nhân vật được nêu tên đầu tiên; ảnh 2 = nhân vật thứ hai. Giữ nguyên mặt, tóc, da, trang phục, giáp, màu sắc và vũ khí của từng người. Chỉ đổi tư thế, biểu cảm, hướng nhìn và góc máy. Mỗi nhân vật chính xuất hiện đúng một lần và luôn phân biệt được rõ. Nhân vật phụ dùng trang bị đơn giản, không sao chép nhân vật chính nào.

VĂN HÓA: mỗi bên dùng đúng quốc gia và thế kỷ được nêu cho kiến trúc, trang phục, giáp và vũ khí. Tuyệt đối không hoán đổi yếu tố Trung Hoa và Việt Nam.

BỀ MẶT: cờ phướn, lá cờ, khiên và tường giữ trơn, chỉ dùng màu phẳng, chất liệu và nếp gấp.

CẢNH:
[SCENE-SPECIFIC PROMPT]

BỐ CỤC: cảnh môi trường khung dọc 9:16. Theo đúng vị trí đặt trong CẢNH. Mỗi nhân vật chính chiếm 20–30% chiều cao khung, tách bạch rõ và không bị cắt. Thể hiện tiền cảnh, trung cảnh và hậu cảnh, tỉ lệ đa dạng, nhân vật phụ có hoạt động, và khoảng trống tĩnh phía trên.

LOẠI TRỪ: nhân vật chính bị nhân bản hoặc soi gương, dùng chung khuôn mặt, pha trộn văn hóa hoặc phong cách, tỉ lệ người lớn, nền sơn dầu, gradient, bóng loáng, sương mù, mờ nhòe, ảnh chân thực, 3D, chữ, watermark.`,

  text2img: `Tái dựng lịch sử. [SCENE-SPECIFIC PROMPT]. [STYLE], [GUARD].`,
};
