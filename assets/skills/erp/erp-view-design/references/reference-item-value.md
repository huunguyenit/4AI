# Item value — columns, pattern, control

## Ba loại `<item>` khác nhau trong một file Dir

| Ở đâu | Ví dụ | Là gì |
|---|---|---|
| Con đầu tiên của `<view>`, không có `:` | `<item value="120, 30, 45, 25, 65"/>` | **Column widths** (px) |
| Con của `<view>`, có `:` | `<item value="1100: [ma_kh].Label, [ma_kh]"/>` | **Hàng layout** |
| Con của `<field><items>` | `<item value="0"><text v="Không tính" e="None"/></item>` | **Lựa chọn dropdown** — không dính gì tới layout |

Loại thứ ba chiếm gần một phần tư số thẻ `<item>` trong `Dir/` + `Filter/`. Grep `<item value`
rồi sửa mà không nhìn thẻ cha là sửa nhầm danh sách chọn của một combo.

```xml
<view id="Dir" height="280" anchor="2" split="3">
  <item value="100, 80, 100, 120, 200"/>
  <item value="1100-: [ma_kh].Label, [ma_kh]"/>
  <item value="1----: [ngay_ct].Label"/>
</view>
```

- Item widths: 5 cột.
- Hàng 1: `1100-` → Label 1 cột + Input span 3 cột (80+100+120 = 300px) + 1 cột trống; **2** ký tự `1` = **2** token.
- Hàng 2: chỉ Label ở cột đầu.

**Chỉ item ĐẦU TIÊN mới được coi là widths.** Nếu item đầu đã có `:` thì view không có list cột
nào cả — số cột suy từ độ dài pattern và mọi ô rộng như nhau. Đừng chèn list px vào giữa view và
mong nó có tác dụng.

Width `0` là hợp lệ và có thật (`… 25, 0, 203`): cột 0px làm chỗ neo/đệm, không hiện gì.

---

## Pattern (`1` / `0` / `-`)

| Ký tự | Nghĩa |
|-------|--------|
| `1` | Bắt đầu một control mới — lấy **token kế tiếp** trong danh sách sau `:` |
| `0` | Nối tiếp control trước — tăng `ColumnSpan`, cộng width |
| `-` | Ô trống (không gán control) |

Quy tắc:

1. Số lần gặp `1` **phải** = số token control sau `:`. Đây là bất biến duy nhất không được phá.
2. Độ dài pattern **không** bắt buộc bằng số cột:
   - ngắn hơn → pad `-` cho đủ (rất phổ biến: `1100` trên view 13 cột);
   - dài hơn → **cắt cụt** về đúng số cột. Cắt phần toàn `0` thì vô hại; cắt trúng một `1` là mất
     control mà không có thông báo nào.
3. `0` chỉ có nghĩa ngay sau một `1` (hoặc sau `0` continuation). `0` đứng đầu / sau `-` không nối
   được vào đâu → thành ô trống.
4. Ký tự lạ (không phải `1`/`0`/`-`) được xử như `-`.
5. **Merge (span):** `1` + thêm `0` liền kề. `1---` → `1000` = một control rộng 4 cột.
6. **Tách:** bỏ `0` → thường đổi thành `-` hoặc `1` control mới.

Width hiển thị của control = `sum(ColumnWidths[start .. start+span))`, ra thẳng `colspan` trên `<td>`.

**`field@columns` KHÔNG phải chỗ chỉnh độ rộng ô.** `<field name="loai_cl_no" columns="3">` là
thuộc tính của field, không tham gia tính layout — bề rộng ô đến từ list px của view cộng theo span.

---

## Token control (sau `:`)

Thứ tự token = thứ tự các `1` trái → phải.

| Token | Ô UI | Nội dung lấy từ |
|-------|------|------------------|
| `[field].Label` | Nhãn | `<field><header v e>`; field bắt buộc nhập thì nhãn mang class required |
| `[field]` | Ô nhập (Input) | control dựng theo `type` / `<items>` của field |
| `[field].Description` | Ô chữ mô tả | `<field><footer>`; **không có `<footer>` thì rơi về `<header>`** |
| `[field].Footer` | Giống `.Description` | cùng đường render — `.Footer` **không** đẩy ô xuống vùng footer |

Đo trên corpus `Dir/` + `Filter/`: `.Label` 15.806 · `.Description` 3.801 · `.Footer` 27.

Ba điều dễ sai:

- **`.Footer` không phải vùng footer.** Vùng footer do `categoryIndex="-1"` của field quyết định.
  `Dir/Customer.xml` dùng `[ma_so_thue].Footer` ngay giữa vùng main.
- **`[field].` (chấm rỗng) không phải biến thể footer** — không có kind nào sau dấu chấm thì nó
  được đọc như `[field]`, tức là ô Input.
- **Typo có thật trong corpus:** `.Desciption` (95 lần), `.Discription`, `.Desscription`. Chúng
  không phải kind hợp lệ. Copy nguyên một hàng cũ là copy luôn cả typo — sửa lại thành
  `.Description` khi chạm vào hàng đó.

Cùng một `field` thường nằm **cùng hàng** theo bộ Label + Input (+ Description).

Tên trong `[]` phải khớp **nguyên văn** `<field name="…">`:

- hậu tố `%l` là một phần của tên: `[ten_tk%l]` ↔ `<field name="ten_tk%l">` — đừng bóc phần sau `%`;
- tên có thể chính là entity: `[&k;]` ↔ `<field name="&k;">` — so nguyên văn, không expand rồi so.

---

## Entity trong item (`&name;`)

Item có thể lai:

```text
110&UnitCols;: [&UnitFields;].Label, [&UnitFields;]
```

- Phần pattern / control thuộc **literal** → sửa trên item host (Dir…).
- Phần thuộc **entity** → sửa **value trong file entity**, giữ `&…;` trên Dir.
- **Không** thay cả `item value` bằng bản ClearText đã expand khi raw còn `&…;` (dễ nhân đôi hàng
  khi reparse).
- Entity còn xuất hiện **giữa hai `<item>` như một thẻ anh em**, thường dồn hết vào cuối một dòng:

  ```xml
  <item value="1100-------: [ngay_gh].Label, [ngay_gh]" />&EBanking.Customer.View;&BI.Dir.View.Code;<item value="-1100000000: [khong_kt_mst], [khong_kt_mst].Label" />
  ```

  Mỗi entity đó bung ra thêm nhiều hàng. Đếm hàng bằng cách đếm thẻ `<item>` trên file thô là
  đếm thiếu — phải `resolve_entities` trước.
- **Item nằm trong file entity thì không xoá được từ phía controller.** Layout đó dùng chung nhiều
  controller; muốn bỏ hàng thì phải quyết ở file entity, có đo `used_by` trước.

Khi chỉ thêm field inline trên Dir thuần (không entity): sửa pattern + token trực tiếp.

---

## Chọn pattern theo ý định

| Ý định | Pattern (ví dụ 4 cột) | Tokens |
|--------|----------------------|--------|
| Label \| Input \| trống \| trống | `11--` | `[f].Label, [f]` |
| Label 1 cột + Input span 3 | `1100` | `[f].Label, [f]` |
| Chỉ Input full hàng (4 cột) | `1000` | `[f]` |
| Ba control riêng | `111-` | ba token |
| Bỏ cột giữa | `1-1-` | hai token |

---

## Ví dụ tham chiếu (không phải định nghĩa)

Hàng thật trong `Dir/Customer.xml` — view 13 cột `"120, 30, 45, 25, 65, 45, 30, 25, 65, 75, 25, 0, 203"`:

```xml
<item value="1100: [&k;].Label, [&k;]" />
<item value="10100100000000000: [tk].Label, [tk], [ten_tk%l]" />
<item value="111000000000: [status].Label, [status], [status].Description" />
```

- Hàng 1: pattern 4 ký tự trên view 13 cột → pad `-` chín lần. Hợp lệ, rất thường gặp.
- Hàng 2: pattern 17 ký tự → cắt còn 13. Ba `1` nằm ở cột 1, 3, 6 nên không mất token nào.
- Hàng 3: `1`, `1`, `1` ở ba cột đầu → Label, Input, Description cạnh nhau.
