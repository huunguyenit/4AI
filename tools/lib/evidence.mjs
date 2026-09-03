// evidence.mjs — đối chiếu "trang" căn cứ khai trên UR với tệp đính kèm CÓ THẬT.
//
// `nbphyc.trang_tlks` là ô văn bản tự do, và nó KHÔNG chỉ chứa số trang: người lên UR gõ vào
// đó TÊN LOẠI tài liệu làm căn cứ — `TLKS`, `BBLV`, `XNKH`, `PL`, `Mail`… (đo trên dữ liệu
// thật: 963 dòng `BBLV`, 998 dòng `XNKH`, 963 dòng `PL`). Cờ `tlks_yn = 1` chỉ nói "có khai
// căn cứ", KHÔNG nói căn cứ đó tồn tại.
//
// Vì sao phải đối chiếu: một UR ghi `tlks_yn = 1 · trang_tlks = BBLV` mà kho đính kèm của dự
// án không có biên bản làm việc nào thì căn cứ đó chỉ tồn tại trong trí nhớ người gõ. Ca thật
// đã gặp: một dự án có đúng một đính kèm cấp dự án — một file TLKS — trong khi năm UR ở DD
// đều khai căn cứ là BBLV. Luật "không có tài liệu nào" KHÔNG bắt được ca này; phải đối chiếu
// ĐÚNG LOẠI đã khai.
//
// Ranh giới: file này KHÔNG chạm DB và KHÔNG ghi đĩa. Vào là chuỗi đã lấy sẵn, ra là kết luận.
// Không phân loại được thì trả `null` và im lặng — không có loại nào tên là "đoán".

import { boDau } from './assignee.mjs';

const chuan = (v) => String(v ?? '').trim();

/**
 * `trang_tlks` nói thẳng ra là CHƯA kiểm — đây là giá trị mặc định của một lần import dữ liệu
 * cũ (28.335 dòng, nhiều gấp ba mọi giá trị khác cộng lại). Nó chứa cụm "tài liệu khảo sát"
 * nên sẽ khớp luật TLKS nếu không chặn trước, và khi đó mọi UR tồn từ đời trước bị đề xuất TA
 * cùng một lúc.
 */
const CHUA_KIEM = /chua kiem tra|chua co tai lieu|chua ro/;

/**
 * Neo một mã viết tắt vào ranh giới "chữ-số".
 *
 * KHÔNG dùng `\b` hay `\W` được: sau `boDau()` chuỗi chỉ còn a-z0-9 và dấu phân cách, mà dấu
 * phân cách hay gặp nhất trong tên file lại là gạch dưới — `_` là WORD character, nên `\btlks`
 * trượt sạch `HTF_TLKS Ketoan_ver1.0_final.docx`, đúng cái tên file thật đã đo được. Ranh giới
 * đúng ở đây là "không phải chữ và không phải số".
 */
const neo = (alt) => new RegExp(`(?:^|[^a-z0-9])(?:${alt})(?![a-z0-9])`);

/**
 * Loại tài liệu làm căn cứ.
 *
 * `trang` khớp trên `trang_tlks` (đã bỏ dấu, lowercase); `tep` khớp trên `file_name` của
 * `sysfileinfo` (cũng đã bỏ dấu). Hai biểu thức CỐ Ý khác nhau: ô `trang_tlks` được gõ tắt và
 * gần như luôn là mã viết hoa, còn tên file là văn xuôi người đặt lúc upload
 * ("HTF_TLKS Ketoan_ver1.0_final.docx", "BB lam viec 12.08.docx") nên phải lỏng hơn.
 *
 * Danh sách này CỐ TÌNH ngắn. Mọi giá trị không khớp cái nào — "Hỗ trợ", "Lỗi", "Nâng cấp",
 * "API", "Update thông tư" — trả về `null`: đó không phải tên một tài liệu, nên không có gì
 * để đi tìm và không được phép kết luận là thiếu.
 */
export const LOAI_CAN_CU = [
  { ma: 'TLKS', nhan: 'tài liệu khảo sát',
    trang: neo('tlks|tai lieu khao sat'),
    tep: neo('tlks|tai ?lieu ?khao ?sat|khao ?sat') },
  { ma: 'BBLV', nhan: 'biên bản làm việc',
    trang: neo('bblv|bien ban lam viec'),
    tep: neo('bblv|(?:bien ?ban|bb)[ _-]*lam ?viec') },
  { ma: 'BBTN', nhan: 'biên bản thống nhất phạm vi',
    trang: neo('bbtn|bien ban thong nhat'),
    tep: neo('bbtn|(?:bien ?ban|bb)[ _-]*thong ?nhat') },
  { ma: 'BBNT', nhan: 'biên bản nghiệm thu',
    trang: neo('bbnt|bien ban nghiem thu'),
    tep: neo('bbnt|(?:bien ?ban|bb)[ _-]*nghiem ?thu') },
  { ma: 'PL', nhan: 'phụ lục hợp đồng',
    trang: /^(?:pl|plhd|pl hd)$|phu luc/,
    tep: neo('pl|plhd|phu ?luc') },
  { ma: 'XN', nhan: 'xác nhận của khách hàng',
    trang: /^(?:xn|xnkh|xn khac)$|xac nhan/,
    tep: neo('xn|xnkh|xac ?nhan') },
  { ma: 'MAIL', nhan: 'email đính kèm',
    trang: /^(?:mail|email)$|mail dinh kem|email xac nhan/,
    tep: /(?:^|[^a-z0-9])(?:mail|email)(?![a-z0-9])|\.(?:msg|eml)$/ },
];

/**
 * `trang_tlks` → loại tài liệu phải đi tìm.
 *
 * Ba đường ra:
 *   - `{loai, nguon: 'ten-loai'}` — ô ghi thẳng tên loại ("BBLV", "Phụ lục").
 *   - `{loai: TLKS, nguon: 'so-trang'}` — ô chỉ có một con số. Trường tên là `trang_tlks`:
 *     "trang 12" nghĩa là trang 12 CỦA TLKS, nên căn cứ phải tìm chính là TLKS.
 *   - `null` — không phân loại được, hoặc ô tự nhận là chưa kiểm. Không đi tìm, không kết luận.
 *
 * @returns {{loai: object, nguon: 'ten-loai'|'so-trang'}|null}
 */
export function phanLoaiTrang(trangTlks) {
  const s = boDau(chuan(trangTlks));
  if (!s || CHUA_KIEM.test(s)) return null;
  for (const loai of LOAI_CAN_CU) {
    if (loai.trang.test(s)) return { loai, nguon: 'ten-loai' };
  }
  if (/^\d{1,4}$/.test(s)) return { loai: LOAI_CAN_CU[0], nguon: 'so-trang' };
  return null;
}

/**
 * Tệp đầu tiên trong danh sách chứng minh được loại này.
 * @param {object} loai một phần tử của LOAI_CAN_CU
 * @param {Array<{file_name?: string, noiTim?: string}>} teps
 */
export function timTepChungMinh(loai, teps = []) {
  for (const t of teps) {
    const ten = chuan(t?.file_name);
    if (ten && loai.tep.test(boDau(ten))) return { file_name: ten, noiTim: t.noiTim ?? 'nbdmda' };
  }
  return null;
}

/**
 * Đối chiếu căn cứ của MỘT ur.
 *
 * Tìm ở CẢ hai chỗ vì cả hai đều là căn cứ hợp lệ: `nbdmda` giữ tài liệu cấp dự án (TLKS, phụ
 * lục hợp đồng — dùng chung cho mọi UR), `nbphyc` giữ đính kèm riêng của chính UR đó (biên bản
 * làm việc chốt riêng một yêu cầu). Chỉ soi một chỗ là báo thiếu oan.
 *
 * @param {object} u UR — cần `tlks_yn`, `trang_tlks`
 * @param {{tepDuAn?: Array, tepUr?: Array}} kho danh sách `{file_name}` đã lấy từ sysfileinfo
 * @returns {{loai: string, nhan: string, nguon: string, coTep: boolean,
 *            tenTep?: string, noiTim?: string}|null} null = không phân loại được, bỏ qua
 */
export function doiChieuCanCu(u, kho = {}) {
  if (!u?.tlks_yn) return null; // khai "ngoài TLKS" — đã có mục riêng lo, xem report.mjs
  const pl = phanLoaiTrang(u.trang_tlks);
  if (!pl) return null;

  const teps = [
    ...(kho.tepUr ?? []).map((t) => ({ ...t, noiTim: 'nbphyc' })),
    ...(kho.tepDuAn ?? []).map((t) => ({ ...t, noiTim: 'nbdmda' })),
  ];
  const thay = timTepChungMinh(pl.loai, teps);
  return {
    loai: pl.loai.ma,
    nhan: pl.loai.nhan,
    nguon: pl.nguon,
    coTep: Boolean(thay),
    ...(thay ? { tenTep: thay.file_name, noiTim: thay.noiTim } : {}),
  };
}

/**
 * Đề xuất TA khi ba vế cùng đúng — luật do PM đặt, chép nguyên ở đây để đọc code là thấy luật:
 *
 *   1. UR còn ở `YC` (chưa qua cổng duyệt của PM),
 *   2. căn cứ khai trên `trang_tlks` KHÔNG có tệp nào chứng minh ở `nbdmda` lẫn `nbphyc`,
 *   3. giai đoạn của UR chưa tick `xac_nhan_da_hen_yn`.
 *
 * Thiếu vế nào cũng không đề xuất. Vế 3 là vế quan trọng nhất về mặt an toàn: giai đoạn đã
 * chốt hẹn với khách nghĩa là hai bên đã thống nhất mốc — lúc đó tài liệu thiếu là việc phải
 * đi bổ sung, không phải lý do đẩy yêu cầu về TA.
 *
 * @returns {{trang_thai: 'TA', lyDo: string}|null}
 */
export function deXuatTuCanCu(u, canCuTep, chotDaHen) {
  if (chuan(u?.trang_thai) !== 'YC') return null;
  if (!canCuTep || canCuTep.coTep) return null;
  if (chotDaHen) return null;

  const goc = canCuTep.nguon === 'so-trang'
    ? `trang_tlks ghi số trang "${chuan(u.trang_tlks)}" — tức căn cứ là ${canCuTep.nhan}`
    : `trang_tlks khai căn cứ là ${canCuTep.nhan} (${canCuTep.loai})`;
  return {
    trang_thai: 'TA',
    lyDo: `${goc}, nhưng không có đính kèm nào mang tên ${canCuTep.loai} ở nbdmda (cấp dự án) `
      + 'lẫn nbphyc (cấp UR); giai đoạn cũng chưa tick chốt đã hẹn.',
  };
}
