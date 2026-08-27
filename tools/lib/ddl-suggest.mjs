// ddl-suggest.mjs — đọc nội dung UR, suy ra cột/bảng cần đụng, ra ĐẶC TẢ `ddl` để ddl.mjs sinh SQL.
//
// VÌ SAO CÓ FILE NÀY. Mục "Gợi ý tạo bảng / thêm cột" của báo cáo đọc `u.ddl` hoặc `u.ghiChuDdl`
// — hai trường chỉ có khi NGƯỜI gõ tay vào payload. Đường sinh tự động từ dataset không bao giờ
// điền chúng, nên mục đó rỗng ở mọi báo cáo máy dựng, kể cả khi UR nói thẳng "Thêm trường Mã vụ
// việc". Luật PM đặt: yêu cầu nào đụng tới lược đồ thì LUÔN phải có script để giao lập trình
// viên — không có thì lập trình viên tự nghĩ tên cột và kiểu, mỗi người một kiểu.
//
// KHÔNG BỊA KIỂU DỮ LIỆU. Kiểu lấy từ CHÍNH database của khách: đếm xem cột tên đó đang tồn tại
// với kiểu gì trên bao nhiêu bảng rồi lấy kiểu áp đảo (đo trên NBT: `ma_vv varchar(16)` có mặt ở
// 2.965 bảng, `ma_bp varchar(16)` ở 3.875, `so_dd varchar(32)` ở 314). Đó là câu trả lời đúng
// theo định nghĩa — cột mới phải khớp cột cùng tên đang chạy, không khớp một hằng số trong hub.
// Caller lo phần hỏi DB; file này chỉ nhận kết quả.
//
// Ranh giới: thuần hàm. Không chạm DB, không đọc file, không sinh SQL — trả ĐẶC TẢ, `ddl.mjs`
// mới dựng câu lệnh. Giữ đúng luật "một chỗ duy nhất viết cú pháp SQL".

import { boDau } from './assignee.mjs';

const chuan = (v) => String(v ?? '').trim();

/**
 * Nhãn trên màn hình → tên cột thật. Từ điển ĐÓNG.
 *
 * Người viết UR gõ nhãn tiếng Việt ("Mã vụ việc"), lập trình viên cần tên cột (`ma_vv`). Ánh xạ
 * này không suy ra được bằng quy tắc — `Mã vụ việc` → `ma_vv` nhưng `Số định danh` → `so_dd`
 * chứ không phải `so_dinh_danh`. Nhãn không có trong bảng này thì trả về `null` và báo là CHƯA
 * CHỐT ĐƯỢC TÊN CỘT, không tự phiên âm: đoán sai tên cột còn tệ hơn để trống, vì script trông
 * như chạy được.
 *
 * `tu` khớp trên chuỗi đã bỏ dấu, thường hoá.
 */
export const NHAN_COT = [
  { cot: 'ma_vv', nhan: 'Mã vụ việc', tu: ['ma vu viec', 'vu viec'] },
  { cot: 'ma_bp', nhan: 'Mã bộ phận', tu: ['ma bo phan', 'bo phan su dung', 'ma bp'] },
  { cot: 'ma_phi', nhan: 'Mã phí', tu: ['ma phi', 'khoan muc phi'] },
  { cot: 'so_dd', nhan: 'Số định danh', tu: ['so dinh danh', 'so cccd', 'cccd'] },
  { cot: 'so_hc', nhan: 'Số hộ chiếu', tu: ['so ho chieu', 'ho chieu'] },
  { cot: 'ma_kh', nhan: 'Mã khách hàng', tu: ['ma khach hang'] },
  { cot: 'ma_nvien', nhan: 'Mã nhân viên', tu: ['ma nhan vien'] },
  { cot: 'ma_hd', nhan: 'Mã hợp đồng', tu: ['ma hop dong'] },
  { cot: 'dept_id', nhan: 'Khoá bộ phận (phân quyền)', tu: ['dept_id'] },
];

/**
 * Câu mở đầu một yêu cầu thêm trường. Bắt cả ba cách viết gặp trong dữ liệu thật:
 * "Thêm trường X", "Bổ sung thêm trường X", "bổ sung thêm 2 trường X và Y".
 */
const RE_THEM_TRUONG = /(?:them|bo sung(?: them)?)\s+(?:\d+\s+)?(?:truong|cot)\s+([^:.+]{2,60})/g;

/** Dòng gạch đầu dòng liệt kê trường: "+ Mã vụ việc: lấy từ danh mục vụ việc". */
const RE_GACH_DAU_DONG = /\+\s*([^:+]{2,50}):/g;

/**
 * UR có THẬT SỰ đang xin thêm trường không.
 *
 * Cổng này phải đứng trước mọi phép rút, nếu không một UR chỉ nhắc "lọc theo mã bộ phận" cũng bị
 * đề xuất `ALTER TABLE`. Bắt cả dạng liệt kê ("bổ sung tab Khác, gồm các trường sau") vì nhiều UR
 * mở đầu như vậy rồi mới gạch đầu dòng từng trường.
 */
const RE_TIN_HIEU_THEM = /them truong|them cot|bo sung[^.]{0,24}truong|gom cac truong sau/;

/** Yêu cầu tạo hẳn danh mục mới — khác thêm cột, ra `kind: 'danh-muc'`. */
const RE_DANH_MUC_MOI = /them moi danh muc|tao (?:moi )?danh muc|bo sung danh muc/;

/** Yêu cầu dựng chứng từ / họ bảng mới. */
const RE_BANG_MOI = /tao (?:moi )?(?:bang|chung tu)|them moi chung tu|thiet ke chuc nang[^.]{0,60}bang/;

/**
 * Cột mà UR này xin THÊM.
 *
 * Chỉ soi các CỤM ĐÃ ĐƯỢC ĐỊNH VỊ — phần bắt được của "thêm trường <X>" và của gạch đầu dòng
 * "+ <X>:" — chứ KHÔNG quét nhãn trên toàn văn. Quét toàn văn sai ở ca thật đầu tiên gặp phải:
 * "Thêm trường Mã vụ việc: lấy từ danh mục vụ việc, đặt dưới Mã phí" — `Mã phí` ở đây là MỐC VỊ
 * TRÍ trên form, không phải trường xin thêm, mà quét toàn văn thì nó thành một câu ALTER TABLE.
 *
 * @returns {Array<{cot: string, nhan: string}>}
 */
export function rutCotDeXuat(u) {
  const text = boDau(chuan(u?.noi_dung)).replace(/\s+/g, ' ');
  if (!text || !RE_TIN_HIEU_THEM.test(text)) return [];

  const cum = [];
  for (const re of [RE_THEM_TRUONG, RE_GACH_DAU_DONG]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text)) !== null) cum.push(m[1]);
  }
  if (!cum.length) return [];

  const co = new Set();
  const ra = [];
  for (const c of cum) {
    for (const nc of NHAN_COT) {
      if (!nc.tu.some((t) => c.includes(t)) || co.has(nc.cot)) continue;
      co.add(nc.cot);
      ra.push({ cot: nc.cot, nhan: nc.nhan });
    }
  }
  return ra;
}

/**
 * UR này đụng tới lược đồ theo kiểu nào.
 * @returns {'danh-muc'|'chung-tu-moi'|'them-cot'|null}
 */
export function loaiThayDoiLuocDo(u) {
  const text = boDau(chuan(u?.noi_dung)).replace(/\s+/g, ' ');
  if (!text) return null;
  if (RE_DANH_MUC_MOI.test(text)) return 'danh-muc';
  if (RE_BANG_MOI.test(text)) return 'chung-tu-moi';
  return RE_TIN_HIEU_THEM.test(text) ? 'them-cot' : null;
}

/**
 * Đặc tả `ddl` cho một UR thêm cột.
 *
 * LUÔN TRẢ VỀ MỘT ĐẶC TẢ khi UR có yêu cầu thêm cột — kể cả khi chưa chốt được họ bảng hay kiểu
 * dữ liệu. Chỗ chưa chốt đi vào `canhBao` dưới dạng câu hỏi phải trả lời, chứ không làm biến mất
 * cả gợi ý: lập trình viên cầm script có một chỗ trống rõ ràng vẫn hơn cầm một mục rỗng.
 *
 * @param {Object} u UR
 * @param {{cot: string, nhan: string}} cot
 * @param {{family?: string, nhan?: string, kieu?: string, soBangCoKieu?: number,
 *          daCo?: boolean, soBangHo?: number, slotTrong?: string[], phanVung?: boolean}} biet
 * @returns {{ddl: object, chuaChot: string[]}}
 */
export function deXuatThemCot(u, cot, biet = {}) {
  const chuaChot = [];
  const canhBao = [];

  const family = chuan(biet.family);
  if (!family) {
    chuaChot.push(`chưa chốt được HỌ BẢNG của màn hình ${chuan(u?.sysid) || '(không rõ controller)'}`);
    canhBao.push('HỌ BẢNG chưa chốt: mở controller của màn hình này, đọc thuộc tính `table` trên '
      + 'thẻ gốc (dạng `m31$000000`) rồi thay vào chỗ `<HO_BANG>` bên dưới.');
  }

  const kieu = chuan(biet.kieu);
  if (kieu) {
    canhBao.push(`Kiểu \`${kieu}\` lấy từ CHÍNH database của khách: cột \`${cot.cot}\` đang tồn tại `
      + `với kiểu này trên ${biet.soBangCoKieu ?? '?'} bảng. Không phải kiểu do hub quy định.`);
  } else {
    chuaChot.push(`chưa chốt được KIỂU của cột \`${cot.cot}\` — chưa thấy cột này ở bảng nào trong DB khách`);
    canhBao.push(`KIỂU chưa chốt: cột \`${cot.cot}\` chưa tồn tại ở đâu trong DB này. Lấy kiểu theo `
      + 'cột tương đương ở một chứng từ chuẩn cùng loại rồi thay vào chỗ `<KIEU>`.');
  }

  if (biet.daCo) {
    canhBao.push(`Họ bảng \`${family}$\` ĐÃ CÓ cột \`${cot.cot}\` — nhiều khả năng không phải thêm `
      + 'cột mà chỉ cần đưa trường lên form. Kiểm màn hình trước khi báo giờ công.');
  }

  return {
    ddl: {
      kind: 'them-cot',
      family: family || '<HO_BANG>',
      column: cot.cot,
      type: kieu || '<KIEU>',
      nhan: chuan(biet.nhan) || undefined,
      ma: chuan(u?.fcode1) ? `UR ${chuan(u.fcode1)}` : undefined,
      sysid: chuan(u?.sysid) || undefined,
      phanVung: biet.phanVung !== false,
      soBang: biet.phanVung === false ? undefined : biet.soBangHo,
      slotTrong: biet.slotTrong ?? [],
      canhBao,
    },
    chuaChot,
  };
}

/**
 * Điểm vào của cả file: UR → danh sách đặc tả `ddl`.
 *
 * LUẬT: yêu cầu nào đụng tới lược đồ thì LUÔN có ít nhất một đặc tả. Ba mức xuống dần, không mức
 * nào rơi về rỗng:
 *   - biết cột, biết họ bảng, biết kiểu → script chạy được ngay;
 *   - biết cột, thiếu họ bảng hoặc kiểu → script có chỗ trống ĐƯỢC ĐÁNH DẤU, kèm câu hỏi phải
 *     trả lời trong `chuaChot`;
 *   - chỉ biết "UR này xin thêm trường" mà nhãn không có trong từ điển → vẫn ra một script khung
 *     với `<TEN_COT>`, để lập trình viên điền chứ không phải tự nhớ là có việc này.
 *
 * Mức ba là mức quan trọng nhất về mặt quy trình: trước đây nó rơi vào im lặng hoàn toàn.
 *
 * @param {Object} u UR
 * @param {{family?: string, nhan?: string, kieuTheoCot?: Record<string, {kieu: string, soBang: number}>,
 *          coSanTheoCot?: Record<string, boolean>, soBangHo?: number, slotTrong?: string[]}} biet
 * @returns {{loai: string|null, ddl: object[], chuaChot: string[]}}
 */
export function goiYDdl(u, biet = {}) {
  const loai = loaiThayDoiLuocDo(u);
  if (!loai) return { loai: null, ddl: [], chuaChot: [] };

  // Tạo danh mục / họ bảng mới KHÔNG sinh script tự động: cấu trúc bảng phải sao chép từ một
  // bảng chuẩn cùng loại trong CHÍNH chương trình đó (xem data/fbo-ddl.json → danhMuc), mà chọn
  // bảng nào là quyết định nghiệp vụ. Trả về đặc tả rỗng kèm việc phải làm, không bịa cột.
  if (loai !== 'them-cot') {
    return {
      loai,
      ddl: [],
      chuaChot: [loai === 'danh-muc'
        ? 'UR xin THÊM DANH MỤC MỚI — chốt bảng danh mục chuẩn cùng loại để sao chép cấu trúc, '
          + 'rồi khai `ddl.kind = "danh-muc"` (tên bảng bắt buộc tiền tố zc, 5 cột audit do bộ sinh tự thêm)'
        : 'UR xin dựng CHỨNG TỪ / HỌ BẢNG MỚI — chốt chứng từ chuẩn để sao chép, rồi khai '
          + '`ddl.kind = "chung-tu-moi"`'],
    };
  }

  const cots = rutCotDeXuat(u);
  const kieuTheoCot = biet.kieuTheoCot ?? {};
  const coSan = biet.coSanTheoCot ?? {};

  if (!cots.length) {
    const { ddl, chuaChot } = deXuatThemCot(u, { cot: '<TEN_COT>', nhan: 'trường mới' }, biet);
    return {
      loai,
      ddl: [ddl],
      chuaChot: ['chưa chốt được TÊN CỘT: nhãn trường trong UR không có trong từ điển '
        + '(tools/lib/ddl-suggest.mjs → NHAN_COT). Đọc UR, chốt tên cột thật rồi thay vào `<TEN_COT>`',
      ...chuaChot],
    };
  }

  const ddl = [];
  const chuaChot = [];
  for (const c of cots) {
    const k = kieuTheoCot[c.cot];
    const r = deXuatThemCot(u, c, {
      ...biet, kieu: k?.kieu, soBangCoKieu: k?.soBang, daCo: coSan[c.cot] === true,
    });
    ddl.push(r.ddl);
    chuaChot.push(...r.chuaChot);
  }
  return { loai, ddl, chuaChot: [...new Set(chuaChot)] };
}
