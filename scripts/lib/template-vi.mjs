// Close Vietnamese translations of the default prompt templates (scripts/lib/replicate-image.mjs
// TEMPLATE_DEFAULTS). Read-only reading aids shown next to each template field in the review panel,
// replacing the old runtime Google Translate call. Placeholders ([FRAME], [STYLE], [GUARD],
// [SCENE-SPECIFIC PROMPT]) are kept verbatim so the reader sees where the pieces get substituted.
//
// These translate the SHIPPED defaults. A user-authored template version (created in the panel) is
// English the user wrote themselves, so no Vietnamese is stored for it — the panel then shows a
// "chưa có bản dịch" note. If the English default here changes, update the matching field below.

export const TEMPLATE_VI_DEFAULTS = {
  styleDna: `Tranh chibi vector 2D kiểu game-asset — tỉ lệ chibi 2,5 đầu, đầu tròn quá khổ, thân và tay chân mập ngắn, bàn tay kiểu găng; nét viền nâu sẫm đều và đậm; tô phẳng cel-shading, một tông bóng mềm, không gradient, không highlight bóng loáng, không nhiễu texture; mắt hạnh nhân nhỏ đồng tử sẫm, chân mày đen dày sắc, mũi chấm, miệng nhỏ, biểu cảm nghiêm nghị kiên định; bảng màu lịch sử trầm gồm đỏ thẫm, vàng cổ, thổ hoàng, xanh mòng két, ô liu, tím thẫm và nâu da thuộc`,

  guard: `pha trộn phong cách hoặc tỉ lệ, người bán tả thực hoặc tỉ lệ người lớn, nền sơn dầu hoặc mờ đục, gradient, bóng loáng, sương mù, mờ nhòe, bóng đen silhouette, ảnh chân thực, render 3D, pha trộn văn hóa hoặc thời kỳ, sai niên đại, giáp fantasy, nền trống trơn, watermark`,

  masterPrompt: `MỘT tranh chibi cartoon 2D phẳng. [FRAME]

PHONG CÁCH: [STYLE]. Cảnh vật ở xa = các mảng phẳng có viền, tông lạnh hơn; không nền sơn dầu, sương mù hay mờ nhòe. Nhân vật chính, lính và đám đông dùng cùng tỉ lệ 2,5 đầu, bàn tay kiểu găng, độ dày nét và cel-shading phẳng; đám đông là nhiều nhân vật chibi nhỏ, không phải một khối vân texture.

NHÂN VẬT CHÍNH: khóa theo ảnh tham chiếu — giữ nguyên mặt, tóc, da, tỉ lệ, trang phục, giáp, màu sắc và vũ khí; chỉ đổi tư thế, biểu cảm, hành động, góc máy và ánh sáng. Nhân vật phụ mặc đồ đơn giản hơn, không sao chép mặt, mũ hay giáp của nhân vật chính.

THẾ GIỚI: quốc gia và thế kỷ mà CẢNH nêu quyết định kiến trúc, trang phục, giáp, vũ khí và đồ vật; hai phe được nêu thì mỗi phe giữ văn hóa riêng; không lấy gì từ nền văn hóa hay thời đại mà CẢNH không nêu.

CẢNH: [SCENE-SPECIFIC PROMPT]

DÀN CẢNH: cảnh kể chuyện rộng có môi trường, không bao giờ là chân dung cận; mỗi nhân vật chính khoảng 20–30% chiều cao khung. Chiều sâu nhiều lớp, đường dẫn mắt, tỉ lệ đa dạng, hoạt động thấy được; bất đối xứng hoặc chéo, không xếp hàng căn giữa. Mặt đọc được và không bị cắt.

LOẠI TRỪ: [GUARD], mặt hoặc trang phục nhân vật chính bị vẽ lại, nhân vật chính chiếm hết khung.`,

  faceLockPrompt: `CÙNG MỘT NGƯỜI, CẢNH KHÁC — MỘT tranh chibi cartoon 2D phẳng. [FRAME]

PHONG CÁCH: [STYLE]. Cảnh vật ở xa = các mảng phẳng có viền, tông lạnh hơn; không nền sơn dầu, sương mù hay mờ nhòe. Nhân vật chính, lính và đám đông dùng cùng tỉ lệ 2,5 đầu, bàn tay kiểu găng, độ dày nét và cel-shading phẳng; đám đông là nhiều nhân vật chibi nhỏ, không phải một khối vân texture.

KHÓA KHUÔN MẶT: ảnh tham chiếu chỉ cố định mặt, mắt, mũi, miệng, kiểu tóc, màu tóc, tông da, độ tuổi biểu kiến và tỉ lệ chibi. Trang phục và tư thế theo CẢNH, kể cả khi ảnh tham chiếu đang mặc giáp.

THẾ GIỚI: quốc gia và thế kỷ mà CẢNH nêu quyết định kiến trúc, trang phục, giáp, vũ khí và đồ vật; hai phe được nêu thì mỗi phe giữ văn hóa riêng; không lấy gì từ nền văn hóa hay thời đại mà CẢNH không nêu.

CẢNH: [SCENE-SPECIFIC PROMPT]

DÀN CẢNH: cảnh kể chuyện rộng có môi trường, không bao giờ là chân dung cận; mỗi nhân vật chính khoảng 20–30% chiều cao khung. Chiều sâu nhiều lớp, đường dẫn mắt, tỉ lệ đa dạng, hoạt động thấy được; bất đối xứng hoặc chéo, không xếp hàng căn giữa. Mặt đọc được và không bị cắt.

LOẠI TRỪ: [GUARD], khác mặt, kiểu tóc, độ tuổi hoặc khác người.`,

  multiCharPrompt: `NHIỀU NGƯỜI KHÁC NHAU — MỘT tranh chibi cartoon 2D phẳng. [FRAME]

PHONG CÁCH: [STYLE]. Cảnh vật ở xa = các mảng phẳng có viền, tông lạnh hơn; không nền sơn dầu, sương mù hay mờ nhòe. Nhân vật chính, lính và đám đông dùng cùng tỉ lệ 2,5 đầu, bàn tay kiểu găng, độ dày nét và cel-shading phẳng; đám đông là nhiều nhân vật chibi nhỏ, không phải một khối vân texture.

THAM CHIẾU: ảnh 1 = nhân vật được nêu tên đầu tiên, ảnh 2 = nhân vật thứ hai, các ảnh sau theo đúng thứ tự nêu tên. Giữ nguyên mặt, tóc, da, trang phục, giáp, màu sắc và vũ khí của từng người; mỗi nhân vật chính xuất hiện đúng một lần và luôn phân biệt được. Nhân vật phụ dùng trang bị đơn giản, không sao chép nhân vật chính nào.

THẾ GIỚI: quốc gia và thế kỷ mà CẢNH nêu quyết định kiến trúc, trang phục, giáp, vũ khí và đồ vật; hai phe được nêu thì mỗi phe giữ văn hóa riêng; không lấy gì từ nền văn hóa hay thời đại mà CẢNH không nêu.

CẢNH: [SCENE-SPECIFIC PROMPT]

DÀN CẢNH: cảnh kể chuyện rộng có môi trường, không bao giờ là chân dung cận; mỗi nhân vật chính khoảng 20–30% chiều cao khung. Chiều sâu nhiều lớp, đường dẫn mắt, tỉ lệ đa dạng, hoạt động thấy được; bất đối xứng hoặc chéo, không xếp hàng căn giữa. Mặt đọc được và không bị cắt. Theo đúng vị trí đặt trong CẢNH và giữ các nhân vật chính tách bạch rõ.

LOẠI TRỪ: [GUARD], nhân vật chính bị nhân bản, soi gương hoặc dính nhau, dùng chung khuôn mặt.`,

  text2img: `MỘT tranh chibi cartoon 2D phẳng về MÔI TRƯỜNG — bối cảnh là chủ thể. [FRAME]

PHONG CÁCH: [STYLE]. Cảnh vật ở xa = các mảng phẳng có viền, tông lạnh hơn.

NHÂN VẬT: chỉ vẽ người, con vật và đồ vật mà CẢNH nêu. Không nêu người → không có bóng người nào. Nhóm được nêu thì giữ nhỏ, làm nền cho môi trường; không bịa ra nhân vật chính.

THẾ GIỚI: quốc gia và thế kỷ mà CẢNH nêu quyết định kiến trúc, trang phục, giáp, vũ khí và đồ vật; hai phe được nêu thì mỗi phe giữ văn hóa riêng; không lấy gì từ nền văn hóa hay thời đại mà CẢNH không nêu.

CẢNH: [SCENE-SPECIFIC PROMPT]

LOẠI TRỪ: [GUARD], chân dung nhân vật, nhân vật khổng lồ ở tiền cảnh.`,
};
