#!/usr/bin/env node
// test-staffing.mjs — roster phòng, PM thật sự, PP đứng thay, tải trọng, và đường dây từ
// dataset tới mục "Chưa giao lập trình (DD)". KHÔNG chạm DB: runSql được tiêm giả.

import {
  sqlRoster, sqlLichSuMenu, sqlDongGopDauVao, sqlKinhNghiemHienVat, normalizeRoster, phoPhong, xacDinhPm, pmCuaDuAn,
  buildTaiTrong, menuCanGoiY, buildNhanSu,
} from '../tools/lib/staffing.mjs';
import { loadHolidays } from '../tools/lib/workdays.mjs';
import { goiYNguoiTiepNhan, laChuaPhanCong } from '../tools/lib/assignee.mjs';
import { datasetToPayloads } from '../tools/lib/review-dataset.mjs';
import { buildPortfolioArtifact } from '../tools/lib/report.mjs';

let failures = 0;
function ok(label, cond, detail) {
  process.stdout.write(`${cond ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}\n`);
  if (!cond) failures++;
}

const H = loadHolidays();

// Roster giả, dựng theo đúng hình dạng userinfo2 của FSD: một PP, phần còn lại NV.
const ROSTER_ROWS = [
  { ma_nv: 'NV07', ten: 'Nhân viên Bảy', quan_ly: '', ma_bo_phan: 'FSD', ma_kcv: 'LT', ma_chv: 'PP' },
  { ma_nv: 'NV01', ten: 'Nhân viên Một', quan_ly: 'NV07', ma_bo_phan: 'FSD', ma_kcv: 'LT', ma_chv: 'NV' },
  { ma_nv: 'PM01', ten: 'Nhân viên PM', quan_ly: 'NV07', ma_bo_phan: 'FSD', ma_kcv: 'LT', ma_chv: 'NV' },
  { ma_nv: 'NV08', ten: 'Nhân viên Tám', quan_ly: 'NV07', ma_bo_phan: 'FSD', ma_kcv: 'LT', ma_chv: 'NV' },
];
const roster = normalizeRoster(ROSTER_ROWS);

process.stdout.write('=== SQL cố định ===\n');
ok('sqlRoster đọc userinfo2 và lọc đúng hai điều kiện',
  sqlRoster('FSD').includes('FROM userinfo2')
  && sqlRoster('FSD').includes("RTRIM(ma_bo_phan) = 'FSD'")
  && sqlRoster('FSD').includes("status = '1'"));
ok('sqlRoster không SELECT password/rkey',
  !/password|rkey|pwd_/i.test(sqlRoster('FSD')));
ok('sqlLichSuMenu chặn cả hai chiều (menu + người)',
  sqlLichSuMenu(['07.00.00'], ['NV01']).includes("RTRIM(menu_id) IN ('07.00.00')")
  && sqlLichSuMenu(['07.00.00'], ['NV01']).includes("RTRIM(ma_lt1) IN ('NV01')"));
ok('sqlLichSuMenu KHÔNG lọc trang_thai (UR đã UP mới là bằng chứng mạnh nhất)',
  !/trang_thai/.test(sqlLichSuMenu(['07.00.00'], ['NV01'])));
ok('sqlDongGopDauVao đọc nbctdaumuc JOIN nbphyc, lọc đúng mã đầu vào',
  sqlDongGopDauVao(['07.00.00'], ['NV01']).includes('FROM nbctdaumuc')
  && sqlDongGopDauVao(['07.00.00'], ['NV01']).includes('JOIN nbphyc')
  && sqlDongGopDauVao(['07.00.00'], ['NV01']).includes("RTRIM(dmuc.ma_daumuc) IN ('01', '03', '06', '07')"));
ok('sqlDongGopDauVao lấy ma_lt trên ĐẦU MỤC, không phải ma_lt1 của UR',
  sqlDongGopDauVao(['07.00.00'], ['NV01']).includes('RTRIM(dmuc.ma_lt)')
  && !sqlDongGopDauVao(['07.00.00'], ['NV01']).includes('yc.ma_lt1')
  && !sqlDongGopDauVao(['07.00.00'], ['NV01']).includes('dmuc.ma_lt1'));

process.stdout.write('\n=== roster · cấp bậc · PP ===\n');
ok('normalizeRoster gắn capBac PP > NV',
  roster.find((n) => n.ma_nv === 'NV07').capBac > roster.find((n) => n.ma_nv === 'NV01').capBac);
ok('phoPhong lấy đúng người ma_chv=PP', phoPhong(roster) === 'NV07');
ok('phoPhong roster không có PP -> rỗng',
  phoPhong(roster.filter((n) => n.ma_chv !== 'PP')) === '');

process.stdout.write('\n=== ai là PM ===\n');
const projects = [
  { ma_da: 'DEMO1', ltql: ['PM01'] },
  { ma_da: 'NEWPEARL', ltql: ['nv07'] },          // nbdmda viết hoa thường không thống nhất
  { ma_da: 'TFR', ltql: ['TUANLH'] },                // đã chuyển bộ phận
  { ma_da: 'CNBT', ltql: ['NV01', 'PM01'] },
];
const pmSet = xacDinhPm(roster, projects);
ok('PM = người trong roster có tên ở ma_ltql123',
  [...pmSet].sort().join(',') === 'NV01,NV07,PM01', [...pmSet].sort().join(','));
ok('Người đã rời phòng KHÔNG được tính là PM', !pmSet.has('TUANLH'));
ok('Hoa thường lệch không đẻ ra PM thứ hai', !pmSet.has('nv07'));

process.stdout.write('\n=== PM của dự án khi LTQL đã off / chuyển phòng ===\n');
const pmCbvn = pmCuaDuAn(['PM01'], roster, 'NV07');
ok('LTQL còn trong phòng -> giữ nguyên',
  pmCbvn.nguon === 'ltql' && pmCbvn.pm.join() === 'PM01');
const pmTfr = pmCuaDuAn(['TUANLH'], roster, 'NV07');
ok('LTQL rời phòng -> PM là cấp PP',
  pmTfr.nguon === 'pp-thay-the' && pmTfr.pm.join() === 'NV07', JSON.stringify(pmTfr));
ok('Nói rõ ai là người đã rời phòng', pmTfr.ngoaiPhong.join() === 'TUANLH');
ok('ngoaiPhong không lặp khi ma_lt1 = ma_lt2',
  pmCuaDuAn(['TUANLH', 'TUANLH'], roster, 'NV07').ngoaiPhong.join() === 'TUANLH');
ok('Không có PP -> không bịa ra PM',
  pmCuaDuAn(['TUANLH'], roster, '').nguon === 'khong-xac-dinh');

process.stdout.write('\n=== laChuaPhanCong với dự án nhiều LTQL ===\n');
ok('ma_lt1 trống -> chưa phân', laChuaPhanCong('', 'NV01') === true);
ok('ma_lt1 = một trong hai PM -> vẫn tính là CHƯA phân',
  laChuaPhanCong('PM01', 'NV01, PM01') === true);
ok('Nhận cả mảng', laChuaPhanCong('PM01', ['NV01', 'PM01']) === true);
ok('Người khác PM -> đã phân', laChuaPhanCong('HOATV', 'NV01, PM01') === false);

process.stdout.write('\n=== tải trọng suy từ chính dataset ===\n');
const NGAY = '2026-08-13';
const yeuCau = [
  { stt_rec: 'A1', trang_thai: 'XN', ur_ma_lt1: 'NV01', ngay_ht: '2026-08-14', menu_id: '07.00.00' },
  { stt_rec: 'A2', trang_thai: 'TH', ur_ma_lt1: 'NV01', ngay_ht: '2026-08-10', menu_id: '07.00.00' },
  { stt_rec: 'A3', trang_thai: 'TH', ur_ma_lt1: 'NV01', ngay_ht: '2026-12-31', menu_id: '07.00.00' },
  { stt_rec: 'A4', trang_thai: 'XN', ur_ma_lt1: 'NV08', ngay_ht: '2026-12-31', menu_id: '07.00.00' },
  { stt_rec: 'A5', trang_thai: 'DD', ur_ma_lt1: '', ngay_ht: '2026-08-20', menu_id: '07.00.00' },
];
const tai = buildTaiTrong(yeuCau, H, NGAY);
const taiHuy = tai.find((t) => t.ma_lt1 === 'NV01');
ok('Đếm cả quá hạn lẫn sắp tới hạn', taiHuy.so_ur_toi_han === 2, JSON.stringify(taiHuy));
ok('Đếm đủ UR đang mở', taiHuy.so_ur_dang_mo === 3);
ok('Hạn còn xa không tính là tới hạn',
  tai.find((t) => t.ma_lt1 === 'NV08').so_ur_toi_han === 0);
ok('UR chưa giao không đẻ ra dòng tải trống', !tai.some((t) => !t.ma_lt1));
ok('menuCanGoiY chỉ lấy menu của UR ở DD', menuCanGoiY(yeuCau).join() === '07.00.00');

process.stdout.write('\n=== buildNhanSu (runSql tiêm giả) ===\n');
const goiSql = [];
const runSqlGia = ({ dbType, sql, database }) => {
  goiSql.push({ dbType, database, bang: /FROM nbctdaumuc/.test(sql) ? 'nbctdaumuc' : /FROM userinfo2/.test(sql) ? 'userinfo2' : 'nbphyc' });
  if (/FROM userinfo2/.test(sql)) return { rows: ROSTER_ROWS };
  if (/FROM nbctdaumuc/.test(sql)) return { rows: [
    { ma_lt1: 'NV08', nguon: '07.00.00', so_ur: '5' },
    { ma_lt1: 'NV01', nguon: '07.00.00', so_ur: '2' },
  ] };
  return { rows: [
    { ma_lt1: 'NV01', menu_id: '07.00.00', so_ur: '90' },
    { ma_lt1: 'NV08', menu_id: '07.00.00', so_ur: '30' },
    { ma_lt1: 'PM01', menu_id: '07.00.00', so_ur: '9' },
  ] };
};
const nhanSu = buildNhanSu(undefined,
  { pmDept: 'FSD', yeuCau, projects, ngayChay: NGAY },
  { runSql: runSqlGia, holidays: H });

ok('Roster đọc từ DB sys, lịch sử + đóng góp đầu vào đọc từ DB app',
  goiSql[0].dbType === 'sys' && goiSql[1].dbType === 'app' && goiSql[2].dbType === 'app',
  JSON.stringify(goiSql));
ok('Ba câu SQL đúng ba bảng nguồn',
  goiSql.map((g) => g.bang).join(',') === 'userinfo2,nbphyc,nbctdaumuc', goiSql.map((g) => g.bang).join(','));
ok('nhanSu có đủ bốn khối assignee cần',
  Array.isArray(nhanSu.ungVien) && Array.isArray(nhanSu.lichSuMenu)
  && Array.isArray(nhanSu.taiTrong) && Array.isArray(nhanSu.dongGopDauVao));
ok('ungVien = roster đang làm việc', nhanSu.ungVien.length === 4);
ok('phoPhong nhận đúng', nhanSu.phoPhong === 'NV07');
ok('dongGopDauVao nạp đúng từ nbctdaumuc',
  nhanSu.dongGopDauVao.length === 2
  && nhanSu.dongGopDauVao.find((r) => r.ma_lt1 === 'NV08')?.so_ur === 5,
  JSON.stringify(nhanSu.dongGopDauVao));
ok('Không có nguồn nào hỏng -> thieuDuLieu rỗng', nhanSu.thieuDuLieu.length === 0,
  nhanSu.thieuDuLieu.join(' | '));

const nhanSuHong = buildNhanSu(undefined,
  { pmDept: 'FSD', yeuCau, projects, ngayChay: NGAY },
  { runSql: () => { throw new Error('sqlcmd không chạy'); }, holidays: H });
ok('userinfo2 lỗi -> ghi rõ lý do chứ không im lặng trả rỗng',
  nhanSuHong.thieuDuLieu.some((m) => m.includes('userinfo2')), nhanSuHong.thieuDuLieu.join(' | '));
ok('userinfo2 lỗi vẫn còn tải trọng (một nguồn hỏng không đánh sập cả khối)',
  nhanSuHong.taiTrong.length > 0);

// Chỉ nbctdaumuc hỏng — roster và lịch sử menu vẫn đọc được, chỉ mất tiêu chí 3.
const nhanSuDaumucHong = buildNhanSu(undefined,
  { pmDept: 'FSD', yeuCau, projects, ngayChay: NGAY },
  {
    runSql: (opt) => {
      if (/FROM nbctdaumuc/.test(opt.sql)) throw new Error('sqlcmd không chạy');
      return runSqlGia(opt);
    },
    holidays: H,
  });
ok('nbctdaumuc lỗi -> ghi rõ lý do, không đánh sập roster/lịch sử menu',
  nhanSuDaumucHong.thieuDuLieu.some((m) => m.includes('nbctdaumuc'))
  && nhanSuDaumucHong.roster.length === 4 && nhanSuDaumucHong.lichSuMenu.length > 0,
  nhanSuDaumucHong.thieuDuLieu.join(' | '));

process.stdout.write('\n=== kinh nghiệm hiện vật đọc từ đồ thị ===\n');
ok('SQL đọc node_ExperienceFact của DB đồ thị, không phải QLDA',
  sqlKinhNghiemHienVat(['SVTran'], ['NV01']).includes('FROM dbo.node_ExperienceFact'));
ok('Đếm theo UR duy nhất, không đếm trùng khi một UR sinh nhiều dòng cùng hiện vật',
  sqlKinhNghiemHienVat(['SVTran'], ['NV01']).includes('COUNT(DISTINCT RTRIM(stt_rec))'));
ok('KHÔNG lọc theo dự án — kinh nghiệm SVTran ở dự án khác vẫn dùng được',
  !/ma_da/.test(sqlKinhNghiemHienVat(['SVTran'], ['NV01'])));

// UR ở DD đã mang sẵn `hienVat` -> buildNhanSu phải đi hỏi đồ thị.
const yeuCauCoHienVat = yeuCau.map((u) =>
  u.stt_rec === 'A5' ? { ...u, hienVat: ['SVTran', 'ARTran'] } : u);
let sqlGraphDaGoi = null;
const nhanSuHv = buildNhanSu(undefined,
  { pmDept: 'FSD', yeuCau: yeuCauCoHienVat, projects, ngayChay: NGAY },
  {
    runSql: runSqlGia,
    holidays: H,
    runGraphSql: ({ sql }) => {
      sqlGraphDaGoi = sql;
      return { rows: [{ ma_lt1: 'nv01', khoaHienVat: 'SVTran', tenHienVat: 'Hóa đơn bán hàng', so_ur: '6' }] };
    },
  });

ok('Hỏi đồ thị đúng các hiện vật của UR đang chờ giao',
  sqlGraphDaGoi?.includes("'ARTran', 'SVTran'"), sqlGraphDaGoi?.split('\n')[3]);
ok('Nạp được kinh nghiệm hiện vật', nhanSuHv.kinhNghiemHienVat.length === 1);
ok('Chuẩn hoá mã người về đúng cách viết trong roster (DB trả hoa/thường lung tung)',
  nhanSuHv.kinhNghiemHienVat[0].ma_lt1 === 'NV01', nhanSuHv.kinhNghiemHienVat[0].ma_lt1);

// Không UR nào rút được hiện vật -> không hỏi đồ thị, không báo thiếu vô cớ.
let daGoi = false;
const nhanSuKhongHv = buildNhanSu(undefined,
  { pmDept: 'FSD', yeuCau, projects, ngayChay: NGAY },
  { runSql: runSqlGia, holidays: H, runGraphSql: () => { daGoi = true; return { rows: [] }; } });
ok('Không có hiện vật nào -> KHÔNG gọi đồ thị', daGoi === false);
ok('Và cũng không báo thiếu dữ liệu vô cớ', nhanSuKhongHv.thieuDuLieu.length === 0,
  nhanSuKhongHv.thieuDuLieu.join(' | '));

// Đồ thị chết -> ghi rõ lý do, các nguồn khác vẫn còn.
const nhanSuGraphHong = buildNhanSu(undefined,
  { pmDept: 'FSD', yeuCau: yeuCauCoHienVat, projects, ngayChay: NGAY },
  { runSql: runSqlGia, holidays: H, runGraphSql: () => { throw new Error('DB đồ thị không với tới'); } });
ok('Đồ thị chết -> nói rõ, không đánh sập roster/tải trọng',
  nhanSuGraphHong.thieuDuLieu.some((m) => m.includes('node_ExperienceFact'))
  && nhanSuGraphHong.roster.length === 4 && nhanSuGraphHong.taiTrong.length > 0,
  nhanSuGraphHong.thieuDuLieu.join(' | '));

process.stdout.write('\n=== chấm điểm trên corpus thật (không được hoà hết) ===\n');
const urDd = { stt_rec: 'A5', trang_thai: 'DD', ma_lt1: '', menu_id: '07.00.00', noi_dung: 'Them cot' };
const goiY = goiYNguoiTiepNhan(urDd, nhanSu, {}, 'NV01');
const diem = goiY.ungVien.map((c) => c.diem);
ok('Ba ứng viên có điểm KHÁC nhau dù ai cũng vượt baoHoaSoUr=3',
  new Set(diem).size === diem.length, JSON.stringify(goiY.ungVien.map((c) => [c.ma_lt1, c.diem])));
ok('Ứng viên đầu có tên đầy đủ để PM khỏi phải tra',
  Boolean(goiY.ungVien[0].ten));
ok('Đánh dấu vai PM/phó phòng',
  goiY.ungVien.some((c) => c.laPm) || goiY.ungVien.some((c) => c.ma_chv === 'PP'));
const knHuy = goiY.ungVien.find((c) => c.ma_lt1 === 'NV01');
ok('Người dẫn đầu lịch sử ăn trọn điểm menu', knHuy.chiTiet.diemMenu === 100, JSON.stringify(knHuy.chiTiet));
ok('Người ít kinh nghiệm hơn bị trừ theo tỉ lệ',
  goiY.ungVien.find((c) => c.ma_lt1 === 'PM01').chiTiet.diemMenu === 10);

process.stdout.write('\n=== tiêu chí 3 nhận qua maDaumuc thật, không cần noi_dung nhắc "báo cáo" ===\n');
// nbctdaumuc.ma_daumuc='09' (Thêm/Sửa báo cáo) là tín hiệu đủ mạnh để tự nhận là đầu ra —
// không cần payload.laBaoCaoDauRa hay noi_dung chứa từ khoá tự do.
const urBaoCaoThat = {
  stt_rec: 'A6', trang_thai: 'DD', ma_lt1: '', menu_id: '07.00.00',
  noi_dung: 'Sửa lại phần liệt kê danh sách theo yêu cầu khách', maDaumuc: ['09'],
};
const goiYBaoCao = goiYNguoiTiepNhan(urBaoCaoThat, nhanSu, {}, 'NV01');
ok('Nhận đúng là đầu ra qua maDaumuc, không phải qua từ khoá tự do',
  goiYBaoCao.laBaoCaoDauRa === true && goiYBaoCao.nhanDienTu === 'daumuc');
const thanhnnBaoCao = goiYBaoCao.ungVien.find((c) => c.ma_lt1 === 'NV08');
ok('Người đóng góp UR đầu vào trên đúng menu (nbctdaumuc) được cộng điểm tiêu chí 3',
  thanhnnBaoCao && thanhnnBaoCao.chiTiet.diemDauVao > 0, JSON.stringify(thanhnnBaoCao?.chiTiet));
ok('Lý do nêu rõ nguồn đầu vào khớp menu',
  thanhnnBaoCao?.lyDo.some((r) => r.includes('đầu vào liên quan') && r.includes('07.00.00')),
  thanhnnBaoCao?.lyDo.join(' · '));

process.stdout.write('\n=== dataset -> payload -> HTML ===\n');
const dataset = {
  projects: [
    { ma_da: 'DEMO1', ten_ngan: 'DEMO CO', ma_pbsp: 'FBISP2422', bp_lt: 'FSD', ltql: ['PM01'] },
    { ma_da: 'TFR', ten_ngan: 'TFR', ma_pbsp: 'SP23', bp_lt: 'FSD', ltql: ['TUANLH'] },
  ],
  yeuCau: [
    { ma_da: 'DEMO1', stt_rec: 'A5', fcode1: '31', noi_dung: 'Them truong loai ke khai', giai_doan_da: 'DV',
      trang_thai: 'DD', menu_id: '07.00.00', ur_ma_lt1: '', ngay_ht: '2026-08-20', xac_nhan_da_hen_yn: '1', daumuc: [] },
    { ma_da: 'TFR', stt_rec: 'B1', fcode1: '7', noi_dung: 'Sua bang ke', giai_doan_da: 'DV',
      trang_thai: 'DD', menu_id: '07.00.00', ur_ma_lt1: 'TUANLH', ngay_ht: '2026-08-20', xac_nhan_da_hen_yn: '1', daumuc: [] },
  ],
  nhanSu,
};
const { portfolio, byProject } = datasetToPayloads(dataset, { ngay_chay: NGAY, pm: 'FSD' });

ok('nhanSu khai MỘT lần ở portfolio, không nhân bản theo dự án',
  Boolean(portfolio.nhanSu) && portfolio.projects.every((p) => !p.nhanSu));
ok('Payload dự án đứng riêng vẫn mang theo nhanSu', Boolean(byProject.DEMO1.nhanSu));
ok('Dự án có LTQL còn trong phòng -> pm = LTQL',
  byProject.DEMO1.pm === 'PM01' && byProject.DEMO1.pmNguon === 'ltql');
ok('Dự án có LTQL đã rời phòng -> pm = PP, ghi rõ nguồn',
  byProject.TFR.pm === 'NV07' && byProject.TFR.pmNguon === 'pp-thay-the'
  && byProject.TFR.pmNgoaiPhong.join() === 'TUANLH', JSON.stringify(byProject.TFR.pmNguon));

const { artifact, errors } = buildPortfolioArtifact(portfolio);
ok('Dựng được trang tổng quan', Boolean(artifact?.content), errors.join(' | '));
const html = artifact?.content ?? '';
ok('Mục "Chưa giao" KHÔNG còn báo "chưa nạp nhanSu"', !html.includes('chưa nạp <code>nhanSu</code>'));
ok('Có tên ứng viên số 1 trong bảng', /NV01|PM01|NV08/.test(html));
ok('Nói rõ nguồn ứng viên là userinfo2 của bộ phận',
  html.includes('userinfo2.status=1'));
ok('Cảnh báo dự án có LTQL đã off/chuyển bộ phận',
  html.includes('off hoặc chuyển bộ phận') && html.includes('TFR'));

process.stdout.write(`\n=== TEST KẾT THÚC: ${failures ? `${failures} thất bại` : 'TẤT CẢ PASS (0 thất bại)'} ===\n`);
process.exit(failures ? 1 : 0);
