'use server';

import { requireManager } from '@/lib/auth';
import { callAI, isAIConfigured } from '@/lib/ai';
import { buildResultPrompt } from '@/lib/ai-prompts';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { revalidatePath } from 'next/cache';
import { logAudit } from '@/lib/audit';
import { getEvaluationsByPeriodAdmin } from '@/lib/db/evaluations-admin';
import { getUsersAdmin } from '@/lib/db/users-admin';
import { getAllCriteriaGroups } from '@/lib/db/criteria';
import { getDashboardData } from '@/actions/dashboard';
import { detectAnomalies } from '@/lib/anomaly';
import { getPeriodSummary } from '@/actions/ai-summary';
import { toClientError } from '@/lib/errors';
import { checkAndRecordAiUsage } from '@/lib/ai-limit';

const AI_NOT_CONFIGURED = 'AI chưa được cấu hình — chờ cung cấp API key.';

function aiError(): { error: string } {
  return { error: 'AI không phản hồi (lỗi hoặc hết thời gian).' };
}

/**
 * Giải thích một cảnh báo đánh giá bất thường bằng AI (Manager-only).
 * Chưa cấu hình AI_API_KEY → trả thông báo (fail-soft, không lỗi).
 * Dữ liệu gửi LLM: ẩn danh hóa (tên thật → 'Nhân viên'), chỉ số liệu cần thiết.
 */
export async function explainAnomalyAction(input: {
  evaluationId: string;
  name: string;
  round: number;
  prevScore: number;
  score: number;
}): Promise<{ explanation?: string; error?: string }> {
  const auth = await requireManager();
  if (auth.error !== null) return { error: auth.error };

  if (!isAIConfigured()) {
    return { error: 'AI chưa được cấu hình — chờ cung cấp API key.' };
  }

  const aiQuota = await checkAndRecordAiUsage(auth.user.id, 'explainAnomaly');
  if (!aiQuota.allowed) return { error: aiQuota.error };

  const prompt = `Dữ liệu đánh giá QAQC:
- Nhân viên (mã số ${input.evaluationId.slice(0, 8)}): vòng ${input.round - 1} đạt ${input.prevScore} điểm, vòng ${input.round} đạt ${input.score} điểm (chênh lệch ${Math.abs(input.score - input.prevScore)} điểm).
- Hãy đưa ra 3 khả năng có thể giải thích sự chênh lệch này (thiên kiến, thay đổi năng lực, lỗi nhập liệu...) và 1 gợi ý hành động cho quản lý. Ngắn gọn, tối đa 120 từ, tiếng Việt.`;

  const explanation = await callAI(prompt, { maxTokens: 250 });
  if (!explanation) {
    return { error: 'AI không phản hồi (lỗi hoặc hết thời gian).' };
  }
  return { explanation };
}

/**
 * Gợi ý nhận xét chung khi chấm điểm — CHỈ Manager.
 * Gửi CHI TIẾT TỪNG TIÊU CHUẨN (tên + điểm + mức đạt) để AI nhận xét cụ thể,
 * không chung chung. Ẩn danh hóa: mã NV thay tên.
 */
export async function suggestCommentAction(input: {
  employeeCode: string;
  role: string;
  criteriaDetail: { code: string; name: string; points: number; levelLabel: string; note: string }[];
  previousComments: string[];
  currentComment: string;
  totalScore: number;
  grade: string;
}): Promise<{ comment?: string; error?: string }> {
  const auth = await requireManager();
  if (auth.error !== null) return { error: auth.error };
  if (!isAIConfigured()) return { error: AI_NOT_CONFIGURED };

  const aiQuota = await checkAndRecordAiUsage(auth.user.id, 'suggestComment');
  if (!aiQuota.allowed) return { error: aiQuota.error };

  const detailText = input.criteriaDetail.length
    ? input.criteriaDetail
        .map((c) => `- ${c.code} ${c.name}: ${c.points} điểm (${c.levelLabel || 'không xác định'})${c.note ? ` — ghi chú: ${c.note}` : ''}`)
        .join('\n')
    : 'chưa có tiêu chí nào được chấm';
  const prevText = input.previousComments.length
    ? input.previousComments.map((c, i) => `- Vòng ${i + 1}: ${c}`).join('\n')
    : 'không có';

  const prompt = `Dữ liệu đánh giá QAQC (ẩn danh hóa — mã NV ${input.employeeCode}, vai trò ${input.role}):
- Tổng điểm: ${input.totalScore}, xếp loại: ${input.grade}
- CHI TIẾT TỪNG TIÊU CHUẨN (mã A* = Kỷ luật, E* = Năng lực, F* = Thành tích/quản lý):
${detailText}
- NHẬN XÉT CÁC VÒNG CHẤM TRƯỚC (tham khảo để nhất quán — các vòng do NHỮNG NGƯỜI ĐÁNH GIÁ KHÁC NHAU chấm, không phải theo thời gian, KHÔNG so sánh tiến bộ/lùi giữa các vòng):
${prevText}
${input.currentComment ? `- Nhận xét hiện tại: ${input.currentComment}` : ''}

MẪU PHONG CÁCH QUẢN LÝ (chỉ THAM KHẢO CÁCH VIẾT — không sao chép nội dung):
"Với vai trò quản lý, việc bố trí người khi cấp bách và đào tạo NV đa năng đã phát huy tốt, kíp vận hành hiếm khi chờ người; nên nhân rộng cách chia sẻ kinh nghiệm xử lý sự cố sang các kíp còn lại. Kỷ luật lao động kỳ này giữ ổn định. Tiếp tục phát huy, chú ý thêm khâu theo dõi sau đào tạo."
MẪU PHONG CÁCH NHÂN VIÊN:
"Hiện diện và tác phong tốt, thực hiện 6S đều đặn nên khu vực phụ trách luôn gọn gàng; điểm cần lưu ý là chủ động hơn khi phát sinh việc bất thường thay vì chờ chỉ đạo. Nhìn chung hoàn thành tốt nhiệm vụ kỳ này, duy trì nếp làm việc ổn định."

Hãy viết NHẬN XÉT TỔNG QUÁT (4-5 câu, tiếng Việt) theo NGUYÊN TẮC:
1. QUẢN LÝ (Leader/SubLeader/Manager): phân tích KỸ 2-3 tiêu chuẩn QUẢN LÝ nổi bật (mã F*) — điểm mạnh + đề xuất phát huy. NHÂN VIÊN: 1-2 tiêu chuẩn mạnh nhất + 1-2 yếu nhất + cách khắc phục cụ thể.
2. KỶ LUẬT (mã A*): không vi phạm → CHỈ 1 câu NGẮN nhưng DIỄN ĐẠT ĐA DẠNG theo từng người (vd: "Nhân viên duy trì kỷ luật và tác phong lao động tốt trong kỳ", "Không phát sinh vi phạm nội quy, chấm công ổn định", "Tinh thần chấp hành nội quy tốt, không có vấn đề kỷ luật"...). TUYỆT ĐỐI không viết y hệt câu giống nhau cho mọi người, không liệt kê tiêu chí 0 điểm, không nêu "theo dõi chấm công" khi không có vi phạm.
3. XƯNG HÔ: gọi người được đánh giá là "Nhân viên" (vd: "Nhân viên đạt...", "Nhân viên cần...") — KHÔNG dùng "Anh/chị", "bạn", "em".
4. VAI TRÒ: khi nhắc vai trò, LUÔN dùng từ "quản lý" (KHÔNG viết "Leader", "SubLeader", "Manager", "điều phối", "dẫn dắt" để chỉ vai trò) và ĐA DẠNG CÁCH DIỄN ĐẠT theo từng bài (vd: "Ở vai trò quản lý...", "Với vai trò quản lý...", "Là người quản lý...", "Trong vai trò quản lý...") — không lặp lại cùng một cụm cho mọi người.
5. NHẮC TIÊU CHUẨN: MÔ TẢ NGẮN nội dung tiêu chuẩn rồi để mã số trong ngoặc (vd: "ở tiêu chuẩn về tinh thần hợp tác, phối hợp (B1)", "ở tiêu chuẩn về đào tạo nhân sự chủ chốt (F9)") — KHÔNG viết "Ở B1" hoặc để mã đứng một mình đầu câu.
6. NHẬN XÉT VÒNG TRƯỚC chỉ dùng để THAM KHẢO NGẦM (nắm thông tin cho nhất quán) — KHÔNG được trích dẫn kiểu "như nhận xét trước", "theo nhận xét vòng trước". KHÔNG so sánh điểm, KHÔNG nhận xét tiến bộ/lùi giữa các vòng.
7. KHÔNG nêu tổng điểm số. Kết 1 câu khuyến khích ngắn.
8. VIẾT GIỐNG NGƯỜI THẬT, BẮT CHƯỚC PHONG CÁCH MẪU (tự nhiên, thực tế) — TRÁNH giọng văn AI (không dùng "cho thấy sự nỗ lực", "đáng ghi nhận", "góp phần không nhỏ", "thể hiện rõ", liệt kê đều đều, cảm thán sáo rỗng). Mỗi nhân viên một cách viết khác nhau.
YÊU CẦU: NGẮN GỌN 4-5 câu, sát dữ liệu, cụ thể theo TÊN tiêu chuẩn, không chung chung, không thừa thãi, không bịa thông tin.`;

  const comment = await callAI(prompt, { maxTokens: 900, temperature: 0.7 });
  if (!comment) return aiError();
  return { comment };
}

export async function draftResultMessageAction(input: {
  employeeCode: string;
  name: string;
  role: string;
  totalScore: number;
  grade: string;
  criteriaDetail: { code: string; name: string; points: number; levelLabel: string }[];
  previousComments: string[];
  notesSummary: string;
  summaryNotes: string;
  periodName: string;
}): Promise<{ message?: string; error?: string }> {
  const auth = await requireManager();
  if (auth.error !== null) return { error: auth.error };
  if (!isAIConfigured()) return { error: AI_NOT_CONFIGURED };

  const aiQuota = await checkAndRecordAiUsage(auth.user.id, 'draftResultMessage');
  if (!aiQuota.allowed) return { error: aiQuota.error };

  const prompt = buildResultPrompt(input);
  const message = await callAI(prompt, { maxTokens: 800, temperature: 0.7 });
  if (!message) return aiError();
  return { message };
}

/**
 * Lưu thông báo kết quả vào evaluation (Manager-only).
 */
export async function saveResultMessageAction(input: {
  evaluationId: string;
  message: string;
}): Promise<{ ok?: boolean; error?: string }> {
  const auth = await requireManager();
  if (auth.error !== null) return { error: auth.error };

  try {
    const { error } = await supabaseAdmin
      .from('evaluations')
      .update({ result_message: input.message })
      .eq('id', input.evaluationId);

    if (error) {
      return { error: toClientError(error, 'Lỗi cập nhật thông báo kết quả. Vui lòng thử lại.') };
    }

    revalidatePath(`/evaluations/${input.evaluationId}`);
    revalidatePath('/dashboard');

    await logAudit(
      auth.user,
      'SAVE_RESULT_MESSAGE',
      'evaluation',
      input.evaluationId,
      { messageLength: input.message?.length || 0 }
    );

    return { ok: true };
  } catch (err: unknown) {
    return { error: toClientError(err, 'Lỗi không xác định khi lưu thông báo kết quả.') };
  }
}

export interface GenerateResultChunkItem {
  evaluationId: string;
  message?: string;
  ok: boolean;
  error?: string;
}

/**
 * Sinh thông báo kết quả hàng loạt theo từng chunk (Manager-only).
 */
export async function generateResultMessagesChunkAction(input: {
  periodId: string;
  offset: number;
  limit?: number;
}): Promise<{
  items?: GenerateResultChunkItem[];
  nextOffset?: number;
  done?: boolean;
  total?: number;
  error?: string;
}> {
  const auth = await requireManager();
  if (auth.error !== null) return { error: auth.error };
  if (!isAIConfigured()) return { error: AI_NOT_CONFIGURED };

  const aiQuota = await checkAndRecordAiUsage(auth.user.id, 'generateResultMessagesChunk');
  if (!aiQuota.allowed) return { error: aiQuota.error };

  const limit = input.limit ?? 5;
  const offset = Math.max(0, input.offset || 0);

  try {
    const [evaluations, users, criteriaGroups] = await Promise.all([
      getEvaluationsByPeriodAdmin(input.periodId, auth.user),
      getUsersAdmin(),
      getAllCriteriaGroups(),
    ]);

    const { data: periodData } = await supabaseAdmin
      .from('evaluation_periods')
      .select('id, name, year')
      .eq('id', input.periodId)
      .maybeSingle();

    const periodName = periodData ? `${periodData.name} (${periodData.year})` : 'Kỳ đánh giá';

    // Chỉ xử lý evaluations đã Approved
    const approvedEvals = evaluations.filter((e) => e.status === 'Approved');
    const totalApproved = approvedEvals.length;
    const chunk = approvedEvals.slice(offset, offset + limit);

    const userMap = new Map(users.map((u) => [u.id, u]));
    const allCriteria = criteriaGroups.flatMap((g) => g.criteria);
    const criteriaMap = new Map(allCriteria.map((c) => [c.id, c]));

    const items: GenerateResultChunkItem[] = await Promise.all(
      chunk.map(async (ev) => {
        try {
          const employee = userMap.get(ev.employeeId);
          const rounds = ev.rounds || [];
          const lastRound =
            [...rounds].sort((a, b) => b.round - a.round).find((r) => (r.totalScore || 0) > 0) ||
            rounds[rounds.length - 1];
          const lastScores = lastRound?.scores || {};

          const criteriaDetail = allCriteria
            .filter((c) => lastScores[c.id] !== undefined)
            .map((c) => {
              const levelIdx = lastRound?.selectedLevelIndexes?.[c.id] ?? 0;
              const level = c.levels?.[levelIdx];
              return {
                code: c.code,
                name: c.name,
                points: Number(lastScores[c.id]) || 0,
                levelLabel: level?.label || '',
              };
            });

          const previousComments = rounds
            .filter((r) => r.round < (lastRound?.round ?? 0))
            .map((r) => r.comment || '')
            .filter(Boolean);

          const notesSummary = Object.entries(lastRound?.notes || {})
            .filter(([, v]) => v && v.trim())
            .slice(0, 3)
            .map(([k, v]) => {
              const c = criteriaMap.get(k);
              return `${c?.code || ''} ${c?.name || ''}: ${v}`;
            })
            .filter(Boolean)
            .join(' | ');

          const summaryNotes =
            lastRound?.comment || rounds.map((r) => r.comment).filter(Boolean).join(' | ');

          const totalScore = ev.finalScore ?? lastRound?.totalScore ?? 0;
          const grade = ev.finalGrade ?? lastRound?.grade ?? '';

          const prompt = buildResultPrompt({
            employeeCode: employee?.employeeCode || '',
            name: employee?.name || '',
            role: ev.employeeRole || employee?.role || '',
            totalScore,
            grade,
            criteriaDetail,
            previousComments,
            notesSummary,
            summaryNotes,
            periodName,
          });

          const message = await callAI(prompt, { maxTokens: 800, temperature: 0.7 });
          if (message) {
            return { evaluationId: ev.id, message, ok: true };
          } else {
            return { evaluationId: ev.id, ok: false, error: 'AI không phản hồi' };
          }
        } catch (err) {
          return {
            evaluationId: ev.id,
            ok: false,
            error: toClientError(err, 'Lỗi tạo thông báo'),
          };
        }
      })
    );

    const nextOffset = offset + chunk.length;
    const done = nextOffset >= totalApproved;

    return {
      items,
      nextOffset,
      done,
      total: totalApproved,
    };
  } catch (err: unknown) {
    return {
      error: toClientError(err, 'Lỗi xử lý tạo thông báo hàng loạt. Vui lòng thử lại.'),
    };
  }
}

/**
 * Soạn biên bản kết thúc kỳ đánh giá bằng AI (Manager-only).
 * Fetch: getDashboardData + detectAnomalies + getPeriodSummary + period info.
 * ẨN DANH HÓA: strip tên thật khỏi recentActivities và anomalies (chỉ giữ mã NV).
 */
export async function generatePeriodMinutesAction(input: {
  periodId: string;
}): Promise<{ minutes?: string; periodName?: string; error?: string }> {
  const auth = await requireManager();
  if (auth.error !== null) return { error: auth.error };
  if (!isAIConfigured()) return { error: AI_NOT_CONFIGURED };
  if (!input.periodId) return { error: 'Thiếu thông tin kỳ đánh giá.' };

  const aiQuota = await checkAndRecordAiUsage(auth.user.id, 'generatePeriodMinutes');
  if (!aiQuota.allowed) return { error: aiQuota.error };

  try {
    const [d, periodSummaryRes, users, periodRes] = await Promise.all([
      getDashboardData(input.periodId),
      getPeriodSummary(input.periodId),
      getUsersAdmin(),
      supabaseAdmin
        .from('evaluation_periods')
        .select('id, name, year, status')
        .eq('id', input.periodId)
        .maybeSingle(),
    ]);

    const periodData = periodRes.data;
    const periodName = periodData ? `${periodData.name} (${periodData.year})` : 'Kỳ đánh giá';

    if (!d) {
      return { error: 'Không tìm thấy dữ liệu đánh giá cho kỳ này.' };
    }

    const codeById = new Map(users.map((u) => [u.id, u.employeeCode || `NV-${u.id.slice(0, 6)}`]));
    const anomalies = detectAnomalies(d.rawEvaluations || [], codeById);

    // Ẩn danh hóa: Chỉ giữ mã NV, strip toàn bộ tên người
    const anomalyText = anomalies.length
      ? anomalies
          .slice(0, 5)
          .map(
            (a) =>
              `- Mã NV ${a.name}: Vòng ${a.prevRound} (${a.prevScore}đ) -> Vòng ${a.round} (${a.score}đ), chênh lệch ${a.diff} điểm (${a.severity === 'high' ? 'nghiêm trọng' : 'trung bình'})`
          )
          .join('\n')
      : 'Không ghi nhận bất thường đáng kể.';

    const statsText = `Tổng số nhân sự: ${d.stats.total}. Đã hoàn thành (Approved): ${d.stats.completed} (${d.stats.percent}%). Đang thực hiện: ${d.stats.inProgress}. Chưa bắt đầu: ${d.stats.notStarted}.`;

    const gradeText = (d.gradeDistribution || [])
      .map((g) => `${g.grade}: ${g.count}`)
      .join(', ');

    const teamText = (d.teamStatus || [])
      .map((t) => `${t.name}: ${t.progress}% (${t.membersCount} nhân sự)`)
      .join('; ');

    const recentText = (d.recentActivities || [])
      .map((a) => `- Đánh giá trạng thái ${a.status}, xếp loại ${a.grade || 'chưa có'}`)
      .join('\n');

    const summaryContent = periodSummaryRes.summary || 'Chưa có tóm tắt tổng hợp trước đó.';

    const prompt = `Bạn là thư ký/trợ lý nhân sự chuyên nghiệp của công ty. Hãy soạn BIÊN BẢN KẾT THÚC KỲ ĐÁNH GIÁ NĂNG LỰC QAQC (${periodName}).
Văn phong: Tiếng Việt, chính thức, trang trọng, cô đọng, khách quan (~250-350 từ).

DỮ LIỆU ĐÁNH GIÁ (Đã ẩn danh hóa):
- Kỳ đánh giá: ${periodName} (Trạng thái: ${periodData?.status || 'Active'})
- Thống kê tiến độ: ${statsText}
- Phân bổ xếp loại: ${gradeText || 'Chưa có dữ liệu'}
- Tiến độ theo nhóm: ${teamText || 'Chưa có dữ liệu'}
- Hoạt động gần đây:
${recentText || 'Không có'}
- Tóm tắt tổng hợp kỳ:
${summaryContent}
- Cảnh báo bất thường (chênh lệch điểm giữa các vòng):
${anomalyText}

CẤU TRÚC BIÊN BẢN (đầy đủ các phần rõ ràng):
1. TIÊU ĐỀ: BIÊN BẢN TỔNG KẾT KỲ ĐÁNH GIÁ NĂNG LỰC QAQC - ${periodName.toUpperCase()}
2. MỤC ĐÍCH & PHẠM VI: Nêu rõ mục đích tổng kết và phạm vi áp dụng (bộ phận QAQC).
3. TỔNG QUAN KẾT QUẢ: Nêu cụ thể số lượng nhân sự tham gia, tỷ lệ hoàn thành, bức tranh phân bổ xếp loại (S, A, B, C, D) và tiến độ các nhóm.
4. ĐIỂM NỔI BẬT & ĐÁNH GIÁ CHUNG: Đúc kết từ tóm tắt kỳ về năng lực, tinh thần kỷ luật và những mặt làm tốt.
5. VẤN ĐỀ TỒN TẠI & BẤT THƯỜNG: Nêu các vấn đề cần lưu ý (tiến độ chưa xong, chênh lệch điểm bất thường giữa các vòng nếu có).
6. KHUYẾN NGHỊ & KẾ HOẠCH KỲ TIẾP THEO: 2-3 kiến nghị cụ thể cho kỳ đánh giá tiếp theo (đào tạo, chuẩn hóa tiêu chí chấm, cải thiện tiến độ).

YÊU CẦU: Trình bày mạch lạc, có cấu trúc gạch đầu dòng rõ ràng, chuẩn phong cách biên bản hành chính doanh nghiệp.`;

    const minutes = await callAI(prompt, { maxTokens: 1200, temperature: 0.4 });
    if (!minutes) {
      return { error: 'AI không phản hồi (lỗi hoặc hết thời gian).' };
    }

    return { minutes, periodName };
  } catch (err: unknown) {
    return { error: toClientError(err, 'Lỗi tạo biên bản kết thúc kỳ. Vui lòng thử lại.') };
  }
}

