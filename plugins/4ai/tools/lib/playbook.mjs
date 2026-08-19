// playbook.mjs — kho hướng dẫn lập trình thực chiến: ghi vào, và tra ra cho dự án sau.
//
// VÌ SAO KHÔNG DÙNG ExperienceFact CHO VIỆC NÀY. Hai thứ trông giống nhau nhưng trả lời hai
// câu khác hẳn:
//
//   ExperienceFact  — máy rút tự động từ `noi_dung` UR đã xong. Trả lời "AI đã đụng vào hiện
//                     vật nào, bao nhiêu lần". Dùng để xếp hạng ứng viên phân công. Không có
//                     một chữ nào về CÁCH làm, vì `noi_dung` là lời khách yêu cầu chứ không
//                     phải nhật ký sửa code.
//   Playbook        — người viết. Trả lời "màn hình này sửa kiểu gì cho đúng, chỗ nào dễ sập".
//                     Không có cách nào suy ra từ dữ liệu QLDA; phải có người gõ vào.
//
// AI GÕ. Kinh nghiệm đến từ LT (họ là người sửa), PM là người ghi lại — nên node giữ RIÊNG
// `nguonLt` (kinh nghiệm của ai) và `nhapBoi` (ai gõ). Gộp hai mã đó làm một là mất dấu vết
// người thật sự biết việc, và sau nửa năm không còn ai để hỏi lại.
//
// TRA RA BẰNG GÌ. Bằng `sysid` / `menu_id` / `bang` / `tags` — KHÔNG bằng `ma_da`. Kinh nghiệm
// khoá theo dự án là kinh nghiệm chết: dự án mới chưa có dòng nào, mà mục đích của cả kho này
// là để dự án sau dùng lại của dự án trước. `ma_da` chỉ còn là XUẤT XỨ, hiện ra để người đọc
// biết cách làm đó đã chạy thật ở đâu.
//
// Ranh giới: file này KHÔNG ghi đĩa và KHÔNG chạy SQL. Nó trả về mô tả node/cạnh và câu SQL;
// đường đẩy chung của đồ thị (`emitSql` → `runGraphScript`) mới ghi. Cùng kỷ luật với
// recommendation-log.mjs và graph-sync.mjs.

import { boDau } from './assignee.mjs';

const chuan = (v) => String(v ?? '').trim();
const lit = (s) => String(s).replace(/'/g, "''");

/**
 * Tiêu đề → slug ổn định dùng làm nửa sau của khoá node.
 *
 * Ổn định là yêu cầu chính, không phải đẹp: cùng một tiêu đề gõ lại hai lần phải ra cùng một
 * khoá, để lần ghi thứ hai SỬA dòng cũ chứ không đẻ dòng trùng. Cắt 60 ký tự cho khoá không
 * vượt NVARCHAR(400) khi ghép với scope và stt_rec.
 */
export function slugTieuDe(tieuDe) {
  return boDau(tieuDe)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'khong-tieu-de';
}

/** Trường bắt buộc — thiếu cái nào thì entry vô dụng, không phải "để trống cho gọn". */
const BAT_BUOC = [
  ['maDa', 'mã dự án (xuất xứ của kinh nghiệm)'],
  ['tieuDe', 'tiêu đề ngắn — dự án sau sẽ đọc dòng này trước'],
  ['cachLam', 'cách làm: các bước thật, đủ để người khác lặp lại'],
];

/**
 * Kiểm một entry trước khi cho vào đồ thị.
 *
 * Chặn ở đây chứ không chặn ở CLI: cả CLI lẫn tool MCP đều đi qua hàm này, và luật hợp lệ chỉ
 * được phép khai một chỗ. Trả về danh sách lỗi thay vì ném, để caller gom báo một lượt.
 *
 * @returns {string[]} rỗng nghĩa là hợp lệ
 */
export function kiemEntry(entry = {}) {
  const loi = [];
  for (const [khoa, mo] of BAT_BUOC) {
    if (!chuan(entry[khoa])) loi.push(`thiếu \`${khoa}\` — ${mo}`);
  }

  // Không có hiện vật nào thì dự án sau KHÔNG có đường nào tìm ra dòng này. Nó sẽ nằm trong DB
  // vĩnh viễn mà không lần tra cứu nào chạm tới — tức là công gõ vào bị vứt đi. Thà báo lỗi.
  //
  // `menuId` gộp cấp phân hệ KHÔNG tính là neo: `ghepVaoUr` cố ý bỏ qua nó (xem laMenuGop), nên
  // nhận nó ở đây là hứa một đường tra cứu không tồn tại. Luật phải giống hệt nhau ở hai chỗ.
  const menuNeoDuoc = chuan(entry.menuId) && !laMenuGop(entry.menuId);
  const coNeo = menuNeoDuoc || ['sysid', 'bang'].some((k) => chuan(entry[k]))
    || (Array.isArray(entry.tags) && entry.tags.some((t) => chuan(t)));
  if (!coNeo) {
    loi.push('phải có ít nhất một trong `sysid` / `menuId` / `bang` / `tags` — '
      + 'đó là đường DUY NHẤT để dự án sau tìm ra hướng dẫn này; thiếu hết thì nó không bao giờ được đọc lại');
  }
  if (chuan(entry.menuId) && !menuNeoDuoc) {
    loi.push(`\`menuId\` = "${chuan(entry.menuId)}" là mã gộp cấp phân hệ, không định vị một màn hình `
      + '— nó khớp với gần như mọi UR nên bị bỏ qua khi ghép. Dùng menu_id có mảnh cuối khác 00, '
      + 'hoặc neo bằng `sysid` của chính màn hình');
  }

  const dtc = entry.doTinCay;
  if (dtc !== undefined && dtc !== null && dtc !== '') {
    const n = Number(dtc);
    if (!Number.isFinite(n) || n < 0 || n > 1) loi.push('`doTinCay` phải là số trong khoảng 0..1');
  }
  return loi;
}

/**
 * Entry đã kiểm → node + cạnh cho đồ thị. KHÔNG ghi gì.
 *
 * @param {object} entry {maDa, sttRec?, tieuDe, boiCanh?, cachLam, canhBao?, menuId?, sysid?,
 *                        bang?, tags?, nguonLt?, doTinCay?}
 * @param {{boi: string, ngay: string}} args  `boi` = người gõ, `ngay` = YYYY-MM-DD
 * @returns {{nodes: Array, edges: Array, scopes: string[], id: string}}
 */
export function entryToGraph(entry = {}, args = {}) {
  const maDa = chuan(entry.maDa);
  const sttRec = chuan(entry.sttRec);
  const id = `${sttRec || 'chung'}|${slugTieuDe(entry.tieuDe)}`;
  const tags = (Array.isArray(entry.tags) ? entry.tags : String(entry.tags ?? '').split(','))
    .map(chuan).filter(Boolean);

  // `nhapBoi`/`ngayNhap` = người và lúc ghi LẦN ĐẦU, nên khi sửa thì entry mang giá trị cũ sang
  // và chúng thắng. Ai vừa sửa, lúc nào thì đã nằm ở cột audit `capNhatBoi`/`capNhatLuc` —
  // ghi đè `nhapBoi` mỗi lần sửa là xoá mất dấu vết người đầu tiên bỏ công viết ra nó.
  const nguoiChay = chuan(args.boi) || undefined;
  const nhapBoi = chuan(entry.nhapBoi) || nguoiChay;

  const node = {
    _: 'node', kind: 'Playbook', scope: maDa, capNhatBoi: nguoiChay,
    id,
    ma_da: maDa,
    stt_rec: sttRec || undefined,
    tieuDe: chuan(entry.tieuDe),
    boiCanh: chuan(entry.boiCanh) || undefined,
    cachLam: chuan(entry.cachLam),
    canhBao: chuan(entry.canhBao) || undefined,
    menu_id: chuan(entry.menuId) || undefined,
    sysid: chuan(entry.sysid) || undefined,
    bang: chuan(entry.bang) || undefined,
    tags: tags.length ? tags : undefined,
    nguonLt: chuan(entry.nguonLt) || undefined,
    nhapBoi,
    ngayNhap: chuan(entry.ngayNhap).slice(0, 10) || chuan(args.ngay) || undefined,
    // Người gõ có chủ đích, không phải regex đoán — mặc định tin hoàn toàn. Xem doTinCayNote
    // trong graph-schema.json.
    doTinCay: entry.doTinCay === undefined || entry.doTinCay === '' ? 1 : Number(entry.doTinCay),
    duyetBoiPm: 1,
  };

  const edges = [];
  // Chỉ nối về Request khi entry thật sự sinh ra từ một UR. Bịa một stt_rec để "cho có cạnh"
  // sẽ tạo node Request rỗng trong đồ thị — tệ hơn là không có cạnh.
  if (sttRec) {
    edges.push({
      _: 'edge', type: 'HAS_PLAYBOOK',
      // `Request` KHÔNG phải kind scoped (khoá là `stt_rec` trần) còn `Playbook` thì có — nên
      // hai đầu cạnh viết khác nhau, và phải theo đúng `scoped` khai trong graph-schema.json.
      // Ghép sẵn `<ma_da>|` vào đầu Request thì phép JOIN lúc nạp không khớp dòng nào và cạnh
      // lặng lẽ KHÔNG được tạo — script vẫn báo chạy xong. Cùng cách viết với graph-sync.mjs
      // và recommendation-log.mjs.
      from: `Request:${sttRec}`, to: `Playbook:${maDa}|${id}`,
      nguon: 'pm-nhap',
    });
  }
  // Cạnh PLAYBOOK_ON về Controller/Menu/Table CỐ Ý không dựng ở đây: node đích thuộc tầng cấu
  // trúc, do `graph build` nạp riêng, và ở thời điểm PM gõ hướng dẫn thì chưa chắc đã có mặt.
  // Cạnh trỏ vào chỗ trống làm hỏng validate cả lần đẩy. Tra cứu đi bằng cột `sysid`/`menu_id`
  // trên chính node — xem timPlaybook().

  return { nodes: [node], edges, scopes: maDa ? [maDa] : [], id };
}

/**
 * Ký tự thay cho xuống dòng trên đường truyền SQL → JS.
 *
 * VÌ SAO PHẢI CÓ. Đường đọc đi qua `sqlcmd` ở chế độ TSV: một dòng kết quả = một dòng văn bản.
 * Mà `cachLam` thì BẢN CHẤT là nhiều dòng — nó là các bước làm, "B1:…\nB2:…\nB3:…". Không xử
 * lý thì sqlcmd nhả ra 4 dòng và phía JS đọc thành 4 bản ghi rác: bản ghi đầu cụt ở "B1", ba
 * bản ghi sau là mảng chuỗi không có cột nào. Đã cắn thật ngay ở entry đầu tiên ghi lên DB.
 *
 * Cùng một cái bẫy `experience-build.mjs` đã gặp và ghi lại (đo được: tỉ lệ rút được hiện vật
 * tụt từ 61,5% xuống 25,6% khi quên bước này). Khác một chỗ: ở đó nội dung chỉ cần ĐỌC nên
 * thay bằng khoảng trắng là xong; ở đây xuống dòng là THÔNG TIN — mất nó thì ba bước làm dính
 * thành một câu — nên phải mã hoá rồi khôi phục, không được xoá.
 */
const XUONG_DONG = '␛'; // ␛ — ký hiệu escape, không xuất hiện trong văn bản người gõ

/** Cột văn xuôi → một dòng an toàn cho TSV. CR bỏ, LF thành sentinel, TAB thành khoảng trắng. */
const motDong = (cot) =>
  `REPLACE(REPLACE(REPLACE(ISNULL(${cot},''),CHAR(13),''),CHAR(10),N'${XUONG_DONG}'),CHAR(9),' ')`;

/**
 * Bề rộng một mảnh. Phải DƯỚI 256 — xem chú thích chia mảnh ngay dưới.
 */
const RONG_MANH = 200;

/**
 * Số mảnh cho từng cột văn xuôi. Tích với RONG_MANH là trần ký tự đọc về được.
 *
 * VÌ SAO PHẢI CHIA MẢNH. `sqlcmd` chạy với `-W` (bắt buộc, đó là thứ làm parseTsv chạy được),
 * mà `-W` loại trừ nhau với `-y`, nên mọi cột kiểu độ dài thay đổi bị cắt ở 256 ký tự — ÂM
 * THẦM, không cờ, không cảnh báo (xem execSql trong mcp/fbo/lib/sql.mjs, đo được trên
 * frpost.noi_dung: 11.252 ký tự thật chỉ nhận về 4.901). `cachLam` bản chất là dài: nó là các
 * bước làm. Cắt nó ở 256 nghĩa là hướng dẫn đọc về mất đúng phần cuối — chỗ hay nằm cảnh báo.
 *
 * Cách vòng: SUBSTRING từng khúc rồi CAST về NVARCHAR(200) — kiểu khai báo 200 < 256 nên
 * sqlcmd không cắt — và ghép lại ở JS. Kèm `LEN` để phát hiện khi nội dung vượt trần: dài quá
 * thì NÓI RA, không im lặng trả bản cụt.
 */
const SO_MANH = { tieuDe: 2, boiCanh: 5, cachLam: 15, canhBao: 5, tags: 5 };

/** Cột → danh sách mảnh + cột độ dài, dạng `SELECT` item. */
function chiaManh(cot) {
  const bt = motDong(cot);
  const manh = Array.from({ length: SO_MANH[cot] }, (_, i) =>
    `CAST(SUBSTRING(${bt}, ${i * RONG_MANH + 1}, ${RONG_MANH}) AS NVARCHAR(${RONG_MANH})) AS ${cot}_${i}`);
  return [...manh, `LEN(${bt}) AS ${cot}_len`].join(', ');
}

/** Mảnh đọc về → chuỗi gốc, kèm dấu hiệu bị cắt nếu nội dung vượt trần. */
function ghepManh(row, cot) {
  let s = '';
  for (let i = 0; i < SO_MANH[cot]; i++) s += String(row[`${cot}_${i}`] ?? '');
  const that = Number(row[`${cot}_len`] ?? s.length);
  if (Number.isFinite(that) && that > s.length) {
    s += `\n[… bị cắt: nội dung dài ${that} ký tự, đọc về ${s.length}. `
      + `Tăng SO_MANH.${cot} trong tools/lib/playbook.mjs để lấy đủ.]`;
  }
  return s.split(XUONG_DONG).join('\n');
}

/**
 * Câu SQL đọc kho hướng dẫn.
 *
 * KHÔNG lọc theo scope — đây là điểm khác cốt lõi so với sqlDocLog() của recommendation-log:
 * log gợi ý chỉ có nghĩa trong chính dự án của nó, còn hướng dẫn thì cả kho mới là giá trị.
 * Lọc theo `ma_da` ở đây là tự tay chặn đúng công dụng của tính năng này.
 *
 * @param {{sysids?: string[], menuIds?: string[], bangs?: string[], tuKhoa?: string, maxRows?: number}} loc
 */
export function sqlDocPlaybook(loc = {}) {
  const dsIn = (vals) => vals.map((v) => `'${lit(chuan(v))}'`).join(', ');
  const dk = [];
  const hoac = [];
  // `sttRecs`: hướng dẫn ghi ĐÍCH DANH một UR phải lấy về được kể cả khi nó không neo vào hiện
  // vật nào mà UR đang xét cũng mang. Thiếu nhánh này thì một hướng dẫn chỉ neo bằng `tags` sẽ
  // không bao giờ tới được chính cái UR nó được viết cho.
  if (loc.sttRecs?.length) hoac.push(`RTRIM(stt_rec) IN (${dsIn(loc.sttRecs)})`);
  if (loc.sysids?.length) hoac.push(`RTRIM(sysid) IN (${dsIn(loc.sysids)})`);
  if (loc.menuIds?.length) hoac.push(`RTRIM(menu_id) IN (${dsIn(loc.menuIds)})`);
  if (loc.bangs?.length) hoac.push(`RTRIM(bang) IN (${dsIn(loc.bangs)})`);
  if (hoac.length) dk.push(`(${hoac.join(' OR ')})`);
  if (chuan(loc.tuKhoa)) {
    const k = lit(chuan(loc.tuKhoa));
    dk.push(`(tieuDe LIKE N'%${k}%' OR cachLam LIKE N'%${k}%' OR boiCanh LIKE N'%${k}%' OR tags LIKE N'%${k}%')`);
  }
  const top = Number.isFinite(Number(loc.maxRows)) ? Math.max(1, Number(loc.maxRows)) : 500;
  // Khoá của node LÀ cột `id` (nodeKinds.Playbook.key). Không có cột `key` nào trong bảng —
  // `sql.keyColumn` trong schema nói về view đồ thị, không phải bảng node.
  return `
SELECT TOP ${top} RTRIM(id) AS id, RTRIM(ma_da) AS ma_da,
       RTRIM(stt_rec) AS stt_rec,
       ${chiaManh('tieuDe')},
       ${chiaManh('boiCanh')},
       ${chiaManh('cachLam')},
       ${chiaManh('canhBao')},
       RTRIM(menu_id) AS menu_id, RTRIM(sysid) AS sysid, RTRIM(bang) AS bang,
       ${chiaManh('tags')},
       RTRIM(nguonLt) AS nguonLt, RTRIM(nhapBoi) AS nhapBoi, ngayNhap, doTinCay
FROM dbo.node_Playbook
${dk.length ? `WHERE ${dk.join(' AND ')}` : ''}
ORDER BY ngayNhap DESC`.trim();
}

/**
 * Đọc kho hướng dẫn từ đồ thị.
 *
 * HAI KIỂU GỌI, và mặc định là kiểu nuốt lỗi:
 *
 *   `neLoi` (mặc định) — đường BÁO CÁO. Hỏng thì trả rỗng, cùng lý do với docLog(): đây là một
 *     mục phụ trợ, mất nó không được phép làm sập bảng hạn mà PM cần sáng nay. Bảng chưa tồn
 *     tại (chưa ai gõ hướng dẫn nào) cũng rơi vào nhánh này — trạng thái bình thường lúc mới bật.
 *   `neLoi: false` — đường TRA CỨU do người gõ (`playbook search`, tool MCP). Ở đây im lặng là
 *     tai hại: một câu SQL sai cột trông y hệt một kho rỗng, và người dùng sẽ đi gõ lại hướng
 *     dẫn tưởng lần trước chưa ghi được. Đã cắn thật — bản đầu select cột `key` không tồn tại,
 *     `playbook add` báo nạp xong mà `playbook search` vẫn trả "kho rỗng".
 *
 * @param {{runGraphSql: Function}} deps
 */
export function docPlaybook(deps, loc = {}) {
  const neLoi = loc.neLoi !== false;
  if (typeof deps?.runGraphSql !== 'function') {
    if (neLoi) return [];
    throw new Error('Không có đường chạy SQL đồ thị — kiểm tra graphConnectionString bằng `4ai doctor`.');
  }
  try {
    const res = deps.runGraphSql({ sql: sqlDocPlaybook(loc), maxRows: loc.maxRows ?? 500 });
    return (res.rows ?? []).filter((r) => r && typeof r === 'object' && !Array.isArray(r)).map((r) => {
      // Bỏ cột mảnh khỏi kết quả trả ra — chúng là chi tiết đường truyền, không phải dữ liệu.
      const sach = {};
      for (const [k, v] of Object.entries(r)) {
        if (!/_(\d+|len)$/.test(k)) sach[k] = v;
      }
      const tagsThô = ghepManh(r, 'tags');
      return {
        ...sach,
        tieuDe: ghepManh(r, 'tieuDe'),
        boiCanh: ghepManh(r, 'boiCanh'),
        cachLam: ghepManh(r, 'cachLam'),
        canhBao: ghepManh(r, 'canhBao'),
        // `tags` lưu chuỗi JSON trong NVARCHAR(MAX) — SQL Server graph không có kiểu mảng.
        tags: (() => { try { return JSON.parse(tagsThô || '[]'); } catch { return []; } })(),
      };
    });
  } catch (e) {
    if (neLoi) return [];
    // Bảng chưa tồn tại là "kho rỗng" thật, không phải hỏng — phân biệt để người dùng không đi
    // dò một lỗi không có.
    if (/Invalid object name/i.test(e.message)) return [];
    throw e;
  }
}

// ---------------------------------------------------------------- sửa một hướng dẫn đã có
//
// Vì sao `edit` phải tồn tại tách khỏi `add`: MERGE ghi đè TOÀN BỘ cột từ lô. Gõ lại `add` chỉ
// để thêm `--from` mà quên `--warn` thì `canhBao` bị xoá trắng, im lặng — `kiemEntry` chỉ chặn
// thiếu tiêu đề/cách làm/neo, không biết cái gì "đáng lẽ phải còn đó".

/**
 * Tra MỘT hướng dẫn theo dự án + slug tiêu đề.
 *
 * Cố ý KHÔNG gộp vào `sqlDocPlaybook`: hàm kia là đường TRA CỨU ĐỂ DÙNG LẠI và luật của nó là
 * không bao giờ lọc theo `ma_da`. Thêm tham số dự án vào đó là mở sẵn cửa cho người sau lỡ tay
 * lọc cả đường tra cứu rồi tự hỏi sao kho lúc nào cũng rỗng. Đây là đường ĐỊNH VỊ MỘT DÒNG để
 * sửa — một thao tác khác hẳn, và nó có quyền biết dự án.
 */
export function sqlTimTheoKhoa(maDa, slug) {
  const cotVanXuoi = ['tieuDe', 'boiCanh', 'cachLam', 'canhBao', 'tags'].map(chiaManh).join(',\n       ');
  return `
SELECT RTRIM(id) AS id, RTRIM(ma_da) AS ma_da, RTRIM(stt_rec) AS stt_rec,
       ${cotVanXuoi},
       RTRIM(menu_id) AS menu_id, RTRIM(sysid) AS sysid, RTRIM(bang) AS bang,
       RTRIM(nguonLt) AS nguonLt, RTRIM(nhapBoi) AS nhapBoi,
       CONVERT(NVARCHAR(10), ngayNhap, 23) AS ngayNhap, doTinCay
FROM dbo.node_Playbook
WHERE RTRIM(scope) = '${lit(chuan(maDa))}' AND RTRIM(id) LIKE '%|${lit(chuan(slug))}'`.trim();
}

/** Đọc dòng cần sửa. Ném lỗi thay vì nuốt — người gõ `edit` phải biết vì sao không thấy. */
export function docTheoKhoa(deps, maDa, slug) {
  if (typeof deps?.runGraphSql !== 'function') {
    throw new Error('Không có đường chạy SQL đồ thị — kiểm tra bằng `4ai doctor`.');
  }
  let res;
  try {
    res = deps.runGraphSql({ sql: sqlTimTheoKhoa(maDa, slug), maxRows: 50 });
  } catch (e) {
    if (/Invalid object name/i.test(e.message)) return [];
    throw e;
  }
  return (res.rows ?? [])
    .filter((r) => r && typeof r === 'object' && !Array.isArray(r))
    .map((r) => {
      const sach = {};
      for (const [k, v] of Object.entries(r)) if (!/_(\d+|len)$/.test(k)) sach[k] = v;
      const tagsThô = ghepManh(r, 'tags');
      return {
        ...sach,
        tieuDe: ghepManh(r, 'tieuDe'),
        boiCanh: ghepManh(r, 'boiCanh'),
        cachLam: ghepManh(r, 'cachLam'),
        canhBao: ghepManh(r, 'canhBao'),
        tags: (() => { try { return JSON.parse(tagsThô || '[]'); } catch { return []; } })(),
      };
    });
}

/** Dòng DB → hình dạng `entry` mà `entryToGraph` nhận. Tên cột SQL và tên field entry khác nhau. */
export function rowToEntry(row = {}) {
  return {
    maDa: chuan(row.ma_da),
    sttRec: chuan(row.stt_rec),
    tieuDe: chuan(row.tieuDe),
    boiCanh: chuan(row.boiCanh),
    cachLam: chuan(row.cachLam),
    canhBao: chuan(row.canhBao),
    menuId: chuan(row.menu_id),
    sysid: chuan(row.sysid),
    bang: chuan(row.bang),
    tags: Array.isArray(row.tags) ? row.tags : [],
    nguonLt: chuan(row.nguonLt),
    nhapBoi: chuan(row.nhapBoi),
    ngayNhap: chuan(row.ngayNhap),
    doTinCay: row.doTinCay === undefined || row.doTinCay === null || row.doTinCay === ''
      ? undefined : Number(row.doTinCay),
  };
}

/**
 * Entry cũ + phần người dùng truyền → entry mới.
 *
 * BA TRẠNG THÁI của một trường, và phân biệt được cả ba mới là điểm của hàm này:
 *   `undefined`     — không truyền  → GIỮ giá trị cũ
 *   `''` (rỗng)     — truyền tường minh chuỗi rỗng → XOÁ
 *   giá trị khác    → thay
 *
 * `parseArgs` của node cho đúng hai trạng thái đầu: cờ vắng mặt là `undefined`, `--warn ""` là
 * chuỗi rỗng. Nhờ vậy "xoá" là một hành động phải GÕ RA, không xảy ra do quên.
 */
export function gopEntry(cu = {}, moi = {}) {
  const ra = { ...cu };
  for (const khoa of ['maDa', 'sttRec', 'tieuDe', 'boiCanh', 'cachLam', 'canhBao',
    'menuId', 'sysid', 'bang', 'nguonLt', 'doTinCay']) {
    if (moi[khoa] !== undefined) ra[khoa] = moi[khoa];
  }
  if (moi.tags !== undefined) {
    ra.tags = (Array.isArray(moi.tags) ? moi.tags : String(moi.tags).split(','))
      .map(chuan).filter(Boolean);
  }
  return ra;
}

/**
 * Ghép hướng dẫn đã có với các UR đang rà soát.
 *
 * Thứ tự ưu tiên bám đúng độ tin cậy của khoá, KHÔNG phải độ tiện:
 *   `chinh-ur` — hướng dẫn ghi cho CHÍNH UR này. Chắc chắn nhất, đứng đầu.
 *   `sysid`    — controller thật, khớp là chắc.
 *   `menu_id`  — số hiệu BA gõ tay (xem sysidNote trong graph-schema.json): gợi ý YẾU, và phải
 *                nói rõ ra như vậy trên báo cáo chứ không để nó trông ngang hàng hai cái trên.
 *
 * BẢN ĐẦU BỎ QUA `chinh-ur`, VÀ ĐÓ LÀ LỖI. Lý do khi đó: "PM đang nhìn UR ấy rồi, nhắc lại
 * kinh nghiệm của chính nó là nhiễu" — giả định ngầm là hướng dẫn luôn được ghi SAU khi làm
 * xong, nên hiện lại chỉ là tiếng vọng. Sai: UR ở DD thì việc CHƯA làm, và cách làm ghi cho nó
 * chính là chỉ dẫn cho người sắp bắt tay vào. Đúng chỗ cần hiện nhất thì lại là chỗ duy nhất
 * bị giấu. Đo được ngay ở ca thật: HOATP UR10 (fcode1 `10`, trạng thái DD) có hướng dẫn ghi
 * đích danh mà tab "Gợi ý kỹ thuật" trống trơn.
 *
 * @param {Array} urs      UR trong phạm vi báo cáo
 * @param {Array} khoHuong kết quả docPlaybook()
 * @returns {Array<{ur: object, huongDan: Array<object & {_khop: 'chinh-ur'|'sysid'|'menu_id'}>}>}
 */
/**
 * `menu_id` này có định vị được MỘT màn hình không, hay chỉ là rổ gộp cấp phân hệ.
 *
 * Mã menu có dạng `NN.NN.NN` đi từ phân hệ xuống màn hình. Mảnh cuối bằng `00` nghĩa là chưa đi
 * xuống tới đâu cả: `01.00.00` là CẢ phân hệ, `36.10.00` là cả nhóm. Dùng nó làm khoá ghép
 * nghĩa là ghép với gần như mọi thứ — đo trên chính lượt chạy này, `01.00.00` gánh 632 UR của
 * riêng một người.
 *
 * Ca thật đã sinh ra lỗi: một hướng dẫn về "đánh số thứ tự cho browse danh mục" neo ở
 * `01.00.00` được gắn vào một UR xin thêm tuỳ chọn loại khách khỏi báo cáo bán hàng — hai việc
 * không liên quan gì nhau, khớp chỉ vì cùng rổ. Chặn ở đây thay vì hạ nhãn xuống "khớp yếu":
 * một khớp sai không cứu được bằng cách dán nhãn cho nó.
 *
 * Chuỗi rỗng, `.`, hay bất cứ dạng nào không đọc ra được mảnh cuối là số → cũng coi là không
 * định vị được.
 */
export function laMenuGop(menuId) {
  const seg = chuan(menuId).split('.');
  if (seg.length < 2) return true;
  const cuoi = seg[seg.length - 1];
  if (!/^\d+$/.test(cuoi)) return true;
  return /^0+$/.test(cuoi);
}

export function ghepVaoUr(urs = [], khoHuong = []) {
  if (!khoHuong.length) return [];
  const theoUr = new Map();
  const theoSysid = new Map();
  const theoMenu = new Map();
  const gom = (map, khoa, h) => {
    if (!khoa) return;
    if (!map.has(khoa)) map.set(khoa, []);
    map.get(khoa).push(h);
  };
  for (const h of khoHuong) {
    gom(theoUr, chuan(h.stt_rec), h);
    gom(theoSysid, chuan(h.sysid), h);
    // Hướng dẫn neo ở menu gộp thì KHÔNG vào chỉ mục menu — nó sẽ không bao giờ khớp qua đường
    // đó. Đúng như vậy: một hướng dẫn không neo được vào màn hình nào cụ thể thì chưa có neo,
    // và đường ra là tác giả bổ sung `sysid` chứ không phải hệ thống rải nó khắp nơi.
    if (!laMenuGop(h.menu_id)) gom(theoMenu, chuan(h.menu_id), h);
  }

  const out = [];
  for (const u of urs) {
    const daCo = new Set();
    const huongDan = [];
    const them = (list, kieu) => {
      for (const h of list ?? []) {
        const k = chuan(h.key) || chuan(h.id);
        if (daCo.has(k)) continue; // đã vào bằng khoá chắc hơn thì không xếp lại bằng khoá yếu
        daCo.add(k);
        huongDan.push({ ...h, _khop: kieu });
      }
    };
    them(theoUr.get(chuan(u.stt_rec)), 'chinh-ur');
    them(theoSysid.get(chuan(u.sysid)), 'sysid');
    // `hienVat` là danh sách sysid rút từ chính nội dung UR (xem experience-extract.mjs) —
    // chắc hơn `u.sysid` đơn lẻ và là thứ duy nhất bắt được UR đụng nhiều màn hình cùng lúc.
    for (const hv of u.hienVat ?? []) them(theoSysid.get(chuan(hv)), 'hien-vat');
    if (!laMenuGop(u.menu_id)) them(theoMenu.get(chuan(u.menu_id)), 'menu_id');
    if (huongDan.length) out.push({ ur: u, huongDan });
  }
  return out;
}
