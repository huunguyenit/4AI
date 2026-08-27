# View attributes — height, anchor, split, categories

## `<view>` — thuộc tính chính

```xml
<view id="Dir" height="200+50" anchor="2" split="3">
```

`id="Dir"` gần như tuyệt đối: 648/650 view trong `Dir/` và **toàn bộ** view trong `Filter/` đều
mang id đó. "Filter cũng là view id Dir" — đừng đi tìm `id="Filter"`.

Chỉ số `anchor` / `split` là **1-based** (cột thứ N trên UI), khớp XSD FBO — không dùng index 0
khi ghi XML. Corpus không có `anchor="0"` nào; giá trị nhỏ nhất là `1`.

**Cả ba attr đều có thể là entity**: `height="&BI.Dir.Height;"`, `anchor="&BI.j;"`,
`anchor="&BI.PKTran.Form.Bottom.Anchor;"`. Đọc số trực tiếp trên file thô là đọc sai —
`resolve_entities` trước rồi mới kết luận.

---

## `height`

| Dạng | Ví dụ | Nghĩa |
|------|-------|--------|
| Số | `height="280"` | px |
| Biểu thức | `height="200+50"`, `100*2+20` | Chỉ `+ - * / ( )` và số |
| Entity | `height="&TabHeightFomula;"` | Công thức dùng chung, xem dưới |

**`height` không đặt chiều cao vùng main.** Vùng main co theo nội dung. `height` áp cho **tab
category không chứa Grid**; tab có field `itemsStyle="Grid"` lấy chiều cao từ `field@rows` của
chính field đó, `height` bị bỏ qua.

Chỉ khai `height`, **không** có `heigth` — biến thể typo đó không tồn tại trong corpus, đừng
chép nó vào file mới.

### `&TabHeightFomula;` — cách màn hình Filter đặt chiều cao

Đây là giá trị `height` phổ biến nhất của toàn corpus (564 view, gần như toàn bộ nằm ở `Filter/`).
Định nghĩa ở `Include/TabHeightFomula.ent`:

```text
TabHeightFomula = 16 + LineCounter * StandardHeight + 2 * ExtensionCounter
                     + 0 * OtherCounter + Render.DeltaTabHeight
StandardHeight = 24
```

Controller **khai đè** các counter trong DOCTYPE của chính nó, **trước** dòng nạp file `.ent` —
luật XML là khai báo đầu tiên thắng, nên đặt sau thì không có tác dụng:

```xml
<!ENTITY LineCounter "9">
<!ENTITY ExtensionCounter "1">
<!ENTITY % TabHeightFomula SYSTEM "..\Include\TabHeightFomula.ent">
%TabHeightFomula;
…
<view id="Dir" height="&TabHeightFomula;">
```

Đổi chiều cao một màn hình Filter = sửa `LineCounter` / `ExtensionCounter`, **không** gõ số px đè
lên `height`. Và `LineCounter` không nhất thiết bằng số `<item>` layout —
`Filter/CFAutoGenerateAdjustmentOther.f` có 5 hàng nhưng khai `LineCounter "9"`; đừng suy ngược
từ số hàng ra counter.

---

## `anchor` — neo cột khi phóng form

```text
Cột 1 .. anchor  → giữ nguyên px khi user phóng rộng form
Cột anchor+1 .. end → nhận phần rộng thêm (co giãn)
```

| Giá trị | Hành vi |
|---------|---------|
| `anchor="2"` | Hai cột đầu cố định px |
| Không có / `0` | Không neo — toàn bộ cột tham gia giãn |
| Ngoài `1..ColumnCount` | Sai — bị từ chối, không clamp |

**Không nhầm với resize tay:** đổi list px là đổi width nguồn; `anchor` chỉ quy tắc **phân bổ phần
dư** khi form rộng hơn tổng cột.

Thường đặt neo ở nhóm Label hẹp bên trái, để cột Input/Description bên phải giãn.

---

## `split` — hai table độc lập

```text
Cột 1 .. split     → table trái
Cột split+1 .. end → table phải
```

| Hệ quả | Chi tiết |
|--------|----------|
| Biên cứng | **Cấm** một control span (`1`+`0…`) vượt qua biên `split` |
| Độc lập | Hai nửa layout như hai bảng kề nhau — không gộp ô xuyên biên |
| Hàng phải khớp nhau | View có `@split` thì **không xoá hàng đã trống** ở một bên: hai nửa căn theo nhau, bớt một hàng là lệch cả bảng |
| Đổi split | Đổi attr `split` (hoặc bỏ) — không suy ra từ list width |

Ví dụ 5 cột, `split="3"`: biên nằm giữa cột 3 và 4. Pattern `10000` (một control span 5) **sai** vì
vượt biên; `100-1` **đúng** (span 3 nằm trọn bên trái, control còn lại bên phải).

Giá trị thật hay gặp: `split="10"` (127 view), `6`, `5`, `8` — tức là biên thường rơi ở giữa một
view nhiều cột, không phải ở cột 1–2.

---

## Columns theo vùng

```text
Main (top)     ← item value widths đầu tiên của view
Tab (index>0)  ← category@columns nếu có; không có thì dùng list của view
Footer (-1)    ← category index="-1" @columns nếu có; không có thì dùng list của view
```

```xml
<categories>
  <category index="1" columns="60, 140" anchor="1">
    <header v="Chi tiết" e="Detail"/>
  </category>
  <category index="-1" columns="100, 100, 9, 120, 100, 0, 0, 8, 100" anchor="3">
    <header v="" e=""/>
  </category>
</categories>
```

- `category` mang được `columns` / `anchor` / `split` riêng. Footer thường có list cột riêng và
  `<header>` rỗng — nó không phải tab, không vẽ nút.
- Field thuộc tab/footer: `<field name="…" categoryIndex="1">` hoặc `categoryIndex="-1"`;
  `categoryIndex` cũng có thể là entity (`categoryIndex="&GeneralCategoryIndex;"`).
- **Vùng của một hàng = `categoryIndex` của field ĐẦU TIÊN trong hàng có khai `categoryIndex`.**
  Không khai gì → vùng main. Khai index chưa có `<category>` tương ứng → hàng rơi về main.
  Đây là chỗ hay sai: hàng ở đúng vị trí trong file nhưng hiện sai tab, vì sửa `<item>` mà quên `<field>`.
- **Thứ tự tab = thứ tự khai trong `<categories>`, không sort theo index.** `index="9"` khai trước
  `index="2"` thì nó đứng trước trên UI.

**index:**

| index | UI |
|-------|-----|
| (không khai) / 0 | Vùng trên form (main) |
| `> 0` | Tab category |
| `-1` | Footer (không phải tab) |

---

## Bẫy hình dạng file — đọc trước khi viết script sửa hàng loạt

`Dir/Customer.xml` là file mẫu để đối chiếu; nó có đủ những hình dạng mà file tự nghĩ ra không có:

- `<categories>` nằm **sau** toàn bộ khối `<item>`, không phải đầu view;
- entity đứng giữa hai `<item>` trên cùng một dòng, và entity `<category>` giữa `<categories>`;
- entity trong **giá trị thuộc tính**: `anchor="&BI.j;"`, `height="&BI.Dir.Height;"`;
- `<field name="&k;">` — field khai bằng entity, và `[&k;]` trong item value.

---

## Quan hệ với chỉnh item

Khi đổi `anchor` / `split` / `columns`:

1. Cập nhật attr / list px.
2. Duyệt mọi pattern hàng vùng đó: không để span xuyên `split` mới.
3. Kiểm mọi `1` còn nằm trong số cột mới (thêm cột thì không sao; **bớt cột thì pattern bị cắt**).

Khi chỉ đổi `height`: không đụng pattern.

---

## Ví dụ tham chiếu

```xml
<view id="Dir" height="320" anchor="2" split="4">
  <item value="90, 30, 100, 100, 180, 180"/>
  <!-- 6 cột; neo 2 cột đầu; biên giữa cột 4 và 5 -->
  <item value="1100--: [ma_kh].Label, [ma_kh]"/>
  <!-- Label 1 cột | Input span 3 (30+100+100) — trọn bên trái biên; hai cột phải trống -->
  <categories>
    <category index="1" columns="120, 200">
      <header v="Khác" e="Other"/>
    </category>
  </categories>
</view>
```
