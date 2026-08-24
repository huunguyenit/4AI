# Bảng nghiệp vụ — chứng từ, sổ cái, sổ kho, thuế, phí, thanh toán

> **Nguồn:** tài liệu chính hãng "Lập trình Fast Business Online", mục 5 (Cấu trúc SQL) —
> KHÔNG phải quét `sys.objects`/`sys.columns` qua `query_sql` như `table.md`. Tên cột và
> công thức lấy nguyên văn từ tài liệu; chưa đối chiếu với một chương trình chuẩn cụ thể.
> Trước khi dựa vào một cột, xác nhận nó còn tồn tại ở chương trình đang làm bằng
> `query_sql { program, db, object: "<tên bảng>$<yyyyMM>" }`.

Đây là **bảng dữ liệu** (chứng từ, sổ cái, sổ kho…), khác với `table.md` — nơi liệt kê bảng
**khai báo** `sys*` (màn hình, trường, quyền). Hai file không trùng phạm vi.

## Cấu trúc phân kỳ theo tháng

Hầu hết bảng chứng từ, sổ cái, sổ kho lưu theo tháng để tối ưu quản lý dữ liệu và truy vấn
báo cáo: tên bảng có hậu tố `$yyyyMM` (`r00$202401`, `m81$202401`…).

Một chứng từ (ví dụ hoá đơn bán hàng, loại `81`) gồm bốn bảng theo tháng:

| Bảng | Chứa |
|---|---|
| `M81$yyyyMM` | Thông tin chung (header) |
| `D81$yyyyMM` | Thông tin chi tiết (detail) |
| `I81$yyyyMM` | Thông tin tìm kiếm (index) |
| `C81$000000` | Giúp truy vấn dữ liệu — không phân kỳ theo tháng |

Đi kèm là `m81$000000`, `d81$000000`, `i81$000000` — bảng **định dạng cấu trúc**, không lưu
dữ liệu (tương đương bảng mẫu/khai báo cột cho loại chứng từ `81`).

**Bắt buộc:** tạo chứng từ mới của một loại (`XX`) ở tháng chưa từng phát sinh thì phải tạo
Index cho tất cả các bảng `M/D/I/CXX$yyyyMM` tương ứng trong SQL trước — chương trình không
tự tạo Index khi bảng tháng đó chưa tồn tại.

## Sổ cái — `r00$yyyyMM`

> Bảng chính thức là **`r00$yyyyMM`**. `ct00` là bản cũ không phân kỳ, chỉ soi chiếu một kỳ —
> đừng viết `FROM ct00`.

| Cột | Ý nghĩa |
|---|---|
| `stt_rec` | Mã |
| `ma_dvcs` | Mã đơn vị cơ sở |
| `loai_ct` | Loại chứng từ |
| `ma_ct` | Mã chứng từ |
| `ngay_ct` | Ngày chứng từ |
| `ngay_lct` | Ngày lập chứng từ |
| `so_ct` | Số chứng từ |
| `so_ctgs` | Số chứng từ ghi sổ |
| `ngay_ctgs` | Ngày chứng từ ghi sổ |
| `so_lo` / `ngay_lo` | Số lô / Ngày lô |
| `ong_ba` | Trường `ong_ba` trên thông tin chung |
| `dien_giai_h` | Diễn giải trên thông tin chung |
| `dien_giai` | Diễn giải dưới chi tiết (chứng từ không có diễn giải chi tiết thì gán = `dien_giai_h`) |
| `nh_dk` | Nhóm định khoản |
| `tk` / `tk_du` | Tài khoản / Tài khoản đối ứng |
| `ps_no_nt` / `ps_co_nt` | Phát sinh nợ/có nguyên tệ |
| `ma_nt` / `ty_gia` | Mã ngoại tệ / Tỷ giá của phiếu |
| `ps_no` | `= ps_no_nt * ty_gia` |
| `ps_co` | `= ps_co_nt * ty_gia` |
| `ma_kh` | Mã khách của chứng từ |
| `ma_vv` / `ma_sp` / `ma_bp` | Mã vụ việc / sản phẩm / bộ phận |
| `ma_nk` | Mã quyển (nếu có khai báo quyển chứng từ) |
| `so_lsx` | Số lệnh sản xuất |
| `so_ct0` / `ngay_ct0` | — |
| `so_tc` | Số tham chiếu |
| `ct_nxt` | Chứng từ nhập xuất tồn: `2` xuất, `1` nhập, `0` không |
| `ma_gd` | Mã giao dịch |
| `nam` / `ky` | không dùng |
| `gt_no` | `= ps_no` khi `ma_nt` khác đồng tiền hạch toán (tỷ giá ghi sổ) |
| `gt_co` | `= ps_co` khi `ma_nt` khác đồng tiền hạch toán (tỷ giá ghi sổ) |
| `gt_tinh` | — |
| `gt_dd` | Tính khi `sua_tg_yn = 1` và `ma_nt` khác đồng tiền hạch toán (tỷ giá ghi sổ) |
| `sua_tg_yn` | `0` không sửa, `1` sửa |
| `line_nbr` | Số thứ tự dòng |

## Sổ kho

Hai bảng cùng cấu trúc, khác vai trò:

- **Kho hoá đơn** (sổ sách) — **`r70$yyyyMM`** — đọc khi `@DataType = 2`
- **Kho thực tế** — **`r90$yyyyMM`** — đọc khi `@DataType = 1`

> ⚠ `r90` **chỉ có dữ liệu khi `options.m_instock_split = '1'`** (phân hệ IN, *"Tách tồn kho
> sổ sách và thực tế"*). Khách tắt tùy chọn đó thì cả hai luồng dồn vào `r70` và `r90` rỗng —
> nên proc báo cáo NXT vẫn phải đọc `r70` ở nhánh thực tế. Chi tiết và đoạn code mẫu ở
> `fbo-glossary-reference` → `naming.md`.

> `ct70` và `ct90` là bản **lỗi thời**: trên chương trình đã đo cả hai **rỗng hoàn toàn**
> (0 dòng) và không có SQL nào trong `Controllers\` nhắc tới. Không dùng chúng.

| Cột | Ý nghĩa |
|---|---|
| `stt_rec` / `stt_rec0` | Mã / khoá chính |
| `ma_dvcs` | Mã đơn vị cơ sở |
| `ma_ct` / `loai_ct` | Mã chứng từ / loại chứng từ |
| `ma_gd` | Mã giao dịch |
| `ma_nk` | Mã quyển (nếu có) |
| `nxt` | Chứng từ nhập/xuất: `1` nhập, `2` xuất |
| `ct_dc` | Chứng từ điều chuyển (1/0) |
| `pn_gia_tb` | Vật tư tính giá trung bình (phiếu nhập) |
| `px_gia_dd` | Vật tư tính giá đích danh (phiếu xuất) |
| `ngay_lct` / `ngay_ct` | Ngày lập ct / Ngày chứng từ |
| `so_ct` / `so_seri` | Số chứng từ / Số seri |
| `so_lo` / `ngay_lo` | Số lô / Ngày lô |
| `ma_kh` | Mã khách hàng (phiếu xuất điều chuyển: mã kho xuất trên thông tin chung) |
| `ma_khon` / `ma_kho` | Mã kho nhập / Mã kho xuất |
| `ma_vi_trin` / `ma_vi_tri` | Mã vị trí nhập / Mã vị trí xuất |
| `ong_ba` | Người nhận trên thông tin chung |
| `dien_giai` | Diễn giải trên thông tin chung |
| `ma_vv` / `ma_sp` / `ma_bp` | Mã vụ việc / sản phẩm / bộ phận |
| `so_lsx` | Số lệnh sản xuất |
| `ma_hd` / `ma_ku` / `ma_phi` / `ma_dot` | Mã hợp đồng / khế ước / phí / tiến độ thanh toán hợp đồng |
| `so_dh2` / `so_dh3` | — |
| `ma_nvbh` / `ma_nv` | Mã nhân viên bán hàng / nhân viên |
| `ma_nx` | Mã nhập xuất |
| `tk_du` | Tk đối ứng |
| `ma_nt` / `ty_gia` | Mã ngoại tệ / Tỷ giá |
| `ma_vt` / `ma_lo` | Mã vật tư / Mã lô |
| `dvt1` | Đơn vị tính của vật tư trên phiếu |
| `sl_nhap1` / `sl_xuat1` | Số lượng trên phiếu nhập / xuất |
| `he_so1` | Hệ số vật tư trên phiếu |
| `gia_nt1` / `gia1` | Giá vốn nt/thường của vật tư trên chứng từ xuất |
| `gia01` / `gia_nt01` | — |
| `gia21` / `gia_nt21` | Giá bán / Giá bán nt của vật tư trên chứng từ xuất |
| `tk_vt` / `tk_gv` / `tk_dt` | Tk vật tư / Tk giá vốn / Tk doanh thu |
| `sl_nhap` | `= sl_nhap1 * he_so1` |
| `sl_xuat` | `= sl_xuat1 * he_so1` |
| `gia_nt` | Giá vốn của vật tư trên phiếu xuất chia hệ số (`gia_nt1 / he_so1`) |
| `gia` | `= gia_nt * ty_gia` |
| `tien_nt_n` / `tien_nt_x` | Tiền nhập nt / Tiền xuất nt |
| `tien_nhap` / `tien_xuat` | Tiền nhập / Tiền xuất |
| `gia_nt0` / `gia0` / `tien_nt0` / `tien0` | — |
| `cp_vc` / `cp_vc_nt` | Chi phí vận chuyển (thường/nt) |
| `cp_bh` / `cp_bh_nt` | Chi phí bảo hiểm (thường/nt) |
| `cp_khac` / `cp_khac_nt` | Chi phí khác (thường/nt) |
| `cp_nt` | `= cp_vc_nt + cp_bh_nt + cp_khac_nt` |
| `cp` | `= cp_vc + cp_bh + cp_khac` |
| `thue_suat_nk` | Thuế suất nhập khẩu |
| `nk_nt` / `nk` | Tiền thuế nhập khẩu (nt/thường) |
| `tk_thue_nk` | Tk thuế nhập khẩu |
| `thue_suat_ttdb` | Thuế suất tiêu thụ đặc biệt (TTĐB) |
| `ttdb_nt` / `tttdb` | Tiền thuế TTĐB (nt/thường) |
| `gia_nt2` | `= gia_nt21 / he_so1` — giá bán nt của vật tư trên chứng từ xuất |
| `gia2` | `= gia_nt21 / he_so1` — giá bán của vật tư trên chứng từ xuất |
| `tien_nt2` | `= gia_nt2 * sl_xuat` |
| `tien2` | `= gia2 * sl_xuat` |
| `ma_tt` | Mã thanh toán |
| `cp_thue_yn` | — |
| `thue_suat` | Thuế suất GTGT |
| `thue_nt` / `thue` | Tiền thuế GTGT (nt/thường) |
| `tk_thue_no` / `tk_thue_co` | Tk thuế nợ / Tk thuế có |
| `ck_nt` / `ck` | Tiền chiết khấu (nt/thường) |
| `tk_ck` | Tk chiết khấu |
| `stt_rec_pn` / `stt_rec0pn` | `stt_rec`/`stt_rec0` của phiếu nhập kế thừa |
| `stt_rec_px` / `stt_rec0px` | `stt_rec`/`stt_rec0` của phiếu xuất kế thừa |
| `stt_rec_dc` / `stt_rec0dc` | `stt_rec`/`stt_rec0` của phiếu điều chuyển kế thừa |
| `stt_rec_yc` / `stt_rec0yc` | `stt_rec`/`stt_rec0` của phiếu yêu cầu kế thừa |
| `ngay_ct0` / `so_ct0` / `so_seri0` | Ngày/Số/Seri hoá đơn thuế |
| `nam` / `ky` | không dùng |
| `line_nbr` | Số thứ tự dòng |

## Thuế đầu ra — `ctgt20`, `r20$yyyyMM`

| Cột | Ý nghĩa |
|---|---|
| `stt_rec` / `stt_rec0` | Mã / trường khoá |
| `ma_dvcs` / `loai_ct` / `ma_ct` | Mã đơn vị cơ sở / loại / mã chứng từ của phiếu |
| `ngay_ct` / `ngay_lct` | Ngày chứng từ / Ngày lập chứng từ của phiếu |
| `so_ct` / `so_seri` | Số chứng từ / Số seri |
| `ten_kh` / `dia_chi` / `ma_so_thue` | Tên / địa chỉ / mã số thuế khách hàng |
| `ma_kh2` | Cục thuế |
| `ten_vt` | Tên vật tư thuế |
| `t_tien2` / `t_tien_nt2` | Tổng tiền hàng + khuyến mại trên hoá đơn (thường/nt) |
| `ma_nt` / `ty_gia` | Mã ngoại tệ / Tỷ giá |
| `ma_thue` / `thue_suat` | Mã số thuế GTGT / Thuế suất GTGT |
| `t_thue` / `t_thue_nt` | Tiền thuế + khuyến mại trên hoá đơn (thường/nt) |
| `tk_thue_co` / `tk_du` | Tk thuế có / Tk đối ứng |
| `ma_kho` / `ma_nvbh` / `ma_kh` | Mã kho / nhân viên bán hàng / khách hàng |
| `ma_vv` / `ma_sp` / `ma_bp` | Mã vụ việc / sản phẩm / bộ phận |
| `so_lsx` | Số lệnh sản xuất |
| `ghi_chu` | Ghi chú bên tab thuế |
| `nam` / `ky` | không dùng |
| `line_nbr` | Số thứ tự dòng |
| `so_tc` | Số tham chiếu |
| `status` | — |
| `ma_nk` | Mã quyển |
| `ma_mau_ct` | Mẫu ký hiệu mẫu hoá đơn theo thông tư mới |

## Thuế đầu vào — `ctgt30`, `r30$yyyyMM`

| Cột | Ý nghĩa |
|---|---|
| `stt_rec` / `stt_rec0` | Mã / `stt_rec0` của chứng từ (trường khoá) |
| `ma_dvcs` / `loai_ct` / `ma_ct` | Mã đơn vị cơ sở / loại / mã chứng từ của phiếu |
| `ngay_ct` / `ngay_lct` | Ngày chứng từ / Ngày lập chứng từ của phiếu |
| `so_ct` | Số chứng từ của phiếu |
| `ngay_ct0` / `so_ct0` / `so_seri0` | Ngày / Số / Seri hoá đơn |
| `mau_bc` | Mẫu báo cáo |
| `ma_tc` | Mã tính chất |
| `ma_kh` / `ten_kh` / `dia_chi` / `ma_so_thue` | Mã / tên / địa chỉ / mã số thuế nhà cung cấp |
| `ma_kh2` | Cục thuế |
| `ten_vt` | Tên hàng hoá dịch vụ |
| `so_luong` | Số lượng hàng |
| `ty_gia` / `ma_nt` | Tỷ giá / Mã ngoại tệ |
| `gia_nt` / `gia` | Giá nguyên tệ / Giá |
| `t_tien_nt` | Tiền hàng nguyên tệ |
| `t_tien` | `= t_tien_nt * ty_gia` |
| `ma_thue` / `thue_suat` | Mã số thuế GTGT / Thuế suất GTGT |
| `t_thue_nt` | Tiền thuế nguyên tệ |
| `t_thue` | `= t_thue_nt * ty_gia` |
| `ma_tt` | Mã thanh toán |
| `tk_du` | Tk đối ứng |
| `so_lsx` | Số lệnh sản xuất |
| `ghi_chu` | Ghi chú bên tab thuế |
| `nam` / `ky` | không dùng |
| `line_nbr` | Số thứ tự dòng |
| `status` / `ma_mau_ct` | — / Mã mẫu chứng từ |

## Phí phát sinh đầu ra — `ctcp20`, `r50$yyyyMM`

| Cột | Ý nghĩa |
|---|---|
| `stt_rec` | Mã |
| `ma_dvcs` / `loai_ct` / `ma_ct` | Mã đơn vị cơ sở / loại / mã chứng từ của phiếu |
| `ngay_ct` / `ngay_lct` | Ngày chứng từ / Ngày lập chứng từ của phiếu |
| `so_ct` | Số chứng từ của phiếu |
| `ma_cp` | Mã phí |
| `t_cp_nt` | Tiền phí nguyên tệ |
| `t_cp` | `= t_cp_nt * ty_gia` |
| `line_nbr` / `status` | Số thứ tự dòng / — |

## Phí phát sinh đầu vào — `ctcp30`, `r60$yyyyMM`

Cấu trúc giống hệt phí phát sinh đầu ra (`ctcp20`) — cùng bộ cột `stt_rec`, `ma_dvcs`,
`loai_ct`, `ma_ct`, `ngay_ct`, `ngay_lct`, `so_ct`, `ma_cp`, `t_cp_nt`, `t_cp`, `line_nbr`,
`status`.

## Chi tiết thanh toán phải thu — `cttt20`

| Cột | Ý nghĩa |
|---|---|
| `loai_tt` | `1` chứng từ thanh toán cho hoá đơn, `0` ngược lại |
| `ma_gd` | Mã giao dịch |
| `stt_rec` | ID phiếu |
| `ma_dvcs` / `loai_ct` / `ma_ct` | Mã đơn vị cơ sở / loại / mã chứng từ |
| `ngay_ct` | Ngày chứng từ |
| `ngay_ct0` | Ngày chứng từ thanh toán (mặc định = `ngay_ct` nếu phiếu không có) |
| `so_ct` | Số chứng từ thanh toán (tương tự `ngay_ct0`) |
| `so_seri` / `so_tc` | Số seri / Số tham chiếu |
| `ma_kh` | Mã khách hàng |
| `dien_giai` | Diễn giải trên thông tin chung |
| `so_lsx` / `ma_vv` / `ma_sp` / `ma_bp` | Số lệnh sản xuất / vụ việc / sản phẩm / bộ phận |
| `ma_nvbh` | Mã nhân viên bán hàng |
| `tk` | Tài khoản nợ |
| `ma_nt` | Mã ngoại tệ (rỗng nếu = đồng tiền hạch toán) |
| `ty_gia` | Tỷ giá (`0` nếu `ma_nt` = đồng tiền hạch toán) |
| `t_tien_nt2` / `t_tien2` | Tổng tiền hàng (nt/thường) |
| `t_thue_nt` / `t_thue` | Tổng thuế (nt/thường) |
| `t_ck_nt` / `t_ck` | Tổng chiết khấu (nt/thường) |
| `t_tt_nt` | `= t_tien_nt2 + t_thue_nt - t_ck_nt` (+ `t_ck_km_nt` nếu có) |
| `t_tt` | `= t_tien2 + t_thue - t_ck` (+ `t_ck_km` nếu có) |
| `t_tt_nt0` / `t_tt0` | `= t_tt_nt` / `= t_tt` |
| `ma_tt` | Mã thanh toán |
| `t_tt_qd` / `t_tt_qd0` | Tổng thanh toán quy đổi trên hoá đơn |
| `tat_toan` | Hoá đơn đã tất toán hết hay chưa (1/0) |
| `ngay_tt` | Ngày tất toán hết hoá đơn |
| `tt_nt` / `tt` | Tiền đã thanh toán cho hoá đơn (nt/thường) |
| `tt_qd` | `loai_ct=1` → `= tt`; `loai_ct=0` → tổng tiền đã thanh toán cho hoá đơn này |
| `t_tt1` | `loai_ct=1` → `0`; `loai_ct=0` → tổng tiền đã thanh toán cho hoá đơn theo tỷ giá phiếu thanh toán |
| `t_tt_nt1` | `loai_ct=1` → `0`; `loai_ct=0` → tổng tiền nt đã thanh toán cho hoá đơn theo tỷ giá phiếu thanh toán |
| `tt_cn` | Tất toán công nợ (xác định khi `loai_ct=1`) |
| `ty_gia_dg` | Tỷ giá đánh giá (theo tỷ giá hoá đơn khi tỷ giá phiếu thanh toán khác tỷ giá hoá đơn) |
| `tien_cl_no` / `tien_cl_co` | Tiền chênh lệch nợ/có (khi tỷ giá hoá đơn khác tỷ giá phiếu thu cho hoá đơn đó) |
| `stt_rec_tt` | ID của hoá đơn tất toán |
| `stt_rec0` / `nam` / `ky` / `line_nbr` / `status` / `ngay_ct0` | — |
| `stt_rec_pb` | ID của phiếu phân bổ |

## Chi tiết thanh toán phải trả — `cttt30`

Cùng ý nghĩa cột với `cttt20` ở phần chung (`loai_tt`, `ma_gd`, `stt_rec`, `stt_rec0`,
`ma_dvcs`, `loai_ct`, `ma_ct`, `ngay_lct`, `ngay_ct`, `so_ct`, `ma_kh`, `ngay_ct0`, `so_ct0`,
`dien_giai`, `ma_bp`, `so_lsx`, `ma_vv`, `ma_sp`, `tk`, `ma_nt`, `ty_gia`, `ma_tt`, `t_tt_qd`,
`t_tt_qd0`, `tat_toan`, `ngay_tt`, `tt_nt`, `tt`, `tt_qd`, `t_tt_nt1`, `t_tt1`, `tt_cn`,
`ty_gia_dg`, `tien_cl_no`, `tien_cl_co`, `stt_rec_tt`, `nam`, `ky`, `line_nbr`, `status`,
`stt_rec_pb`) — khác biệt so với `cttt20` là phần tổng phản ánh hàng **nhập** thay vì hàng
bán, và có thêm chi phí/thuế nhập khẩu:

| Cột | Ý nghĩa |
|---|---|
| `t_tien_nt` / `t_tien` | (không kèm mô tả riêng trong tài liệu gốc) |
| `t_tien_nt0` / `t_tien0` | Tổng tiền hàng nhập (nt/thường), chưa thuế |
| `t_cp_nt` / `t_cp` | Tổng chi phí (nt/thường) |
| `t_nk_nt` / `t_nk` | Tổng tiền thuế nhập khẩu (nt/thường) |
| `t_thue_nt` / `t_thue` | Tổng tiền thuế GTGT (nt/thường) |
| `t_tt_nt` | `=` Tổng tiền nhập nt + chi phí nt |
| `t_tt` | `=` Tổng tiền nhập + chi phí |
| `t_tt_nt0` / `t_tt0` | `= t_tt_nt` / `= t_tt` |
