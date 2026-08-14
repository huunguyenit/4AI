// review-report.mjs — dataset UR → MÔ TẢ FILE báo cáo. KHÔNG ghi đĩa.
//
// Tồn tại vì cùng một báo cáo phải dựng được từ hai đường vào khác nhau:
//
//   CLI  `4ai report`              → tools/4ai.mjs  → writeArtifacts
//   MCP  `render_review_report`    → mcp/fbo/lib/tools.mjs → writeArtifacts
//
// Bề mặt nào không có shell (chat, Cowork) thì đường CLI không tồn tại, và trước khi có
// file này thì đường duy nhất còn sống là `get_review_dataset` — dataset THÔ. Model gặp
// dataset thô mà không có đường dựng báo cáo sẽ tự ghép HTML lấy, tức là bỏ qua toàn bộ
// validate payload, bỏ qua ledger, và phân tích cả UR XN/TH mà doctrine cấm phân tích.
// Cách chặn không phải viết thêm lời dặn — là làm cho đường đúng chạy được ở mọi bề mặt.
//
// Ranh giới: file này KHÔNG import writer. Nó trả mô tả file; caller ghi.

import { fetchReviewDataset, datasetToPayloads, todayIso, trimmed } from './review-dataset.mjs';
import { buildReportArtifact, buildPortfolioArtifact, duongDanDuAn, duongDanTong } from './report.mjs';
import { HUB, pmIdentity } from './assets.mjs';
import { runGraphSql } from '../../mcp/fbo/lib/sql.mjs';
import { datasetToGraph } from './graph-sync.mjs';
import { goiYPhanCong } from './assignee.mjs';
import { snapshotGoiY, toGraphNodes, docLog, doiChieu, tongHop } from './recommendation-log.mjs';

/** Trạng thái PM chỉ theo dõi hạn, không phân tích — xem `pm-deadline-review`. */
const CHI_THEO_DOI = ['XN', 'TH'];

/**
 * Đối chiếu gợi ý cũ với thực tế, rồi snapshot gợi ý lần này.
 *
 * Tách riêng vì đây là thứ DUY NHẤT trong pipeline báo cáo có trí nhớ giữa các lần chạy —
 * mọi phần khác đều thuần từ dataset. Hỏng ở đây không được phép làm mất báo cáo: log là dữ
 * liệu phụ trợ, còn báo cáo mới là thứ PM cần sáng nay.
 *
 * @returns {{hieuQuaGoiY: object|null, banGhi: Array}}
 */
function vongHocGoiY(dataset, byProject, ngay, deps = {}) {
  try {
    const maDas = Object.keys(byProject);
    const pmTheoDuAn = new Map(Object.entries(byProject).map(([maDa, p]) => [maDa, p.pm ?? '']));

    // Log của MỌI user, không riêng máy này — đó là điểm khác so với bản ghi ra file cục bộ.
    const doc = { runGraphSql: deps.runGraphSql ?? runGraphSql };
    const daDoiChieu = doiChieu(docLog(doc, maDas), dataset.yeuCau ?? [], pmTheoDuAn);

    // Gợi ý của lần chạy này — đúng hàm mà báo cáo dùng để hiển thị, không chấm lại kiểu khác.
    const banGhi = [];
    for (const [maDa, payload] of Object.entries(byProject)) {
      if (!payload.nhanSu) continue;
      const goiYs = goiYPhanCong(payload.yeuCau ?? [], payload.nhanSu, {}, payload.pm ?? '');
      banGhi.push(...snapshotGoiY(goiYs.map(({ ur, goiY }) => ({ ur: { ...ur, ma_da: maDa }, goiY })),
        { ngayChay: ngay }));
    }

    const tong = tongHop(daDoiChieu);
    return {
      // Chưa có lần chạy nào trước thì chưa có gì để nói — đừng hiện một thẻ rỗng 0%.
      hieuQuaGoiY: tong.soGoiY ? { ...tong, chiTiet: daDoiChieu } : null,
      banGhi,
    };
  } catch {
    return { hieuQuaGoiY: null, banGhi: [] };
  }
}

/**
 * Dataset cố định → danh sách file báo cáo (HTML + payload JSON cạnh nó) + mô hình đồ thị.
 *
 * @param {string} hub
 * @param {{project?: string, pmName?: string, pmDept?: string, maxRows?: number, ngayChay?: string}} args
 * @param {object} deps  chuyển tiếp cho fetchReviewDataset; `runGraphSql` để test không chạm đồ thị
 * @returns {{files: Array<{relPath: string, content: string}>, ngay: string, pm: string,
 *            dataset: object, boQua: Array<{ma_da: string|null, errors: string[]}>,
 *            canhBao: string[], doThi: {nodes: Array, edges: Array, scopes: string[]}}}
 * @throws {Error} khi phạm vi không có UR nào, hoặc không dựng được file nào
 */
export function buildReviewReportFiles(hub = HUB, args = {}, deps = {}) {
  const dataset = fetchReviewDataset(hub, args, deps);
  if (!dataset.yeuCau.length) {
    throw new Error('không có UR nào trong phạm vi (DD/XN/TH) — không dựng báo cáo.');
  }

  const pm = dataset.filters.pmName || dataset.filters.pmDept || '';
  const ngay = args.ngayChay || todayIso();
  const { portfolio, byProject } = datasetToPayloads(dataset, { ngay_chay: ngay, pm });

  const files = [];
  const boQua = [];
  const canhBao = [];

  // Vòng học: đối chiếu gợi ý các lần chạy TRƯỚC với việc PM đã thật sự giao cho ai (đọc từ
  // chính dataset này), rồi ghi lại gợi ý của lần chạy NÀY để lần sau đối chiếu tiếp. PM không
  // phải xác nhận gì — họ duyệt trên web QLDA, hệ thống chỉ quan sát kết quả.
  const { hieuQuaGoiY, banGhi } = vongHocGoiY(dataset, byProject, ngay, deps);
  if (hieuQuaGoiY) portfolio.hieuQuaGoiY = hieuQuaGoiY;

  // Tầng dự án cho đồ thị: dựng ở đây vì dataset đã nằm sẵn trong tay, nhưng KHÔNG đẩy lên DB
  // ở đây — module này trả mô tả, caller quyết định ghi. Cùng kỷ luật với `files`.
  const boi = pmIdentity(hub).maNv;
  const doThi = datasetToGraph(dataset, { boi });

  // Log gợi ý đi CHUNG một lần đẩy với tầng dự án: cạnh HAS_RECOMMENDATION bám vào node
  // Request do chính lần đẩy đó dựng, tách ra hai lần ghi thì có lúc cạnh trỏ vào chỗ trống.
  const logGoiY = toGraphNodes(banGhi, { boi });
  doThi.nodes.push(...logGoiY.nodes);
  doThi.edges.push(...logGoiY.edges);

  for (const [maDa, payload] of Object.entries(byProject)) {
    // ignoreQuality: lần sinh tự động từ dataset chưa có deXuat/nhanSu do người viết —
    // thiếu mấy mục đó không phải lý do để mất cả trang của một dự án.
    const { artifact, errors } = buildReportArtifact(payload, hub, { ignoreQuality: true });
    if (errors.length) {
      boQua.push({ ma_da: maDa, errors });
      continue;
    }
    files.push(artifact);
    files.push({
      relPath: duongDanDuAn(ngay, maDa).replace(/review\.html$/, 'review.payload.json'),
      content: JSON.stringify(payload, null, 2) + '\n',
    });
  }

  // Trang tổng quan chỉ có nghĩa khi rà soát nhiều dự án — chỉ định `project` thì bỏ.
  if (!trimmed(args.project) && portfolio.projects.length) {
    const { artifact, errors } = buildPortfolioArtifact(portfolio, hub);
    if (errors.length) {
      boQua.push({ ma_da: null, errors });
    } else {
      files.push(artifact);
      files.push({
        relPath: duongDanTong(ngay).replace(/tong\.html$/, 'tong.payload.json'),
        content: JSON.stringify(portfolio, null, 2) + '\n',
      });
    }
  }

  if (!files.length) {
    const chiTiet = boQua.flatMap((b) => b.errors).join('; ');
    throw new Error(`không dựng được file báo cáo nào${chiTiet ? ` — ${chiTiet}` : '.'}`);
  }
  if (dataset.truncated) {
    canhBao.push('dataset bị cắt ở maxRows — tăng maxRows hoặc lọc hẹp lại phạm vi.');
  }

  if (doThi.boQua.length) canhBao.push(...doThi.boQua);
  return { files, ngay, pm, dataset, boQua, canhBao, doThi };
}

/**
 * Dataset → phần AI được phép phân tích.
 *
 * Cổng PM chỉ mở ở `DD`. `XN`/`TH` có mặt trên HTML để theo dõi hạn, nên ở đây chúng chỉ
 * còn ĐẾM và hạn gần nhất — không có `noi_dung`, không có đầu mục. Đây là chỗ doctrine
 * "chỉ phân tích DD" thôi làm lời dặn và thành hình dạng dữ liệu: cái không trả về thì
 * không phân tích nhầm được.
 *
 * @param {object} dataset  kết quả fetchReviewDataset
 * @returns {object}
 */
export function ddChoPhanTich(dataset) {
  const yeuCau = dataset.yeuCau ?? [];
  const dd = yeuCau.filter((u) => trimmed(u.trang_thai) === 'DD');

  const theoTrangThai = {};
  for (const u of yeuCau) {
    const st = trimmed(u.trang_thai) || '(rỗng)';
    theoTrangThai[st] = (theoTrangThai[st] ?? 0) + 1;
  }

  const hanSomNhat = (list) => list
    .map((u) => String(u.ngay_ht ?? '').slice(0, 10))
    .filter(Boolean)
    .sort()[0] ?? null;

  const byDa = new Map();
  for (const u of yeuCau) {
    const maDa = trimmed(u.ma_da);
    if (!maDa) continue;
    if (!byDa.has(maDa)) byDa.set(maDa, { ma_da: maDa, ten_ngan: trimmed(u.ten_ngan) || maDa, urs: [] });
    byDa.get(maDa).urs.push(u);
  }

  const duAn = [...byDa.values()].map((d) => {
    const theoDoi = d.urs.filter((u) => CHI_THEO_DOI.includes(trimmed(u.trang_thai)));
    return {
      ma_da: d.ma_da,
      ten_ngan: d.ten_ngan,
      soUR: d.urs.length,
      soDD: d.urs.filter((u) => trimmed(u.trang_thai) === 'DD').length,
      soTheoDoi: theoDoi.length,
      hanTheoDoiSomNhat: hanSomNhat(theoDoi),
    };
  }).sort((a, b) => a.ma_da.localeCompare(b.ma_da));

  return {
    tongQuan: {
      soDuAn: duAn.length,
      soUR: yeuCau.length,
      theoTrangThai,
    },
    duAn,
    ddUR: dd,
    nhanSu: dataset.nhanSu,
    ghiChu:
      `Chỉ ${dd.length} UR trạng thái DD được trả nguyên nội dung — đó là phạm vi PM được phân `
      + 'tích (tài liệu đầu vào, ảnh hưởng, phân việc, đề xuất XN/TA/KL). '
      + `UR ${CHI_THEO_DOI.join('/')} CỐ Ý chỉ còn số đếm và hạn gần nhất: chúng đã qua cổng PM, `
      + 'có mặt trên HTML để theo dõi hạn chứ không phải để phân tích lại. Đừng gọi '
      + '`get_review_dataset` để lấy lại nội dung của chúng. '
      + 'UR DD có `forum[]` thì nội dung yêu cầu THẬT nằm trong topic đó, không phải trong `noi_dung`.',
  };
}
