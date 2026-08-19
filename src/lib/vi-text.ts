/**
 * Chat AI context helpers (Phase 91) — THUẦN, KHÔNG server-only, KHÔNG DB.
 * Tách riêng để unit-test trực tiếp (Node strip-types import .ts trong .mjs test).
 */

export interface NameRef {
  id: string;
  name: string;
}

/** Bỏ dấu tiếng Việt + lowercase + trim — phục vụ khớp tên nhân viên trong câu hỏi chat. */
export function normalizeVi(s?: string | null): string {
  return (s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip tổ hợp dấu
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase()
    .trim();
}

/** Nhãn tiếng Việt cho chức vụ (đồng bộ logic chat.ts) — Employee/Worker dịch, còn lại giữ mã. */
export function roleLabel(role?: string | null): string {
  if (role === 'Employee') return 'Nhân viên';
  if (role === 'Worker') return 'Công nhân';
  return role || 'Không xác định';
}

/**
 * Build các hậu tố phân biệt của tên (đã normalize) làm khóa match:
 * - tên đầy đủ; các cụm nhiều từ từ cuối (VD "Thị Lý Sa", "Lý Sa"); tên cuối nếu ≥3 ký tự.
 * "Lý Sa" (2 từ, tên cuối "sa" <3) vẫn match được qua cụm "ly sa".
 */
function nameSuffixKeys(name: string): string[] {
  const w = normalizeVi(name).split(/\s+/).filter(Boolean);
  if (w.length === 0) return [];
  const out: string[] = [];
  out.push(w.join(' ')); // tên đầy đủ
  for (let k = 2; k < w.length; k++) {
    out.push(w.slice(w.length - k).join(' ')); // cụm nhiều từ từ cuối
  }
  const last = w[w.length - 1];
  if (last && last.length >= 3) out.push(last); // tên cuối (tránh "a/ly/sa" ngắn)
  return out;
}

/**
 * Match các nhân viên được nhắc trong câu hỏi, trong danh sách users ĐÃ SCOP theo người hỏi.
 * - Với mỗi user: tìm hậu tố tên dài nhất (phân biệt nhất) xuất hiện trong câu hỏi.
 * - Trả mảng các user KHỚP (distinct, giữ thứ tự). Caller quyết định: 0=not_found, 1=found, ≥2=multiple (CG hỏi lại).
 * - Các hậu tố có "đúng 1 chủ sở hữu trong scope" ưu tiên nhất (ít mơ hồ) — xếp trước.
 */
export function matchEmployeeCandidates(
  question?: string | null,
  users?: NameRef[] | null
): NameRef[] {
  const q = normalizeVi(question);
  if (!q || !users || users.length === 0) return [];

  // suffix -> [các user id sở hữu]
  const owner = new Map<string, string[]>();
  for (const u of users) {
    for (const s of nameSuffixKeys(u.name)) {
      if (!owner.has(s)) owner.set(s, []);
      owner.get(s)!.push(u.id);
    }
  }

  interface Cand { u: NameRef; s: string; owners: string[] }
  const cands: Cand[] = [];
  for (const u of users) {
    let best: string | null = null;
    for (const s of nameSuffixKeys(u.name)) {
      if (q.includes(s) && (!best || s.length > best.length)) best = s;
    }
    if (best) cands.push({ u, s: best, owners: owner.get(best) || [] });
  }

  const uniqueFirst = [...cands]
    .sort((a, b) => (a.owners.length === 1 ? -1 : 1) - (b.owners.length === 1 ? -1 : 1))
    .map((c) => c.u);

  const seen = new Set<string>();
  return uniqueFirst.filter((u) => !seen.has(u.id) && seen.add(u.id));
}
