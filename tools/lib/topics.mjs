// topics.mjs — rút CHỦ ĐỀ nghiệp vụ của một UR từ nội dung, để đồ thị tìm được kinh nghiệm
// theo "việc này về cái gì", không chỉ theo "việc này đụng màn hình nào".
//
// VÌ SAO CẦN CHIỀU NÀY. Đồ thị đang có đúng hai đường tìm kinh nghiệm, cả hai đều đo HIỆN VẬT:
// `ExperienceFact` đếm số UR mỗi người đã làm trên từng `sysid`, và `lichSuMenu` đếm theo
// `menu_id`. Cả hai trả lời "ai đã đụng vào màn hình này", không trả lời "ai rành mảng này".
// Hai câu đó khác nhau, và đo được là chúng khác nhau:
//
//   - Mẫu in: đếm đầu mục `ma_daumuc = 02` toàn bộ phận FSD ra TRUONGHM 419 · HUYNQ 364 ·
//     CUONGTQ 314. Người thật sự mạnh mẫu in không phải người đứng đầu bảng đếm.
//   - Ngân sách: HOATV là người rành, nhưng đếm UR ở ANNHIEN cho DATNH 72 · NGUYENTDH 68 ·
//     HOATV 57, và đếm trên hiện vật `BudgetArticle` cho TRUONGHM/HUYNLV/NGUYENTDH 4 · HOATV 3.
//
// Đếm số UR đo KHỐI LƯỢNG, không đo NĂNG LỰC — không tinh chỉnh trọng số nào rút được hai cái
// tên đó ra khỏi những con số trên. Nhưng muốn kể cả PM khai tay "HOATV mạnh ngân sách" thì
// đồ thị vẫn phải có chỗ để khớp: một UR phải nói được nó thuộc chủ đề gì. Đó là việc của file
// này. Nó KHÔNG xếp hạng ai — nó chỉ gắn nhãn để chỗ khác tra được.
//
// GIỚI HẠN, nói trước: khớp bằng TỪ KHOÁ trên văn xuôi tự do. Nhãn ở đây là gợi ý, luôn kém
// chắc hơn `sysid` rút từ từ điển màn hình. Danh sách CỐ Ý đóng và ngắn — thêm chủ đề là việc
// có chủ đích, không phải cứ thấy từ lạ là đẻ nhãn mới.
//
// Không chạm DB, không ghi đĩa.

import { boDau } from './assignee.mjs';

const chuan = (v) => String(v ?? '').trim();

/**
 * Văn bản dùng để TÌM: bỏ dấu, thường hoá, gộp mọi khoảng trắng về một dấu cách.
 *
 * Gộp khoảng trắng là phần bắt buộc, không phải làm đẹp: `noi_dung` từ `nbphyc` đi qua bước
 * thay CR/LF/TAB bằng dấu cách (xem review-dataset.mjs) nên chi chít khoảng trắng liền nhau,
 * và cụm "ngân   sách" sẽ trượt mọi từ khoá viết một dấu cách nếu không gộp trước.
 */
export function chuanHoaTim(s) {
  return boDau(chuan(s)).replace(/\s+/g, ' ').trim();
}

/**
 * Chủ đề nghiệp vụ. `tu` khớp trên chuỗi ĐÃ qua chuanHoaTim() nên viết không dấu, thường.
 *
 * `daumuc` là mã đầu mục công việc (`nbctdaumuc.ma_daumuc`) khẳng định chủ đề mà KHÔNG cần đọc
 * văn xuôi — đây là phân loại do BA/PM ghi nhận thật, mạnh hơn hẳn từ khoá. Chỉ hai mã đủ rõ
 * để dùng kiểu này: `02` (mẫu in) và `06` (thêm danh mục).
 */
export const CHU_DE = [
  { ma: 'mau-in', ten: 'Mẫu in / biểu mẫu', daumuc: ['02'],
    tu: ['mau in', 'bieu mau in', 'mau bieu in', 'thiet ke mau', 'form in', 'in phieu', 'mau phieu'] },
  { ma: 'ngan-sach', ten: 'Ngân sách / dự toán',
    tu: ['ngan sach', 'du toan', 'chi tieu ngan sach', 'vuot ngan sach'] },
  { ma: 'phan-quyen', ten: 'Phân quyền / quyền truy cập',
    tu: ['phan quyen', 'quyen truy cap', 'nhom user', 'nguoi su dung', 'chi thay duoc', 'chi xem duoc'] },
  { ma: 'hoa-don-dien-tu', ten: 'Hoá đơn điện tử',
    tu: ['hoa don dien tu', 'hddt', 'phat hanh hoa don', 'ky so', 'tra cuu hoa don'] },
  { ma: 'tai-san-ccdc', ten: 'Tài sản cố định / công cụ dụng cụ',
    tu: ['tai san co dinh', 'tscd', 'khau hao', 'cong cu dung cu', 'ccdc', 'phan bo khau hao'] },
  { ma: 'vu-viec-phi', ten: 'Vụ việc / mã phí / khoản mục',
    tu: ['vu viec', 'ma vv', 'ma phi', 'khoan muc phi', 'quan tri phi'] },
  { ma: 'ke-thua', ten: 'Kế thừa / lấy dữ liệu từ chứng từ khác',
    tu: ['ke thua du lieu', 'ke thua', 'lay du lieu tu'] },
  { ma: 'import', ten: 'Import / nhập từ file',
    tu: ['import', 'nhap tu excel', 'nhap lieu tu file', 'upload file', 'tai len'] },
  { ma: 'duyet', ten: 'Duyệt / luồng duyệt',
    tu: ['luong duyet', 'phe duyet', 'trinh duyet', 'duyet phieu', 'duyet de nghi'] },
  { ma: 'thue', ten: 'Thuế',
    tu: ['thue gtgt', 'thue suat', 'to khai thue', 'thue tndn', 'thue nha thau'] },
  { ma: 'ty-gia', ten: 'Tỷ giá', tu: ['ty gia'] },
  { ma: 'phap-ly', ten: 'Thay đổi theo văn bản pháp lý',
    tu: ['nghi dinh', 'thong tu', 'nd70', 'nd 70', 'thong tu 89', 'so dinh danh'] },
  { ma: 'danh-muc', ten: 'Danh mục', daumuc: ['06'], tu: [] },
];

/**
 * Chủ đề của MỘT ur.
 *
 * Hai nguồn, gộp lại: mã đầu mục (chắc) và từ khoá trong `noi_dung` (gợi ý). Không có nguồn nào
 * khớp thì trả mảng rỗng — UR không thuộc chủ đề nào đã khai là chuyện bình thường, KHÔNG được
 * gán bừa một nhãn "khác" vì nhãn đó rồi sẽ khớp với mọi thứ.
 *
 * CỐ Ý không khớp chữ "danh muc" tự do: câu tả trường nào cũng có ("lấy từ danh mục vụ việc",
 * "lấy từ danh mục bộ phận") nên nhãn đó sẽ dính vào gần như mọi UR và mất sạch giá trị phân
 * biệt — đúng cái bẫy đã gặp ở `menu_id = 01.00.00` và hiện vật `Post01`. `danh-muc` chỉ đến từ
 * đầu mục `06`.
 *
 * @param {Object} u - cần `noi_dung`; `maDaumuc` (mảng mã) tuỳ chọn
 * @returns {string[]} mã chủ đề, đã sắp xếp, không trùng
 */
export function rutChuDe(u) {
  const text = chuanHoaTim(u?.noi_dung);
  const codes = new Set((u?.maDaumuc ?? []).map((m) => chuan(m)).filter(Boolean));
  const ra = new Set();

  for (const cd of CHU_DE) {
    if ((cd.daumuc ?? []).some((m) => codes.has(m))) { ra.add(cd.ma); continue; }
    if (text && cd.tu.some((t) => text.includes(t))) ra.add(cd.ma);
  }
  return [...ra].sort();
}

/**
 * Nhãn tiếng Việt của một mã chủ đề — để báo cáo khỏi in ra mã trần.
 * Mã lạ (dữ liệu cũ, hoặc PM gõ tay) trả về chính nó, không ném lỗi.
 */
export function tenChuDe(ma) {
  return CHU_DE.find((c) => c.ma === chuan(ma))?.ten ?? chuan(ma);
}
