import { User, Role, Team } from '@/types';
import { ALL_ROLES } from '@/lib/role-policy';

export interface ImportResult {
  successCount: number;
  errorCount: number;
  errors: string[];
  data: Partial<User>[];
}

const VALID_ROLES: Role[] = ALL_ROLES;

// dd/mm/yyyy (hoặc dd-mm-yyyy) — năm 4 chữ số ở cuối nên không khớp ISO YYYY-MM-DD.
const JOIN_DATE_DMY_RE = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/;
const JOIN_DATE_ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

const pad2 = (n: number) => String(n).padStart(2, '0');

/**
 * Parse một ô "Ngày vào làm" thành YYYY-MM-DD theo lịch địa phương (không lệch timezone).
 * Chuỗi dd/mm/yyyy đọc theo thứ tự ngày-trước (định dạng Excel Việt Nam);
 * ISO YYYY-MM-DD và Excel serial giữ nguyên hành vi cũ; ô trống vẫn tùy chọn.
 * Giá trị có nhưng không hợp lệ => trả về error để báo theo dòng, không bỏ im lặng.
 */
export function parseJoinDateValue(value: unknown): { date?: string; error?: string } {
  if (value === null || value === undefined) return {};

  if (typeof value === 'number') {
    // Excel serial date (epoch UTC, hành vi giữ nguyên như trước)
    if (!Number.isFinite(value)) {
      return { error: `Ngày vào làm không hợp lệ: ${value}` };
    }
    const parsed = new Date(Math.round((value - 25569) * 86400 * 1000));
    if (isNaN(parsed.getTime())) {
      return { error: `Ngày vào làm không hợp lệ: ${value}` };
    }
    return { date: parsed.toISOString().split('T')[0] };
  }

  if (value instanceof Date) {
    if (isNaN(value.getTime())) {
      return { error: 'Ngày vào làm không hợp lệ' };
    }
    return {
      date: `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())}`,
    };
  }

  const raw = String(value).trim();
  if (!raw) return {};

  const dmy = JOIN_DATE_DMY_RE.exec(raw);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    const year = Number(dmy[3]);
    // Kiểm chứng lịch thật: 31/02/2024 phải bị từ chối, không roll-over sang tháng 3.
    const probe = new Date(year, month - 1, day);
    if (probe.getFullYear() !== year || probe.getMonth() !== month - 1 || probe.getDate() !== day) {
      return { error: `Ngày vào làm không hợp lệ: ${raw}` };
    }
    return { date: `${year}-${pad2(month)}-${pad2(day)}` };
  }

  if (JOIN_DATE_ISO_RE.test(raw)) {
    const [isoYear, isoMonth, isoDay] = raw.split('-').map(Number);
    const probe = new Date(isoYear, isoMonth - 1, isoDay);
    if (
      probe.getFullYear() !== isoYear ||
      probe.getMonth() !== isoMonth - 1 ||
      probe.getDate() !== isoDay
    ) {
      return { error: `Ngày vào làm không hợp lệ: ${raw}` };
    }
    return { date: raw };
  }

  const fallback = new Date(raw);
  if (!isNaN(fallback.getTime())) {
    return { date: fallback.toISOString().split('T')[0] };
  }
  return { error: `Ngày vào làm không hợp lệ: ${raw}` };
}

const ROLE_ALIAS_MAP: Record<string, Role> = {
  'manager': 'Manager',
  'quản lý': 'Manager',
  'quan ly': 'Manager',
  'leader': 'Leader',
  'subleader': 'SubLeader',
  'sub leader': 'SubLeader',
  'employee': 'Employee',
  'nhân viên': 'Employee',
  'nhan vien': 'Employee',
  'worker': 'Worker',
  'công nhân': 'Worker',
  'cong nhan': 'Worker',
};

export async function parseEmployeeExcel(
  file: File,
  teams: Team[]
): Promise<ImportResult> {
  const result: ImportResult = {
    successCount: 0,
    errorCount: 0,
    errors: [],
    data: []
  };

  try {
    // xlsx nặng (~140KB gzip) — chỉ load khi user thật sự import (C1)
    const XLSX = await import('xlsx');
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data, { type: 'array' });
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    
    // Convert to JSON with headers as keys
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet);

    if (rows.length > 500) {
      throw new Error('Số lượng dòng vượt quá giới hạn (500 dòng).');
    }

    const teamMap = new Map(teams.map(t => [t.name.toLowerCase(), t.id]));

    rows.forEach((row, index) => {
      const lineNum = index + 2; // +1 for 0-index, +1 for header
      const errors: string[] = [];

      const employeeCode = String(row['Mã NV'] || row['Employee Code'] || '').trim();
      const name = String(row['Họ tên'] || row['Name'] || '').trim();
      const roleStr = String(row['Chức vụ'] || row['Role'] || 'Employee').trim();
      const teamName = String(row['Nhóm'] || row['Team'] || '').trim();
      const joinDate = row['Ngày vào làm'] || row['Join Date'] || null;

      if (!employeeCode) errors.push('Thiếu Mã NV');
      if (!name) errors.push('Thiếu Họ tên');
      
      let role: Role = 'Employee';
      if (roleStr) {
        const normalized = roleStr.toLowerCase();
        const aliasedRole = ROLE_ALIAS_MAP[normalized];
        const foundRole = aliasedRole || VALID_ROLES.find(r => r.toLowerCase() === normalized);
        if (foundRole) {
          role = foundRole;
        } else {
          errors.push(`Chức vụ không hợp lệ: ${roleStr}`);
        }
      }

      let teamId = '';
      if (teamName) {
        teamId = teamMap.get(teamName.toLowerCase()) || '';
        if (!teamId && role !== 'Manager') {
          errors.push(`Nhóm không tồn tại: ${teamName}`);
        }
      } else if (role !== 'Manager') {
        errors.push('Thiếu tên Nhóm');
      }

      let formattedJoinDate = '';
      if (joinDate !== null && joinDate !== undefined) {
        const parsedJoinDate = parseJoinDateValue(joinDate);
        if (parsedJoinDate.error) {
          errors.push(parsedJoinDate.error);
        } else if (parsedJoinDate.date) {
          formattedJoinDate = parsedJoinDate.date;
        }
      }

      if (errors.length > 0) {
        result.errorCount++;
        result.errors.push(`Dòng ${lineNum}: ${errors.join(', ')}`);
      } else {
        result.data.push({
          employeeCode,
          name,
          role,
          teamId,
          joinDate: formattedJoinDate || undefined,
        });
      }
    });

    result.successCount = result.data.length;
    return result;
  } catch (error: unknown) {
    const err = error as Error;
    return {
      ...result,
      errorCount: 1,
      errors: [`Lỗi khi đọc file: ${err.message}`]
    };
  }
}

export async function downloadSampleExcel(teams: Team[]) {
  const XLSX = await import('xlsx');
  const teamNames = teams.map(t => t.name);

  // --- Sheet 1: Danh sách nhân viên (Data) ---
  const data = [
    ['Mã NV', 'Họ tên', 'Chức vụ', 'Nhóm', 'Ngày vào làm'],
    ['NV001', 'Nguyễn Văn A', 'Employee', teamNames[0] || '', '2024-01-15'],
    ['NV002', 'Trần Thị B', 'Worker', teamNames[0] || '', '2024-02-01'],
    ['NV003', 'Lê Văn C', 'SubLeader', teamNames[0] || '', '2023-10-01'],
    ['NV004', 'Phạm Văn D', 'Leader', teamNames[1] || teamNames[0] || '', '2022-05-20'],
  ];

  const wb = XLSX.utils.book_new();
  const wsData = XLSX.utils.aoa_to_sheet(data);

  // Column widths
  wsData['!cols'] = [
    { wch: 15 }, // Mã NV
    { wch: 28 }, // Họ tên
    { wch: 18 }, // Chức vụ
    { wch: 22 }, // Nhóm
    { wch: 18 }, // Ngày vào làm
  ];

  XLSX.utils.book_append_sheet(wb, wsData, 'Danh sách nhân viên');

  // --- Sheet 2: Hướng dẫn (Guide) ---
  const guideData = [
    ['Trường dữ liệu', 'Hướng dẫn nhập liệu'],
    ['Mã NV', 'Mã nhân viên duy nhất, dùng để nhận dạng khi import cập nhật.'],
    ['Họ tên', 'Tên đầy đủ của nhân viên.'],
    ['Chức vụ', `Chọn đúng 1 trong các giá trị: ${VALID_ROLES.join(', ')} (hoặc Công nhân, Nhân viên)`],
    ['Nhóm', `Nhập đúng tên nhóm. Các nhóm hiện có: ${teamNames.join(', ')}. Manager không cần nhóm.`],
    ['Ngày vào làm', 'Định dạng chuẩn: YYYY-MM-DD (VD: 2024-01-15)']
  ];

  const wsGuide = XLSX.utils.aoa_to_sheet(guideData);
  wsGuide['!cols'] = [
    { wch: 20 },
    { wch: 80 }
  ];

  XLSX.utils.book_append_sheet(wb, wsGuide, 'Hướng dẫn');

  // --- Export ---
  XLSX.writeFile(wb, 'Mau_Nhap_Nhan_Vien.xlsx');
}
