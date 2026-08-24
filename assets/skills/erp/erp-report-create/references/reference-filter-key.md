# KEY & JOIN — báo cáo

## Khởi tạo

```sql
SELECT @Join = ' left join m**$%Partition m** on a.stt_rec = m**.stt_rec'
    , @Key = 'a.status = ''1'' and a.ma_nvbh <> '''' and a.ma_ct in (''HDA'', ''HDF'')', @EmployeeKey = ''
    , @UnitKey = dbo.FastBusiness$Function$System$GetUnitFilter('a.ma_dvcs', @Unit, @UserID, @Admin)
```

`GetCheckKey` sau khi ghép xong `@Key`. Biến proc tiếng Anh (`@Unit`, `@Customer`); Filter XML truyền `@{field.name}` cùng thứ tự.

## @s — trung gian

Mỗi điều kiện lọc gán `@s` rồi nối `@Key` (và nguồn khác nếu cùng alias):

```sql
IF @Customer <> '' SELECT @s = ' and a.ma_kh like ''' + REPLACE(RTRIM(@Customer), '''', '''''') + '%''', @Key = @Key + @s
```

## Lookup nhiều mã — GetCodeFilter

```sql
IF @SalesEmployee <> '' BEGIN
    SELECT @EmployeeKey = dbo.FastBusiness$Function$System$GetCodeFilter('a.ma_nvbh', 'inlist', @SalesEmployee)
    IF @EmployeeKey <> '' SELECT @s = ' and ' + @EmployeeKey, @Key = @Key + @s
END
```

Giữ `@EmployeeKey` để tái dùng. Không `fsd_StringToTable` + `#emp` khi đã có `GetCodeFilter`.

## Tài khoản — ReportForm$GetAccountKey

Có lọc:

```sql
IF @SalesAccount <> '' BEGIN
    SELECT TOP 0 tk INTO #$dmtk FROM dmtk0
    EXEC dbo.FastBusiness$App$ReportForm$GetAccountKey 'a.tk_dt', 'like', @SalesAccount, '#$dmtk', @UserID, @Admin, @AccountKey OUTPUT
    IF @AccountKey IS NOT NULL AND @AccountKey <> '' SELECT @s = ' and ' + @AccountKey, @Key = @Key + @s
END
```

Không lọc — quyền/mặc định `GetAccountKey`:

```sql
ELSE BEGIN
    SELECT TOP 0 tk INTO #$dmtk0 FROM dmtk0
    EXEC dbo.FastBusiness$App$GetAccountKey 'a.tk_dt', 'notinlist', '5114', '#$dmtk0', @UserID, @Admin, @AccountKey OUTPUT
    SELECT @s = ' and ' + @AccountKey, @Key = @Key + @s
END
```

## Join DM có điều kiện

```sql
IF @ItemGroup1 + @ItemGroup2 + @ItemGroup3 <> '' SET @Join = @Join + ' left join dmvt b on a.ma_vt = b.ma_vt'
IF @ItemGroup1 <> '' SELECT @s = ' and b.nh_vt1 like ''' + REPLACE(RTRIM(@ItemGroup1), '''', '''''') + '%''', @Key = @Key + @s
```

Chỉ JOIN khi có lọc nhóm.

## Tái sử dụng Key cho nguồn phụ

Nguồn kế hoạch / bảng cố định không copy điều kiện tay:

```sql
SELECT @PlanKey = 'nam = ' + RTRIM(CAST(@Year AS VARCHAR(4))) + ' and a.ma_nvbh <> '''''
IF @ItemGroup1 <> '' SET @PlanKey = @PlanKey + ' and a.nh_vt1 like ''' + REPLACE(RTRIM(@ItemGroup1), '''', '''''') + '%'''
IF @EmployeeKey <> '' SET @PlanKey = @PlanKey + ' and ' + @EmployeeKey
IF @UnitKey IS NOT NULL SET @PlanKey = @PlanKey + ' and ' + @UnitKey
SET @q = 'insert into #plan_raw select * from {plan_table} a where ' + @PlanKey
EXEC(@q)
```

Alias trong `GetCodeFilter` / `GetUnitFilter` phải khớp alias bảng nguồn phụ (`a.`).

## UNPIVOT

UNPIVOT tạo table expression mới. Alias nguồn (`p`) **không** dùng sau UNPIVOT — SELECT / WHERE / GROUP BY lấy cột từ alias kết quả (`u`), gồm cả cột không unpivot (`rn`, `ma_nvbh`).

```sql
SELECT u.ma_dvcs, u.ma_nvbh, CAST(RIGHT(u.name_tien, 2) AS INT) AS thang, SUM(u.tien_ns) AS ke_hoach
    INTO #plan_data FROM #plan_last
    UNPIVOT (tien_ns FOR name_tien IN (tien01, tien02, tien03, tien04, tien05, tien06, tien07, tien08, tien09, tien10, tien11, tien12)) u
    WHERE u.rn = 1
    GROUP BY u.ma_dvcs, u.ma_nvbh, CAST(RIGHT(u.name_tien, 2) AS INT)
```

**Sai:** `FROM #plan_last p UNPIVOT (...) u WHERE p.rn = 1`

## Load partition

`loai_hd` (hoặc field master) lấy lúc INSERT partition — `isnull(m**.{field}, '01')`. Không UPDATE lại qua `m**$` + `#parti` sau load.

```sql
SET @q = 'insert into #in select ...'
SET @q = @q + CHAR(13) + 'from r**$%Partition a with(nolock)' + @Join
SET @q = @q + CHAR(13) + 'where %[' + @Key + ']%'
EXEC FastBusiness$Partition$Execute @q, NULL, 'a.ngay_ct', @DateFrom, @DateTo, @UserID, @Admin
```
