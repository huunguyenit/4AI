# Tầng 3b — nhánh MultiForm

Dùng khi một lần lấy được **nhiều chứng từ nguồn**. Hai file thay cho cặp Form + Grid của
nhánh Single:

| File | Vai |
|---|---|
| `Filter\{Src}MultiForm.xml` | Khung chọn nhiều chứng từ, ánh xạ cột sang chứng từ đích |
| `Grid\{Src}MultiGrid.xml` | Lưới liệt kê chứng từ nguồn — **chỉ thông tin cơ bản** |

Có thật trong SP hiện hành: `Filter\SVOrderMultiForm.f` + `Grid\SVOrderMultiGrid.f`,
`Filter\SVIssueMultiForm.f` + `Grid\SVIssueMultiGrid.f`.

Bật MultiForm thì **tắt SingleForm** — `Inserting` trỏ tới đúng một trong hai, không cả hai.

## Mẫu SQL chuẩn trong `command@event="Inserting"`

Đây là mẫu chuẩn hoá. Đừng tự chế biến thể; đổi mỗi phần `&Identity;`.

```sql
<![CDATA[
declare @vcID varchar(32), @vcNumber varchar(32), @i int, @l int
select @vcID = @stt_rec_ct, @vcNumber = ltrim(rtrim(@so_ct))
select @i = len(@vcNumber), @l = character_maximum_length from information_schema.columns where table_name = '@@table' and column_name = 'so_ct'
select @vcNumber = space(@l - @i) + @vcNumber

select '' as field, '' as message, 'on$]]>&Identity;<![CDATA[Filter$Retrieve$QueryComplete(this, '''', '''', '''', '''', '']]>&Identity;<![CDATA[MultiForm'', [''' + convert(char(8), @ngay_ct1, 112) + ''', ''' + replace(replace(@vcNumber, '\', '\\'), '''', '\''') + ''', ''' + @vcID + ''']);' as script
return
]]>
```

Từng mảnh làm gì:

| Mảnh | Vì sao có |
|---|---|
| `@vcID = @stt_rec_ct` | Khoá dòng chứng từ NSD đã chọn từ lookup. Rỗng nếu NSD gõ tay |
| `@vcNumber` | Số chứng từ NSD nhập, đã `ltrim`/`rtrim` |
| `character_maximum_length` + `space(@l - @i)` | **Căn phải số chứng từ cho khớp độ dài cột `so_ct` trong bảng.** Cột là `char` cố định; không đệm khoảng trắng thì so sánh `=` ở MultiGrid trượt |
| `replace(replace(…, '\', '\\'), '''', '\''')` | Escape cho **chuỗi JavaScript**, không phải cho SQL. Chuỗi này đang được nhúng vào một lời gọi JS |
| Tham số thứ 6 `'{Src}MultiForm'` | Tên form sẽ mở tiếp |
| Mảng cuối `[ngày, số ct, stt_rec]` | Tham số truyền sang MultiForm |

Bốn `''''` ở giữa là bốn tham số rỗng theo đúng chữ ký của
`on$…Filter$Retrieve$QueryComplete` — giữ nguyên số lượng, đừng bỏ bớt.

## MultiForm — `OtherCopyField` và `queryFilterString`

`MultiGrid` chỉ hiển thị thông tin cơ bản. Những cột **không show trên lưới** nhưng vẫn cần
copy sang chứng từ đích thì khai ở thẻ `OtherCopyField`; chi tiết xử lý nằm ở form response.

Hàm `show$SVOrderMultiForm` gán các tham số nhận được vào chuỗi truy vấn:

```javascript
queryFilterString += c + z._filter$Fields[1];
queryFilterString += c + z._filter$Fields[2];
```

`z._filter$Fields` chính là mảng truyền từ SQL ở trên. **Thứ tự phần tử trong mảng quyết định
`id` khi MultiGrid đọc lại** — đếm đúng, đừng đoán. Cách chắc chắn: mở file mẫu cùng họ
(`SVIssueMultiForm` nếu đang làm `SVOrder`, và ngược lại) rồi đối chiếu từng chỉ số.

## MultiGrid — đọc tham số từ `#t`

```sql
declare @so_ct varchar(32), @stt_rec varchar(32)
select @so_ct = replace(data, @d, '''') from #t where id = 6
select @stt_rec = replace(data, @d, '''') from #t where id = 7

if @so_ct != '' and @stt_rec = '' set @queryWhereClause += ' and m.so_ct = ''' + replace(rtrim(@so_ct), '''', '''''') + ''''
else if @stt_rec != '' set @queryWhereClause += ' and m.stt_rec = ''' + replace(rtrim(@stt_rec), '''', '''''') + ''''
```

Logic rẽ nhánh là **có chủ đích**, giữ nguyên thứ tự ưu tiên:

- NSD **gõ tay** số chứng từ → chỉ có `@so_ct` → lọc theo `so_ct`
- NSD **chọn từ lookup** → có `@stt_rec` → lọc theo `stt_rec`, chính xác hơn vì số chứng từ
  có thể trùng giữa các kỳ hoặc các đơn vị

`id = 6` / `id = 7` bám vào thứ tự mảng ở MultiForm. Thêm một tham số vào giữa mảng là đổi
hết các `id` phía sau — nối vào **cuối**, hoặc sửa đồng loạt cả hai file trong cùng lần.

## Checklist

```
- [ ] Inserting dùng mẫu chuẩn, chỉ đổi &Identity; — không tự viết lại
- [ ] Giữ đủ bốn tham số rỗng trong lời gọi QueryComplete
- [ ] Đệm space theo character_maximum_length của cột so_ct — không bỏ bước này
- [ ] Escape hai lớp (\ rồi ') còn nguyên
- [ ] Thứ tự mảng ở MultiForm khớp id trong #t ở MultiGrid — đối chiếu file mẫu cùng họ
- [ ] OtherCopyField liệt kê đủ cột không hiển thị nhưng cần copy
- [ ] Điều kiện MultiGrid == điều kiện {Src}Lookup
- [ ] SingleForm đã tắt
```

Sau khi dòng đã về lưới chi tiết đích, phần ghi `fsdSttRecRef` và trừ lượng trên chứng từ
nguồn thuộc skill `erp-voucher-data-lookup`.
