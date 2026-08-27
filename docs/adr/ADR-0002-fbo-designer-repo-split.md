# ADR-0002: FBO Designer thành repo riêng, tách `fbo-core` zero-dep dùng chung với hub

- Trạng thái: Chấp nhận
- Ngày: 2026-08-25
- Khách/Phạm vi: hub 4AI (không riêng khách nào — thêm một repo anh em và một ràng buộc lên `mcp/fbo/`)

## Bối cảnh

Có nhu cầu dựng một extension VS Code (`.vsix`) cho phép **xem và kéo thả thiết kế** form FBO
ngay trong IDE, thay vì đọc `<item value="1100: [ma_kh].Label, [ma_kh]"/>` rồi hình dung trong
đầu. DevWorkFlow đã làm việc này bằng WPF + WebView2, nhưng toàn bộ tầng render và tầng layout
viết bằng C# (`DesignFormHtmlBuilder` 406 dòng, `LayoutEngine` 1.090, `ErpLayoutOperations`
1.112, `EntityViewWritebackPlanner` 883) và repo đó không có một dòng JS/TS nào. Hướng đã chốt
là **viết mới trên Node**, lấy DevWorkFlow làm tham chiếu ngữ nghĩa chứ không port code.

Ba ràng buộc va vào nhau:

1. Hub 4AI có hard rule **zero npm dependency**. Extension VS Code thì bắt buộc có
   `@types/vscode`, và về sau là bundler + `vsce`.
2. Hub tự mô tả trong `CLAUDE.md` là **compiler**, không phải ứng dụng. Nhét một sản phẩm có
   giao diện vào trong nó làm hỏng chính câu định nghĩa đó.
3. Nhưng phần lõi — decode Windows-1258, phân giải entity, đại số `item value` — thì **cả hai
   bên đều cần**: `mcp/fbo/` đang có `encoding.mjs` và `xmlscan.mjs`, còn designer cần đúng
   những thứ đó cộng thêm offset để ghi ngược. Để hai bản là chấp nhận trước hai hành vi khác
   nhau cho cùng một file XML.

## Quyết định

Chúng tôi sẽ tạo **repo riêng `FboDesigner`** (đặt cạnh DevWorkFlow trong `Development/`), chia
làm hai package:

- **`core/`** — ESM `.mjs`, **runtime dependency = 0**, không chạm `vscode`, không chạm DOM.
  Chứa encoding, span/offset, đại số `item value`, và render model → HTML. Test chạy bằng
  `node` trần, cùng lối viết với `tests/` của hub.
- **`extension/`** — vỏ VS Code. Có `package.json` với **dev-dependency thôi**; runtime vẫn
  bằng không ở P0 (JavaScript trần, không bundler, F5 là chạy).

Hub 4AI **không chứa code của designer**. Chiều phụ thuộc chỉ có một: sau này `mcp/fbo/` sẽ
import `fbo-core` thay vì giữ bản `encoding.mjs` riêng — không bao giờ ngược lại. Việc chuyển
đó là một bước riêng, không làm cùng lúc với P0.

Ngữ nghĩa render và ngữ nghĩa layout lấy từ hai file đặc tả đã có trong hub —
`assets/skills/erp/erp-view-design/references/reference-render-pipeline.md` và
`reference-item-value.md` — hai file này là **nguồn thật**, code là bản cài đặt. Lệch nhau thì
sửa code, trừ khi phát hiện đặc tả sai so với corpus, khi đó sửa đặc tả trước rồi mới sửa code.

## Hệ quả

**Được**: hard rule zero-dependency của hub còn nguyên, và định nghĩa "hub là compiler" cũng
còn nguyên. Designer được tự do chọn công cụ (TypeScript, bundler, `vsce`) mà không kéo theo
gì vào hub. Lõi có một bản duy nhất, test được headless, không cần mở VS Code.

**Mất**: một repo nữa để trông. Và trong lúc `mcp/fbo/lib/encoding.mjs` chưa chuyển sang import
`fbo-core`, tồn tại **hai bản encoding song song** — chấp nhận có ý thức, đổi lấy việc P0 không
phải sửa hub. Nợ này phải trả, không phải trạng thái vĩnh viễn.

**Ràng buộc phát sinh**:

- `core/` không được import `vscode`, không được chạm filesystem output. Mọi phép sửa layout là
  hàm thuần `(model, op) → { model, splices }`; ai ghi là việc của tầng extension. Đây là cùng
  một luật với `writer.mjs` của hub, và cùng một lý do: mất nó là mất khả năng dry-run và mất
  khả năng test.
- Ghi ngược **phải là splice lên byte gốc**, không bao giờ parse-rồi-serialize-lại cả file.
  Nguồn FBO có thể Windows-1258 + CRLF + BOM và luật hub là giữ nguyên; một designer serialize
  lại sẽ viết đè UTF-8 LF ngay lần lưu đầu và hỏng im lặng.
- Ô layout đến từ file entity (`&Name;`) thì designer **khoá**, không sửa tại chỗ — sửa entity
  là sửa chung nhiều controller. Đây là luật `fbo-entity-resolution-first` chuyển từ lời dặn
  thành hành vi của UI.
- Nếu spike P0 kết luận VS Code không giữ được Windows-1258 qua `CustomTextEditorProvider`,
  quyết định về **tầng vỏ** (custom editor hay webview panel tự quản I/O) phải viết ADR mới.
  ADR này không chốt chuyện đó.
