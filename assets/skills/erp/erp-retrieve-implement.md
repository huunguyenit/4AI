---
id: erp-retrieve-implement
title: FBO — Retrieve button and filter wiring
kind: skill
domain: erp
description: Nút Lấy dữ liệu (Retrieve) trên Grid chi tiết — button một nguồn hay menuItems nhiều nguồn, dispatch theo commandArgument, Filter dẫn sang SingleForm hay MultiForm. Mở khi thêm hoặc sửa nguồn.
requires: [4ai-fbo]
see-also: [erp-controller-reference, erp-voucher-data-lookup, erp-js-implement, erp-view-design, erp-glossary-reference]
version: 1
---
**Retrieve** là nút *Lấy dữ liệu* trên toolbar của lưới chi tiết chứng từ đích
(`Grid\{SysID}Detail.xml`). Nó không phải một file — nó là một **chuỗi ba tầng**, và sửa
sai tầng là triệu chứng khó đọc nhất của luồng này: nút hiện ra nhưng bấm không ra gì,
hoặc ra form trắng.

```
Grid\{SysID}Detail.xml
  toolbar > <button command="Retrieve">        tầng 1 — khai nút, một nguồn hay N nguồn
        │   commandArgument = "10" | "30" …
        ▼
  <script> on${SysID}$ExecuteCommand           tầng 2 — guard + điều phối, g.showForm(...)
        │   showForm('{Src}Filter')
        ▼
Filter\{Src}Filter.xml                         tầng 3 — màn hình lọc
        ├── SingleForm: Filter\{Src}Form.xml      + Grid\{Src}Grid.xml
        └── MultiForm : Filter\{Src}MultiForm.xml + Grid\{Src}MultiGrid.xml
```

## Hai cái tên, đừng lẫn

| | Là gì | Nằm ở | Ví dụ |
|---|---|---|---|
| **mã ct** | Mã chứng từ 3 ký tự, thứ NSD và BA nói | `dmct.ma_ct` (db app) | `HDA`, `HD6` |
| **sysid** | Định danh controller, thứ **file được đặt tên theo** | `wcommand` (db sys) | `SVTran`, `VATran` |

File luôn đặt theo **sysid**: `Grid\SVDetail.xml` là lưới chi tiết của `SVTran` (mã ct `HDA`,
hoá đơn bán hàng), `Grid\VADetail.xml` của `VATran` (mã ct `HD6`).

`sysid` **không suy được** từ mã ct. Trong tay chỉ có mã ct thì gọi `resolve_vouchercode`
trước khi mở bất kỳ file nào — `find_controller` sẽ trượt. Bảng ánh xạ đầy đủ 122 chứng từ:
skill `erp-glossary-reference`.

`{Src}` trong sơ đồ trên cũng là sysid — của **họ file nguồn**, ví dụ `SVOrder` (đơn hàng)
hay `SVIssue` (phiếu xuất).

---

## Vùng đối chiếu — khai báo thật, khỏi phải đi tìm file

Ba khai báo dưới đây chép thẳng ra dùng được. Không phải đi tìm file mẫu, vì hai lý do:
`.f` là bản chuẩn **đã mã hoá, không đọc được**, còn bản `.xml` customize thì chương trình
của khách **có thể chưa có** — và version cũ lại khai khác nhau.

### A · Một nguồn — `<button>` phẳng, không `menuItems`

```xml
<button command="Retrieve">
  <title v="Lấy số liệu từ hóa đơn$$90" e="Extract Data from Invoice$$120"></title>
</button>
```

Bấm là chạy thẳng, `e.type.Value` **rỗng**. Mẫu: `Grid\VADetail`.

### B · Hai nguồn — `Include\XML\SVDetailRetrieve.txt` (sysid `SVTran`)

```xml
<button command="Retrieve">
  <title v="Toolbar.Retrieve" e="Toolbar.Retrieve"></title>
  <menuItems>
    <menuItem commandArgument="10" urlImage="../images/Menu/SalesOrder.png">
      <header v="Lấy số liệu từ đơn hàng" e="Extract Data from Sales Order"/>
    </menuItem>
    <menuItem commandArgument="20">
      <header v="-" e="-"/>
    </menuItem>
    <menuItem commandArgument="30">
      <header v="Lấy số liệu từ phiếu xuất" e="Extract Data from Pick List"/>
    </menuItem>
  </menuItems>
</button>
```

### C · Ba nguồn — `Include\XML\SeparateInvoice.SVDetailRetrieveToolbar.txt`

Cùng một nút, cấu hình tách hoá đơn. Đây là mẫu chuẩn để **thêm nguồn cho riêng một khách**:
một file Include mới, không sửa file gốc.

```xml
<button command="Retrieve">
  <title v="Toolbar.Retrieve" e="Toolbar.Retrieve"></title>
  <menuItems>
    <menuItem commandArgument="10" urlImage="../images/Menu/SalesOrder.png">
      <header v="Lấy số liệu từ đơn hàng" e="Extract Data from Sales Order"/>
    </menuItem>
    <menuItem commandArgument="20">
      <header v="-" e="-"/>
    </menuItem>
    <menuItem commandArgument="30">
      <header v="Lấy số liệu từ phiếu xuất bán" e="Extract Data from Pick List"/>
    </menuItem>
    <menuItem commandArgument="40">
      <header v="-" e="-"/>
    </menuItem>
    <menuItem commandArgument="50">
      <header v="Lấy số liệu từ phiếu xuất kho" e="Extract Data from Issue"/>
    </menuItem>
  </menuItems>
</button>
```

So B với C thấy ngay quy ước: **separator ăn một `commandArgument`** (`20`, `40`), nguồn thật
là `10`, `30`, `50`. Nguồn mới **nối vào cuối**, không chèn giữa.

Đối chiếu A/B/C là đủ để biết chương trình đang ở dạng nào — B2 chỉ giải thích luật, không
lặp lại XML.

---

## Bước 0 — Neo vào khách, trước mọi thứ khác

Chưa biết **program của khách nào** thì chưa bắt đầu. Tra bằng `list_programs` (thư mục
workspace đang đứng cũng tra được), nhắc lại program path để xác nhận, rồi mở entry trong
`ledger/tasks.md` trạng thái `Mới`.

Hai rule luôn-nạp cầm chỗ này, file này không thay thế chúng: `erp-program-scope`
(thay đổi chỉ nằm trong program của đúng khách đó) và `pm-ledger-discipline` (không có entry
thì việc chưa xong, kể cả khi code đã chạy). Quy trình đầy đủ ở `erp-customization-execute`.

---

## Bước 1 — Chốt hình dạng trước khi mở file

Ba câu hỏi, trả lời xong mới biết phải đụng bao nhiêu file:

| Câu hỏi | Nếu… | Thì… |
|---|---|---|
| Chứng từ đích lấy từ **mấy** nguồn? | 1 | `<button>` phẳng, không `menuItems` |
| | ≥2 | `<button>` + `<menuItems>`, mỗi nguồn một `commandArgument` |
| Mỗi lần lấy được **mấy** chứng từ nguồn? | 1 | SingleForm — `{Src}Form` + `{Src}Grid` |
| | nhiều | MultiForm — `{Src}MultiForm` + `{Src}MultiGrid` |
| Nút đã có sẵn chưa? | có | **chỉ thêm một `menuItem` + một `case`** — không viết lại tầng 1 |

Trả lời câu 3 bằng `describe_controller` trên `Grid\{SysID}Detail`, không bằng trí nhớ. Nút
đã có mà vẫn dựng lại từ đầu là cách phổ biến nhất làm hỏng một luồng đang chạy.

---

## Workflow

```
- [ ] B2. toolbar   — <button command="Retrieve">        toolbar-menu.md
- [ ] B3. script    — on$...$ExecuteCommand + case        script-dispatch.md
- [ ] B4. Filter    — Filter\{Src}Filter.xml              filter-single.md
- [ ] B5. Đích đến  — SingleForm hoặc MultiForm           filter-single.md / filter-multi.md
- [ ] B6. Đối chiếu — điều kiện Lookup == điều kiện MultiGrid
- [ ] B7. Verify    — bấm từng menuItem, kể cả nhánh bị chặn
```

---

## B2 — toolbar

XML đã có ở *Vùng đối chiếu* bên trên. Đây là luật đọc nó:

| Chi tiết | Nghĩa là |
|---|---|
| `$$90` trong `<title>` | **Độ rộng nút tính bằng pixel**, không phải một phần của nhãn. Bản tiếng Anh dài hơn nên thường `$$120` |
| `Toolbar.Retrieve` | Token runtime tự dịch. Chỉ dùng ở dạng nhiều nguồn — nhãn thật xuống `menuItem/header` |
| `header` bằng `-` | Đường phân cách, không phải nguồn — nhưng **vẫn ăn một `commandArgument`** |
| `commandArgument` | String, bước nhảy 10, bắt đầu từ `10`. So trong JS là `case '30'`, không `case 30` |
| `urlImage` | Không bắt buộc. Ảnh chưa có thì menu vẫn mở, ô ảnh trống, **không có lỗi nào báo ra** |

Các bẫy còn lại — đo `used_by` trước khi sửa Include, giữ nguyên encoding gốc:
[toolbar-menu.md]({REFDIR}/toolbar-menu.md).

---

## B3 — script điều phối

Cùng file, thẻ `<script>`. Ba hàm đi thành bộ; thiếu `dispose$` là rò handler khi đóng mở
lưới nhiều lần:

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

Hai guard **bắt buộc**, đặt trước `switch (e.type.Value)` chứ không lặp trong từng `case`:
chặn chế độ `View`, và `validFields` những field mà màn hình lọc sẽ dùng làm tham số.
Chi tiết: [script-dispatch.md]({REFDIR}/script-dispatch.md).

---

## B4/B5 — Filter và đích đến

`Filter\{Src}Filter.xml` khai `fields` + `views` của màn hình lọc. Field nào có xử lý trong
`<script>` thì field đó **truyền memvar sang Lookup**:

```javascript
f._looking = f.getItem('so_ct')._controlBehavior;
f._looking.add_loading(on$SVOrderFilter$Before$Loading);
```

Từ `command@event="Inserting"` của Filter, luồng rẽ hai hướng:

- **SingleForm** — gọi `{Src}Form` (hiển thị và gán giá trị từ `{Src}Grid` sang lưới chi tiết
  đích) → [filter-single.md]({REFDIR}/filter-single.md)
- **MultiForm** — gọi `{Src}MultiForm`, tắt SingleForm, dùng **mẫu SQL chuẩn** truyền
  `@vcNumber` + `@vcID` → [filter-multi.md]({REFDIR}/filter-multi.md)

---

## B6 — Bẫy lớn nhất: Lookup và MultiGrid phải cùng điều kiện

Field `so_ct` trên Filter có hai đường vào cùng một tập dữ liệu:

- NSD **bấm lookup** → `Lookup\{Src}Lookup.xml` lọc và trả danh sách
- NSD **gõ tay số ct** rồi Nhận → `Grid\{Src}MultiGrid.xml` lọc lại theo `@so_ct`

Hai file lọc **độc lập nhau**. Điều kiện lệch nghĩa là NSD chọn được một chứng từ trong
lookup rồi màn hình sau trả rỗng — và không có thông báo lỗi nào. Sửa một bên thì **bắt buộc**
sửa bên kia trong cùng lần.

---

## B7 — Verify

```
- [ ] Bấm từng menuItem, kể cả nhánh bị chặn có điều kiện (loai_ct, quyền, trạng thái)
- [ ] Mở ở chế độ View: nút không làm gì, không văng lỗi JS
- [ ] Bỏ trống field trong validFields: chặn đúng field, thông báo đúng nhãn
- [ ] Chọn từ lookup ra dữ liệu; gõ tay đúng số ct đó ra cùng dữ liệu
- [ ] MultiForm: chọn nhiều chứng từ nguồn, các cột OtherCopyField về đủ
- [ ] Đóng mở lưới ba lần liên tiếp: không nhân đôi handler
```

---

## Anti-pattern

```
❌  Dựng lại cả <button> khi chỉ cần thêm một menuItem
❌  Đánh commandArgument trùng, hoặc bỏ qua số mà separator đang chiếm
❌  Thêm menuItem mà quên case tương ứng trong ExecuteCommand — nút chết lặng
❌  Guard View đặt trong từng case thay vì trước switch
❌  Sửa điều kiện Lookup mà không sửa MultiGrid (và ngược lại)
❌  Đụng Include\XML\*Retrieve*.txt mà chưa đo list_related kind=used_by
❌  Normalize sang UTF-8 LF khi ghi lại — nguồn có thể là Windows-1258 hoặc UTF-8 BOM + CRLF
❌  Tự chế SQL truyền tham số sang MultiForm thay vì dùng mẫu chuẩn
```

---

## Tài liệu

| File | Nội dung |
|---|---|
| [toolbar-menu.md]({REFDIR}/toolbar-menu.md) | `<button>` một nguồn vs `menuItems`, đánh số `commandArgument`, separator, `urlImage`, hậu tố `$$` |
| [script-dispatch.md]({REFDIR}/script-dispatch.md) | Bộ ba `load$` / `dispose$` / `on$…ExecuteCommand`, guard, `validFields`, thêm nhánh vào nút đã có |
| [filter-single.md]({REFDIR}/filter-single.md) | `{Src}Filter` — fields/views, `_looking` + `add_loading`, memvar sang Lookup, `{Src}Form` + `{Src}Grid` |
| [filter-multi.md]({REFDIR}/filter-multi.md) | Mẫu SQL `Inserting` chuẩn, `@vcNumber` / `@vcID`, `OtherCopyField`, `queryFilterString`, `#t` trong MultiGrid |

Luồng kế thừa **số liệu** — `fsdSttRecRef`, proc `BeforeAfterUpdate`, trừ lượng trên chứng từ
nguồn — là việc của skill `erp-voucher-data-lookup`. File này chỉ lo phần nối dây.
