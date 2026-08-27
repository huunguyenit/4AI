# Tầng 2 — điều phối click trong thẻ `<script>`

Cùng file với toolbar. Nút chỉ phát sự kiện; **mọi quyết định nằm ở đây**.

## Bộ ba hàm

```javascript
function load$GridVoucherDetail$(g) {
  g.add_commandEvent(on$GridVoucherDetail$ExecuteCommand);
}
function dispose$GridVoucherDetail$(g) {
  try {g.remove_commandEvent(on$GridVoucherDetail$ExecuteCommand);} catch (ex) {}
}
function on$GridVoucherDetail$ExecuteCommand(sender, e) {
  var action = e.type.Action, g = sender, f = g.get_element().parentForm;
  switch (action) {
  case 'Retrieve':
    if (f._action == 'View') break;
    if (!f.validFields('ma_kh, ngay_lct')) break;
    switch (e.type.Value) {
    case '10':
      g.showForm('SVOrderFilter');
      break;
    case '30':
      if (f.getItemValue('loai_ct') != '2') g.showForm('SVIssueFilter');
      break;
    default:
      break;
    }
    break;
  }
}
```

`dispose$` bọc `try/catch` là cố ý: hàm này chạy cả khi lưới chưa kịp `load$`, và một
exception ở đó chặn luôn việc đóng form. Thiếu `dispose$` thì mỗi lần mở lại lưới cộng thêm
một handler, và một cú bấm chạy `showForm` nhiều lần.

## Ba biến ở dòng đầu

| Biến | Là gì |
|---|---|
| `e.type.Action` | Tên `command` của nút — `'Retrieve'`, `'Copy'`, `'Delete'`… |
| `e.type.Value` | `commandArgument` của `menuItem` được bấm. **Rỗng** khi nút dạng một nguồn |
| `f` | Form phiếu cha, lấy qua `g.get_element().parentForm` — không phải lưới |

Đọc field của phiếu thì dùng `f`, đọc dòng lưới thì dùng `g`. Nhầm hai cái này là lỗi
`undefined` khó truy nhất trong luồng Retrieve.

## Hai guard bắt buộc, đặt trước `switch (e.type.Value)`

```javascript
if (f._action == 'View') break;
if (!f.validFields('ma_kh, ngay_lct')) break;
```

- **`View`** — chế độ xem không được sinh dòng mới. Không guard thì NSD lấy được số liệu vào
  một phiếu chỉ-đọc và nó biến mất khi đóng form.
- **`validFields`** — liệt kê đúng những field mà màn hình lọc sẽ dùng làm tham số
  (`ma_kh` để lọc khách, `ngay_lct` để lọc kỳ). Hàm tự bật thông báo và tự focus vào field
  thiếu, nên không cần tự viết `$message.show`.

Đặt hai guard **một lần, trước `switch` con**. Lặp trong từng `case` là cách chắc chắn để
lần thêm nguồn thứ ba sẽ quên một cái.

## Điều kiện riêng của từng nhánh

Điều kiện chỉ đúng cho một nguồn thì đặt trong `case` của nguồn đó:

```javascript
case '30':
  if (f.getItemValue('loai_ct') != '2') g.showForm('SVIssueFilter');
  break;
```

Ở đây loại chứng từ `2` không được lấy từ phiếu xuất. Lưu ý mẫu này **im lặng** — không thoả
điều kiện thì không có gì xảy ra, không có thông báo. Nếu nghiệp vụ cần NSD biết vì sao, thêm
`else` gọi `$message.show`; đừng để họ bấm mãi một nút không phản ứng.

## Thêm một nguồn vào nút đã có

Hai chỗ, **luôn đi cùng nhau**:

```
- [ ] menuItem mới trong <menuItems> — commandArgument nối tiếp, +10
- [ ] case mới trong switch (e.type.Value) — cùng con số, dạng string
```

Thêm `menuItem` mà quên `case`: menu hiện ra, bấm không có gì. Thêm `case` mà quên
`menuItem`: code chết, không ai gọi tới. Cả hai đều không sinh lỗi lúc build.

## Đặt tên hàm

`$GridVoucherDetail$` trong mẫu là **placeholder theo `Identity` của controller** — tức là
sysid trong `wcommand` (`SVDetail`, `VADetail`), không phải mã chứng từ trong `dmct.ma_ct`.
Trong file thật nó thường được viết bằng entity: `on$]]>&Identity;<![CDATA[$ExecuteCommand`.
Đổi tên hàm thì đổi cả ba chỗ — `add_commandEvent`, `remove_commandEvent`, và khai báo hàm.

Quy ước đặt tên đầy đủ Dir vs Grid: skill `erp-js-implement` → `naming.md`.
