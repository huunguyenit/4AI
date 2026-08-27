# Render pipeline — từ XML ra HTML trên trình duyệt

Màn hình FBO không được vẽ bằng tọa độ. Nó được **sinh ra**: XML đọc thành model, model đổ ra
HTML, HTML nằm trong DOM của trình duyệt. Nguyên tắc của tầng designer là
*What You Design Is What Runtime Executes* — cái nhìn thấy lúc thiết kế phải là cái runtime chạy.
Hệ quả cho người sửa XML: **muốn đổi giao diện thì đổi cái sinh ra nó**, không có lớp trung gian
nào để chỉnh px cho riêng một ô.

```text
Dir/Filter XML
   ↓  bỏ DOCTYPE, phân giải/khử entity
<fields> + <views>
   ↓  parse
layout model  (ColumnWidths · Rows · Cells · Categories)
   ↓  build
HTML <table>
   ↓
DOM
```

---

## Bảng ánh xạ XML → HTML

| XML | Ra HTML |
|---|---|
| `<view>` | `div.FormParent` (bọc tất cả) |
| `<title v e>` | `div.UpdateDlgTitle` — luôn hiện dạng «Thêm {title}» |
| Vùng main | `div.FormRegion[data-dwf-region=main]` > `table.FormTable` |
| `<item value="w1, w2, …">` | Hàng ẩn `tr.DwfColRow` gồm các `th style="width:{w}px"`; bảng nhận `style="width:{tổng}px; table-layout:fixed"` |
| Một `<item>` layout | `tr.FormRow` |
| Một ô (một `1` + các `0`) | `td colspan="{span}"` |
| `[f].Label` | `td.FormCell.FormLabel` — nội dung `<field><header>`; field bắt buộc nhập thêm `.FormRequiredLabel` |
| `[f]` | `td.FormCell` > `div.FormContainerInput` > control dựng theo `type`/`<items>` |
| `[f].Description` / `[f].Footer` | `td.FormCell.FormDescription` — nội dung `<field><footer>`, không có thì `<header>` |
| Ô `-` | `td.FormCell.DwfEmptyCell` |
| `<categories>` có `index > 0` | `div.DwfTabs` — một `button[role=tab]` + một `section[role=tabpanel]` mỗi category |
| `category index="-1"` | `div.FormRegion[data-dwf-region=footer]` > `div.UpdateDlgContent` > `table` |

Ba điều rút ra được từ bảng này mà không rút ra được từ việc đọc XML:

1. **Bề rộng bảng = tổng list px.** Không có `width:100%`. Thêm một cột 200px là kéo cả form
   rộng thêm 200px, không phải chia lại chỗ cũ.
2. **`table-layout: fixed`.** Nội dung dài không đẩy cột rộng ra — nó bị `overflow:hidden` cắt.
   Nhãn dài mà thấy cụt là thiếu cột px, không phải lỗi font.
3. **Không có khái niệm width cho một ô.** `colspan` là toàn bộ cách một ô rộng hơn.

---

## Cái gì bị bỏ khi render

| Trường hợp | Kết quả |
|---|---|
| Field `hidden="true"` trong hàng **hỗn hợp** | `td` vẫn phát ra để giữ cột, nhưng rỗng và không nhận thao tác |
| **Mọi** control trong hàng đều `hidden` | Cả `tr` **không** được phát ra — hàng biến mất khỏi form nhưng vẫn còn nguyên trong XML |
| `1` rơi ngoài số cột (pattern dài hơn list px) | Bị cắt cùng phần pattern thừa; token tương ứng không ra ô nào |
| `.Description` mà field không có `<footer>` | Rơi về `<header>`; `<header v="" e="">` thì ô rỗng |

Hai dòng đầu là câu trả lời cho “khai field rồi mà không thấy đâu”: kiểm `hidden` **trước** khi
nghi pattern.

---

## Ô không phải một control đơn

`field@itemsStyle="Grid"` biến ô Input thành **cả một Grid Detail nhúng**: controller lấy từ
`items@controller`, chiều cao lấy từ `field@rows`. Tab chứa field kiểu này bỏ qua `view@height`.

```xml
<field name="detail" rows="180">
  <items style="Grid" controller="SaleOrderDetail"/>
</field>
```

`rows` còn dùng cho ô chữ: `rows > 1` → textarea nhiều dòng thay vì input một dòng.

---

## Nội dung HTML trong `<header>` / `<footer>`

`<header>` và `<footer>` được decode entity rồi lọc qua allowlist: chỉ `u`, `span`, `div`, `br`
sống sót, và chỉ giữ được attribute `class`. Mọi thẻ khác bị encode thành chữ hiện ra trên form.

Đừng nhét `<img>`, `<a>`, `<table>`, `style="…"` hay handler `onclick` vào header/footer —
chúng không chạy, chúng hiện nguyên văn.

---

## Quan hệ với tài liệu nền

Kiến trúc tầng designer và các luật của nó nằm ở `DevWorkFlow/docs/04-DESIGNER_PLATFORM.md`
(có mục *Trạng thái thực tế* ghi rõ chỗ nào doc đã lệch code). Skill này chỉ lấy phần **ngữ nghĩa
XML → HTML** để sửa XML cho đúng; luồng Command / Undo / DOM patch của IDE không thuộc phạm vi ở đây.
