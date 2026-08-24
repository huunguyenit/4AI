# Ví dụ end-to-end — LoadVVDetail (WITran)

Luồng: chọn **Mã vụ việc** master → xóa grid `d38` → load vật tư từ `zcdmvvtd` qua proc → fill kho/lô/tồn.

## 1. Field master (WITran.xml)

```xml
<field name="ma_vv_m" clientDefault="Default">
  <header v="Mã vụ việc" e="Job Code"/>
  <items style="AutoComplete" controller="Job" reference="ten_vv_m%l" .../>
  <clientScript><![CDATA[onchange="onChange$Voucher$MaVV(this);"]]></clientScript>
</field>
```

## 2. JS request + clear (WITran.xml script)

```javascript
function onChange$Voucher$MaVV(o) {
  var f = o.parentForm;
  if (f._action === 'View') return;
  var ma_vv_m = $func.trim(f.getItemValue('ma_vv_m'));
  if (ma_vv_m === '') return;
  DeleteData$Detail(f, 'd38');
  f.request('LoadVVDetail', 'LoadVVDetail', ['ma_vv_m', 'stt_rec', 'ma_dvcs'], o);
}
```

## 3. Response action (WITran.xml)

```xml
<action id="LoadVVDetail">
  <text>
    <![CDATA[
declare @json nvarchar(max), @unitCode varchar(32)
select @unitCode = case when @ma_dvcs = '' then @@unit else @ma_dvcs end
exec zc_LoadItemJobToWIDetail @ma_vv_m, @unitCode, @stt_rec, @@userID, @@admin, @json output
select isnull(@json, '[]') as json
    ]]>
  </text>
</action>
```

Proc trả JSON keys (vd.): `ma_vt`, `ten_vt`, `dvt`, `ten_dvt`, `so_luong`, `he_so`, `ma_vv`, `ma_kho`, `ten_kho`, `ma_vi_tri`, `ten_vi_tri`, `ma_lo`, `ten_lo`, `tk_vt`, `gia_ton`, `vi_tri_yn`, `lo_yn`, `ton13`.

## 4. JS fill grid

Xem đầy đủ trong [js-grid-fill.md](js-grid-fill.md):

- `insert$LoadVV$Row` + `setItemGridBehavior`
- `case 'LoadVVDetail'` trong `on$Voucher$ResponseComplete`

## 5. So sánh với nhập ma_vt trên grid

| | Nhập `ma_vt` (WIDetail) | Load từ master (WITran) |
|--|-------------------------|-------------------------|
| Trigger | Grid field onChange | Dir field onChange |
| Request | Grid → `action Item` | Form → `f.request LoadVVDetail` |
| Response handler | `on$GridVoucherDetail$ResponseComplete` | `on$Voucher$ResponseComplete` |
| Dữ liệu | `result[n].Value` từ SQL columns | `JSON.parse(result[0].Value)` |
| Gán field | `setItemGridBehavior` | **Cùng** `setItemGridBehavior` |

Logic gán ref/tồn/kho **copy pattern Item** — đảm bảo hành vi giống nhập tay từng dòng.

## 6. Deploy checklist

1. Chạy proc SQL trên DB
2. Deploy `WITran.xml`
3. Test: New PXH → chọn `ma_vv_m` → grid có dòng + tồn + ref tên
4. Test View mode: không gọi request
