// experience-extract.mjs — rút kinh nghiệm THẬT từ nội dung UR đã làm xong.
//
// VÌ SAO KHÔNG DÙNG `menu_id` LÀM KHOÁ — đo được, không phải phỏng đoán:
// Trên dự án DVDKB_FBO, 25 giá trị `menu_id` khác nhau xuất hiện trong `nbphyc`, đối chiếu
// với `wcommand` (cây menu THẬT của chính chương trình đó) thì **đúng 1 cái tồn tại**. Các
// giá trị như `07.00.00`, `07.10.06`, `07.10.08` không có trong cây menu của khách. Nói cách
// khác `nbphyc.menu_id` KHÔNG phải khoá ngoại tới màn hình — nó là số hiệu do BA ghi, có thể
// theo bản chuẩn, theo phiên bản cũ, hoặc gõ tay.
//
// Trong khi đó TÊN thì khớp chính xác. Cùng UR đó (A000571322YC1) nội dung liệt kê 7 chứng
// từ, tra `wcommand` theo tên ra đủ 7, ở menu_id hoàn toàn khác:
//     "Hóa đơn bán hàng"                    → 06.01.04  SVTran
//     "Hóa đơn dịch vụ"                     → 04.01.06  ARTran
//     "Hóa đơn dịch vụ trả lại"             → 04.01.07  GRTran
//     "Hóa đơn điều chỉnh giá hàng bán"     → 99.98.15  SPTran
//     "Hóa đơn điều chỉnh giá dịch vụ"      → 99.98.61  VATran
//     "Hóa đơn giảm giá hàng hóa - dịch vụ" → 04.01.08  SDTran
//     "Phiếu nhập hàng bán trả lại"         → 04.01.05  SRTran
//
// Nên khoá của kinh nghiệm là `sysid` (controller thật sau màn hình), phân giải từ TÊN tìm
// thấy trong nội dung. `menu_id` chỉ còn là gợi ý yếu, và khi nó không phân giải được thì
// phải NÓI RA chứ không im lặng tin.
//
// Thuần hàm: vào là dòng wcommand + UR đã lấy sẵn, ra là node/cạnh. Không chạm DB, không LLM.

import { boDau } from './assignee.mjs';

const chuan = (v) => String(v ?? '').trim();

/**
 * Độ dài tối thiểu (sau chuẩn hoá) của một tên mới được đem đi dò trong văn bản tự do.
 *
 * Tên ngắn gây khớp bừa: "Kho", "Vật tư" xuất hiện trong hầu hết mọi câu nghiệp vụ mà không
 * hề có nghĩa là UR đó đụng vào màn hình cùng tên. Ngưỡng này bỏ qua chúng — thà mất một vài
 * hiện vật còn hơn gắn kinh nghiệm cho người không làm.
 */
const DAI_TOI_THIEU = 10;

/** Chuẩn hoá để so khớp TÊN: bỏ dấu, gộp khoảng trắng, bỏ ký tự trang trí quanh từ. */
export function chuanHoaTen(s) {
  return boDau(s).replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * Chuẩn hoá để đọc CÂU — giống trên nhưng giữ dấu câu thành ranh giới `¦`.
 *
 * Cần riêng vì `chuanHoaTen` xoá sạch dấu câu, và khi đó "Ở Tab Khác - Thêm trường Loại kê
 * khai" trở thành một chuỗi từ liền mạch: phép bắt tên tab nuốt luôn mệnh đề sau dấu gạch và
 * cho ra `tab khac them`. Ranh giới câu là thông tin, xoá đi rồi thì không suy lại được.
 */
export function chuanHoaCau(s) {
  return boDau(s)
    .replace(/[.,;:()\[\]{}\/\\\-–—+*"'`>|\n\r\t]+/g, ' ¦ ')
    .replace(/[^a-z0-9¦]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Câu SQL lấy từ điển màn hình của MỘT chương trình. Chạy trên db `sys` của chính nó. */
export function sqlTuDien() {
  return `
SELECT RTRIM(menu_id) AS menu_id, RTRIM(bar) AS bar, RTRIM(sysid) AS sysid, RTRIM(type) AS type
FROM wcommand
WHERE RTRIM(sysid) <> '' AND RTRIM(bar) NOT IN ('', '-')
ORDER BY menu_id`.trim();
}

/**
 * `wcommand` → từ điển tra theo TÊN đã chuẩn hoá.
 *
 * Một tên có thể ứng nhiều `sysid`: đo trên DVDKB_FBO, "Hóa đơn bán hàng" ra cả `SVTran`
 * (màn hình nhập) lẫn `rptPrintSVTran` (mẫu in của chính nó). Ưu tiên màn hình nhập vì UR nói
 * "sửa hóa đơn bán hàng" gần như luôn là sửa chứng từ chứ không phải sửa mẫu in; trường hợp
 * thật sự là mẫu in thì nội dung có chữ "mẫu in"/"in ra" và nhánh báo cáo bên dưới bắt được.
 *
 * @param {Array} rows - kết quả sqlTuDien()
 * @returns {Map<string, {ten: string, sysid: string, menu_id: string, laBaoCao: boolean, nhapNhang: string[]}>}
 */
export function buildTuDien(rows = []) {
  const theoTen = new Map();
  for (const r of rows) {
    const ten = chuan(r.bar);
    const sysid = chuan(r.sysid);
    if (!ten || !sysid) continue;
    const khoa = chuanHoaTen(ten);
    if (khoa.length < DAI_TOI_THIEU) continue;

    const laBaoCao = /^rpt/i.test(sysid);
    const cu = theoTen.get(khoa);
    if (!cu) {
      theoTen.set(khoa, { ten, sysid, menu_id: chuan(r.menu_id), laBaoCao, nhapNhang: [] });
      continue;
    }
    if (cu.sysid === sysid) continue;
    // Đã có màn hình nhập rồi thì giữ; chưa có mà cái mới không phải báo cáo thì thay.
    if (cu.laBaoCao && !laBaoCao) {
      cu.nhapNhang.push(cu.sysid);
      Object.assign(cu, { sysid, menu_id: chuan(r.menu_id), laBaoCao });
    } else if (!cu.nhapNhang.includes(sysid)) {
      cu.nhapNhang.push(sysid);
    }
  }
  return theoTen;
}

/**
 * Hành động và vị trí — phần ngữ nghĩa tự do.
 *
 * CHỦ Ý làm mỏng. Mẫu quan sát trên dữ liệu thật lặp lại đủ để bắt bằng biểu thức ("Thêm
 * trường X", "Ẩn trường Y", "Ở Tab Khác"), nhưng văn xuôi tiếng Việt thì vô hạn biến thể —
 * đây chỉ là tầng rẻ chạy được trên toàn bộ 74.826 UR. Tầng LLM (xem `nguon: 'llm'` ở
 * graph-schema.json) chạy sau, ghi đè bằng kết quả chi tiết hơn và LUÔN mang `doTinCay < 1`
 * cùng `duyetBoiPm = 0`. Không cố nhồi hết vào regex.
 */
const HANH_DONG = [
  [/\b(them|bo sung)\b[^¦]{0,20}\btruong\b/, 'them-truong'],
  [/\b(them|bo sung)\b[^¦]{0,20}\bcot\b/, 'them-cot'],
  [/\ban\b[^¦]{0,20}\btruong\b/, 'an-truong'],
  [/\bsua loi\b|\bfix loi\b|\bloi\b/, 'sua-loi'],
  [/\bsua\b|\bchinh sua\b|\bdieu chinh\b/, 'sua'],
  [/\bthem\b|\btao\b|\blap\b/, 'them'],
];

const VI_TRI = [
  // Lấy trọn cụm tới ranh giới câu, tối đa 6 từ; không tới ranh giới thì rơi xuống nhánh một
  // từ bên dưới. Bản đầu bắt tới 20 KÝ TỰ bất kể ranh giới nên "Ở Tab Khác - Thêm trường Loại
  // kê khai" cho ra `tab khac them truong loa` — một giá trị vô nghĩa nhưng vẫn được ghi
  // xuống DB như thể đã hiểu. Thà thiếu để tầng LLM bù, còn hơn lưu rác trông như dữ liệu.
  [/\btab ((?:[a-z0-9]+)(?: [a-z0-9]+){0,5})(?= ¦|$)/, (m) => `tab ${m[1].trim()}`],
  [/\btab ([a-z0-9]+)/, (m) => `tab ${m[1]}`],
  [/\bdieu kien loc\b/, () => 'điều kiện lọc'],
  [/\bmau in\b/, () => 'mẫu in'],
  [/\bman hinh\b/, () => 'màn hình'],
];

/** @returns {{hanhDong?: string, viTri?: string}} */
export function rutHanhDong(noiDung) {
  const s = chuanHoaCau(noiDung);
  const out = {};
  for (const [re, nhan] of HANH_DONG) {
    if (re.test(s)) { out.hanhDong = nhan; break; }
  }
  for (const [re, fn] of VI_TRI) {
    const m = re.exec(s);
    if (m) { out.viTri = fn(m); break; }
  }
  return out;
}

/**
 * Hiện vật mà MỘT ur thật sự đụng vào.
 *
 * Dò tên trong nội dung theo kiểu KHỚP DÀI TRƯỚC và ăn hết vùng đã khớp: "Hóa đơn bán hàng"
 * phải thắng "Hóa đơn", và sau khi khớp thì đoạn đó không được đem khớp lại bằng tên ngắn hơn.
 *
 * @param {object} u - UR (cần `noi_dung`; `menu_id` tuỳ chọn)
 * @param {Map} tuDien - buildTuDien()
 * @returns {{hienVat: Array, menuIdPhanGiaiDuoc: boolean}}
 */
export function rutHienVat(u, tuDien) {
  const noiDung = chuanHoaTen(u?.noi_dung);
  const menuId = chuan(u?.menu_id);

  // Dò tên trong nội dung. Sắp theo độ dài giảm dần để tên dài thắng tên ngắn nằm trong nó.
  const theoDoDai = [...tuDien.entries()].sort((a, b) => b[0].length - a[0].length);
  const daAn = [];
  const hienVat = [];
  const daCo = new Set();

  const chongLan = (i, j) => daAn.some(([a, b]) => i < b && j > a);

  for (const [khoa, muc] of theoDoDai) {
    let tu = 0;
    for (;;) {
      const i = noiDung.indexOf(khoa, tu);
      if (i < 0) break;
      const j = i + khoa.length;
      // Khớp phải trọn từ, không cắt giữa chừng: "hoa don ban hang" không được khớp vào
      // "hoa don ban hang hoa" theo kiểu nửa vời.
      const truoc = i === 0 || noiDung[i - 1] === ' ';
      const sau = j === noiDung.length || noiDung[j] === ' ';
      if (truoc && sau && !chongLan(i, j)) {
        daAn.push([i, j]);
        if (!daCo.has(muc.sysid)) {
          daCo.add(muc.sysid);
          hienVat.push({ ...muc, nguon: 'tu-dien' });
        }
        break;
      }
      tu = i + 1;
    }
  }

  // `menu_id` chỉ được dùng khi nó THẬT SỰ phân giải được trong cây menu của chương trình đó.
  // Đo trên DVDKB_FBO: 1/25 giá trị phân giải được — nên đây là nhánh hiếm, không phải nhánh
  // chính. Không phân giải được thì bỏ, KHÔNG bịa ra một hiện vật mang chính chuỗi menu_id.
  let menuIdPhanGiaiDuoc = false;
  if (menuId) {
    for (const muc of tuDien.values()) {
      if (muc.menu_id !== menuId) continue;
      menuIdPhanGiaiDuoc = true;
      if (!daCo.has(muc.sysid)) {
        daCo.add(muc.sysid);
        hienVat.push({ ...muc, nguon: 'menu_id' });
      }
      break;
    }
  }

  return { hienVat, menuIdPhanGiaiDuoc };
}

/**
 * UR đã làm xong → node ExperienceFact + cạnh.
 *
 * @param {Array} urs - đã lọc qua cổng trạng thái (graph-sync → urDaXong)
 * @param {Map} tuDien
 * @param {{maDa: string, boi?: string}} args
 * @returns {{nodes: Array, edges: Array, thongKe: object}}
 */
export function toExperienceFacts(urs = [], tuDien = new Map(), args = {}) {
  const maDa = chuan(args.maDa);
  const boi = chuan(args.boi) || undefined;
  const nodes = [];
  const edges = [];
  const thongKe = { soUr: 0, soFact: 0, urKhongRaHienVat: 0, menuIdPhanGiaiDuoc: 0 };

  for (const u of urs) {
    const stt = chuan(u.stt_rec);
    const nguoi = chuan(u.ur_ma_lt1 ?? u.ma_lt1);
    if (!stt || !nguoi) continue;
    thongKe.soUr += 1;

    const { hienVat, menuIdPhanGiaiDuoc } = rutHienVat(u, tuDien);
    if (menuIdPhanGiaiDuoc) thongKe.menuIdPhanGiaiDuoc += 1;
    if (!hienVat.length) { thongKe.urKhongRaHienVat += 1; continue; }

    const { hanhDong, viTri } = rutHanhDong(u.noi_dung);

    for (const hv of hienVat) {
      const loai = hv.laBaoCao ? 'bao-cao' : 'controller';
      nodes.push({
        _: 'node',
        kind: 'ExperienceFact',
        scope: maDa,
        capNhatBoi: boi,
        id: `${stt}|${loai}|${hv.sysid}`,
        stt_rec: stt,
        ma_da: maDa,
        ma_lt1: nguoi,
        loaiHienVat: loai,
        khoaHienVat: hv.sysid,
        tenHienVat: hv.ten,
        hanhDong,
        viTri,
        ngayHoanThanh: chuan(u.ngay_ht).slice(0, 10) || undefined,
        trangThaiNguon: chuan(u.trang_thai),
        nguon: hv.nguon,
        // Khớp theo tên là chắc chắn về HIỆN VẬT nhưng hành động/vị trí thì chỉ là suy từ mẫu
        // câu — để dưới 1 và chờ PM duyệt, đúng luật của lược đồ.
        doTinCay: hv.nguon === 'tu-dien' ? 0.9 : 0.7,
        duyetBoiPm: false,
      });
      thongKe.soFact += 1;

      edges.push({ _: 'edge', type: 'PRODUCED_EXPERIENCE',
        from: `Request:${stt}`, to: `ExperienceFact:${maDa}|${stt}|${loai}|${hv.sysid}`, nguon: 'rut-tu-noi-dung' });
    }
  }
  return { nodes, edges, thongKe };
}
