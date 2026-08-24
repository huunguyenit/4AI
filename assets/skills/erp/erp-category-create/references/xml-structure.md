# XML — Cấu trúc Dir + Grid & khóa chính

## Dir (form)

```xml
<dir table="{table}" code="{pk_cols}" order="{pk_cols}" xmlns="urn:schemas-fast-com:data-dir">
  <fields>...</fields>
  <views>...</views>
  <commands>...</commands>   <!-- validation: check-trung.md -->
  <script>...</script>
</dir>
```

## Grid (list)

```xml
<grid table="{table_or_view}" code="{pk_cols}" order="{pk_cols}" xmlns="urn:schemas-fast-com:data-grid">
  <fields>...</fields>
  <views>...</views>
  <toolbar>...</toolbar>
</grid>
```

- Grid thường trỏ **view** `zv...` (join DM / user info). `code`/`order` vẫn là tên cột bảng gốc.

---

## Khóa chính

### Đơn

```xml
<dir code="ma_xx" order="ma_xx" ...>
  <field name="ma_xx" isPrimaryKey="true" allowNulls="false"/>
```

### Kép

`code`/`order` liệt kê đủ cột; mỗi cột `isPrimaryKey="true"`:

```xml
<dir code="col1, col2" order="col1, col2" ...>
  <field name="col1" isPrimaryKey="true" allowNulls="false"/>
  <field name="col2" isPrimaryKey="true" allowNulls="false"/>
```

Áp dụng **cả** Dir và Grid. Tham chiếu: `zcdmtknhncc.xml` (`ma_kh, tk_nh`).

---

## Field thường gặp

| Nhu cầu | Khai báo |
|---------|----------|
| Mã upper | `dataFormatString="@upperCaseFormat"` + `Mask` |
| Chọn 1 | `AutoComplete` + `reference` + field `%l` external |
| Chọn nhiều (CSV) | `Lookup` — lưu `A, B, C` → pattern C trong [check-trung.md](check-trung.md) |
| Boolean | `type="Boolean"` + `CheckBox` |
| Trạng thái | `dataFormatString="0, 1"` + `Mask` |

---

## Cột hệ thống

Thường có: `status`, `datetime0`, `datetime2`, `user_id0`, `user_id2`. Gán trong Inserting/Updated.
