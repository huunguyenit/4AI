# Customize HDDT — XML / SQL

Đọc `dmhddtbs`, body `FastBusiness$EInvoice$Customize`, `Dir/{Tran}.xml`, Structure Proxy **trước** khi vá (MCP `query_sql` / `read_source`).

Tra cứu `ma_ct` → file (không phải định nghĩa pattern):

| `ma_ct` | Dir | Grid dòng | Master | Detail |
|---------|-----|-----------|--------|--------|
| HD1 | `ARTran` | `ARDetail` | `m21$` | `d21$` |
| HDA | `SVTran` | `SVDetail` | `m81$` | `d81$` |
| HD2 | `SDTran` | `SDDetail` | `m22$` | `d22$` |
| HD4 | `SPTran` | `SPDetail` | `m25$` | `d25$` |
| HD5 | `AITran` | `AIDetail` | `hddc` | — |
| HD6 | `VATran` | `VADetail` | `m42$` | `d42$` |
| HDF | `SRTran` | `SRDetail` | `m76$` | `d**$` |

Khác `ma_ct`: `hddtfields` / `dmct9` / `wcommand` — theo dự án. Grid dòng = `controller` của `<items style="Grid">` trên Dir (không phải `Grid/{Tran}.xml`).

Proxy Structure: `{eInv}\App_Data\XMLEInvoice\{folder}\Structure\` — `{folder}` lấy `edmkh.external_folder` (không đoán `008`).

---

## `dmhddtbs` — cột

Cặp master / detail **cùng nghĩa**, khác bảng tạm:

| Master → `#master` | Detail → `#detail` |
|--------------------|-------------------|
| `struct_fields` | `detail_struct_fields` |
| `struct_from` | `detail_struct_from` |
| `query_fields` | `detail_query_fields` |
| `query_join` | `detail_query_join` |
| `result_fields` | `detail_result_fields` |

`script` — gọi Customize (chung cả hai lớp).

```sql
-- template merge (không DELETE)
if not exists (select 1 from dmhddtbs where ma_ct = '{ma_ct}')
  insert dmhddtbs (ma_ct, struct_fields, struct_from, query_fields, query_join,
    result_fields, detail_struct_fields, detail_struct_from,
    detail_query_fields, detail_query_join, detail_result_fields, script)
  values ('{ma_ct}', '', '', '', '', '', '', '', '', '', '',
    'exec FastBusiness$EInvoice$Customize ''{ma_ct}'', ''%language'', @Unit')

-- master
update dmhddtbs set
    struct_fields = '{alias}.{field}' + case when struct_fields <> '' then ', ' else '' end + struct_fields
  , struct_from   = '{table} as {alias}' + case when struct_from <> '' then ', ' else '' end + struct_from
  , query_fields  = 'a.{field}' + case when query_fields <> '' then ', ' else '' end + query_fields
  , result_fields = '{field}' + case when result_fields <> '' then ', ' else '' end + result_fields
where ma_ct = '{ma_ct}'

-- detail (cùng ý; bảng nguồn thường d**$ / dmvt)
update dmhddtbs set
    detail_struct_fields = '{alias}.{field}' + case when detail_struct_fields <> '' then ', ' else '' end + detail_struct_fields
  , detail_struct_from   = '{table} as {alias}' + case when detail_struct_from <> '' then ', ' else '' end + detail_struct_from
  , detail_query_fields  = 'a.{field}' + case when detail_query_fields <> '' then ', ' else '' end + detail_query_fields
  , detail_result_fields = '{field}' + case when detail_result_fields <> '' then ', ' else '' end + detail_result_fields
where ma_ct = '{ma_ct}'
```

Cột **đã có** trên `#master` / `#detail` (cùng bảng CT): chỉ `*_fields` — không bịa `*_from`.

`script` trống mà cần Customize → gán `exec FastBusiness$EInvoice$Customize ''{ma_ct}'', ''%language'', @Unit`.

---

## Pattern A — Remap (tag đã có)

Customize gán cột nguồn vào cột mà Proxy **đã map**. Cùng cú pháp; đổi bảng tạm theo lớp.

```sql
-- chèn trong BODY FastBusiness$EInvoice$Customize, nhánh @VoucherCode
-- ALTER PROC đầy đủ. Cấm sp_rename + wrapper.

IF @VoucherCode IN ('{ma_ct}') BEGIN
  -- master
  SET @strSQL = 'update #master set {tag_col} = {src_col} from #master where {điều_kiện}'
  EXEC sp_executesql @strSQL
  -- detail
  SET @strSQL = 'update #detail set {tag_col} = {src_col} from #detail where {điều_kiện}'
  EXEC sp_executesql @strSQL
END
```

- `{tag_col}` = cột `#master` / `#detail` trùng tag đang có (vd master `ty_gia` ← `<ExchangeRate>ty_gia</ExchangeRate>`).
- `{src_col}` phải có trên đúng bảng tạm (cột sẵn, hoặc vừa thêm qua `dmhddtbs` / `detail_*`).
- **Không** đổi thẻ Proxy. Chỉ vá lớp UR yêu cầu — không `update #detail` khi UR chỉ master.

---

## Pattern B — Tag XML mới

1. Cột DB trên master `m**$` / detail `d**$` / danh mục (MCP kiểm tra cột đã có chưa — `ALTER` chỉ khi thiếu; giao script, không EXEC).
2. `dmhddtbs` merge: master → `struct_*`; detail → `detail_*`.
3. Structure — **cùng file** `Invoices.xml`, `Adjust.xml`, `Replace.xml` (nếu CT dùng ĐC/TT); đúng nhánh lớp:

```xml
<!-- master -->
<!-- <structure><master> : thêm tên thẻ vào mảng JSON -->
" {TagName} "
<!-- <invoices><master> : map thẻ → cột FBO -->
<{TagName}>{field}</{TagName}>

<!-- detail — cùng 2 chỗ, nhánh <detail> (một số NCC dùng <products>) -->
<!-- <structure><detail> -->
" {TagName} "
<!-- <invoices><detail> -->
<{TagName}>{field}</{TagName}>
```

Đọc Structure hiện có: dùng đúng tên nhánh file đang có (`detail` / `products`). Không bịa nhánh mới.

Provider khác folder (`003`, `004`, …): cùng chỗ trong file Structure của **folder đang dùng**.

---

## Pattern C — Form XML

### Master (header)

Chứng từ đã `&EIFields;` / `&EIViews;` / `&EICategory;` → vá file dùng chung:

| File | Thêm |
|------|------|
| `Include/XML/EIFields.txt` | `<field name="{field}" ... categoryIndex="8">` (tab Xác thực) |
| `Include/XML/EIViews.xml` | `[field]` đúng slot — [fbo-design-view-field](../fbo-design-view-field/SKILL.md) |
| `Include/Command/EIEditCheckTable{Tran}.txt` | `, @{field} as {field}` trước `into #editmaster` nếu field phải lưu khi **sửa HĐ đã PH** (`EIEdit`) |

Tab / nhóm field riêng: category mới + fields/views; nối `EIFields` / `EICategory` (entity INCLUDE hoặc chèn thẳng — theo UR, không tự tạo layer entity nếu user không yêu cầu).

`Dir/{Tran}.xml`: chỉ khi field **không** đi qua `EI*` (CT không include Invoice, hoặc logic riêng một `ma_ct`).

### Detail (dòng hàng)

Vá **grid dòng** `Grid/{Detail}.xml` (controller trên Dir), không vá `EIGridFields`:

| File | Thêm |
|------|------|
| `Grid/{Detail}.xml` `<fields>` | `<field name="{field}" ...>` |
| Cùng file `<views>` | cột grid đúng thứ tự |

`EIEditCheckTable{Tran}` thường `select * into #editdetail from @d**` — field đã có trên grid + cột DB thì **không** cần liệt kê tay. Chỉ bổ sung khi command SELECT tường minh (không `select *`).

`EIGridFields` / `Grid/{Tran}.xml` = cột tình trạng HDDT trên **listing** chứng từ — không dùng cho dòng hàng.

Tên field = tên cột SQL = tên trong `dmhddtbs` / tag map.

---

## Proc Customize

- MCP đọc `FastBusiness$EInvoice$Customize` → merge → xuất `ALTER PROC` **một body**.
- Chèn trước khối check chung (thuế / MST) nếu proc đã có nhánh `ma_ct`.
- Cấm: `sp_rename` thành `_Base` rồi proc mới gọi lại.
- Giao file `.sql` cho NSD; không `EXEC`/`ALTER` trên DB trừ khi NSD yêu cầu sau khi review.

---

## Anti-pattern

| Sai | Đúng |
|-----|------|
| Đổi `<ExchangeRate>ty_gia_hq</ExchangeRate>` khi tag `ty_gia` đã có | Pattern A: `ty_gia = ty_gia_hq` trong Customize |
| Vá `struct_*` khi UR là dòng hàng | `detail_struct_*` + `#detail` + Structure `<detail>` |
| Vá `EIGridFields` khi UR là cột dòng hàng | `Grid/{Detail}.xml` |
| `DELETE dmhddtbs WHERE ma_ct = ...` rồi INSERT trắng | Merge prepend |
| Wrapper 2 proc | Sửa trong body |
| Vá nhầm folder Structure | Đọc `edmkh.external_folder` |
| Entity trong CDATA | Entity ngoài CDATA |
