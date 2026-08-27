# XML — Cấu trúc Dir + Grid & khóa chính

## Dir (form)

```xml
<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE dir [
  <!ENTITY ScriptIrregular SYSTEM "..\Include\Javascript\Irregular.txt">
]>
<dir table="{table}" code="{pk_cols}" order="{pk_cols}" xmlns="urn:schemas-fast-com:data-dir">
  <title v="…" e="…"></title>
  <fields>…</fields>
  <views>…</views>
  <commands>…</commands>   <!-- validation: check-trung.md -->
  <script>…</script>
</dir>
```

`xmlns="urn:schemas-fast-com:data-dir"` — 647/655 file `Dir/`. Vài file dùng namespace khác
(`data-form`, `dir-fields`) vì chúng là mảnh Include, không phải màn hình hoàn chỉnh.

## Grid (list)

```xml
<grid table="{table_or_view}" code="{pk_cols}" order="{pk_cols}" xmlns="urn:schemas-fast-com:data-grid">
  <fields>…</fields>
  <views>…</views>
  <toolbar>…</toolbar>
</grid>
```

Grid trỏ thẳng bảng, hoặc trỏ một **view** join sẵn cột hiển thị (247 file trong sản phẩm chuẩn).
View của sản phẩm chuẩn đặt tên `v…`; view **customize** đặt tên `zv…` — song song với `zc` của
bảng. `code`/`order` vẫn là tên cột bảng gốc, không phải alias của view.

---

## Khóa chính

### Đơn

```xml
<dir table="zcdmloaihdv" code="ma_loai" order="ma_loai" …>
  <field name="ma_loai" isPrimaryKey="true" dataFormatString="@upperCaseFormat" allowNulls="false">
```

### Kép

`code`/`order` liệt kê đủ cột, cách nhau dấu phẩy; mỗi cột `isPrimaryKey="true"`:

```xml
<dir code="loai_nh, ma_nh" order="loai_nh, ma_nh" …>
  <field name="loai_nh" isPrimaryKey="true" allowNulls="false"/>
  <field name="ma_nh"   isPrimaryKey="true" allowNulls="false"/>
```

Áp dụng **cả** Dir và Grid. Khoá kép có thật tới 4 cột trong sản phẩm chuẩn
(`code="ma_dvcs, ma_so, ky, nam"`) và tới 5 cột trong `Dir/LotVoucherBalance.xml`.

---

## Field thường gặp

| Nhu cầu | Khai báo | Ghi chú |
|---------|----------|---------|
| Mã upper | `dataFormatString="@upperCaseFormat"` + `<items style="Mask"/>` | dạng chuẩn của cột mã |
| Số | `<items style="Numeric"/>` | style phổ biến nhất (1.886 lần) |
| Chọn 1 | `<items style="AutoComplete" reference="…"/>` + field `%l` external | 1.582 lần |
| Chọn nhiều (CSV) | `<items style="Lookup"/>` — lưu `A, B, C` | pattern C trong [check-trung.md](check-trung.md) |
| Danh sách cố định | `<items style="DropDownList">` + các `<item value="…"><text v e/></item>` | `<item>` ở đây **không** phải layout |
| Trạng thái | `dataFormatString="0, 1"` + `Mask` + `inactivate="true"` + `<footer>` giải nghĩa | dạng chuẩn cột `status` |
| Boolean | `type="Boolean"` | `<items style="CheckBox"/>` chỉ 14 chỗ trong toàn corpus — thường không cần khai |

---

## Cột hệ thống

Năm cột audit: `status`, `user_id0`, `user_id2`, `datetime0`, `datetime2`.

Gán trong `Inserting` bằng cách **gán vào biến `@` cùng tên cột** (runtime mang xuống INSERT),
và đóng dấu lại trong `Updated`:

```sql
-- Inserting
select @datetime0 = getdate(), @datetime2 = getdate(), @user_id0 = @@userID, @user_id2 = @@userID

-- Updated
update @@table set datetime2 = getdate(), user_id2 = @@userID where {pk} = @{pk}
```

Bộ sinh DDL tự thêm đủ 5 cột cho `kind: "danh-muc"` — không phải khai tay trong đặc tả.

---

## Khối `<script>` — JS của màn hình

Danh mục thường gắn JS qua cặp `Loading` / `Closing`: hai command đó **không validate gì**, chúng
trả về một lệnh JS dưới dạng `message` để client chạy.

```xml
<command event="Loading">
  <text><![CDATA[
select 'active$Form{ctrl}(this);' as message
return
]]></text>
</command>

<command event="Closing">
  <text><![CDATA[
select 'close$Form{ctrl}(this);' as message
return
]]></text>
</command>

<script>
  <text><![CDATA[
function active$Form{ctrl}(f) { f.add_onResponseComplete(on$Form{ctrl}$ResponseComplete); }
function close$Form{ctrl}(f)  { try { f.remove_onResponseComplete(on$Form{ctrl}$ResponseComplete) } catch (ex) {} }
function on$Form{ctrl}$ResponseComplete(sender, e) {
  var f = e.object, context = e.type.Context, result = e.type.Result;
  switch (context) {
    case 'Checking':
      objectBehavior$Dir$Irregular.checkCode(f, '{pk_col}');
      break;
  }
}
]]>
    &ScriptIrregular;
  </text>
</script>
```

Đối xứng `active$` / `close$` là bắt buộc: đăng ký handler mà không gỡ thì mở/đóng form nhiều lần
sẽ chạy handler chồng nhau. `&ScriptIrregular;` nạp `Include\Javascript\Irregular.txt` — chỗ định
nghĩa `objectBehavior$Dir$Irregular`.

Chi tiết bề mặt JS: skill `erp-js-api-reference`.

---

## Bẫy cú pháp

- **Entity giữa CDATA** phải đóng rồi mở lại: `where ]]>&k;<![CDATA[ = @]]>&k;<![CDATA[`
  (`Dir/Customer.xml`). Viết thẳng `&k;` trong CDATA thì nó là bảy ký tự chữ, không phải entity.
- **Không dòng trắng thừa trong CDATA** và không format-on-save — diff phình ra che mất thay đổi thật.
- **Encoding**: `.f`/`.xml` có thể là Windows-1258 + CRLF + BOM. Đọc bằng `read_source`, ghi giữ
  nguyên — xem `erp-xml-encoding`.

---

## Ví dụ tham chiếu

`Dir/zcdmlhdv.f` + `Dir/zcdmlhdv.xml` (bảng `zcdmloaihdv`) là cặp `.f`/`.xml` đầy đủ của một
danh mục `zc` trong **sản phẩm chuẩn**: 4 field, khoá đơn `ma_loai`, đủ 5 command, khối `<script>`.
Bản `.f` có commands mã hoá, bản `.xml` có commands chữ thường — đọc cả hai để thấy đúng mô hình.
