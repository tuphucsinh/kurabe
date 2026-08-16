import { User, Role, Team } from '@/types';

export interface ImportResult {
  successCount: number;
  errorCount: number;
  errors: string[];
  data: Partial<User>[];
}

const VALID_ROLES: Role[] = ['Manager', 'Leader', 'SubLeader', 'Employee'];

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
        const foundRole = VALID_ROLES.find(r => r.toLowerCase() === roleStr.toLowerCase());
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
      if (joinDate) {
        try {
          if (typeof joinDate === 'number') {
            // Excel serial date
            const date = new Date(Math.round((joinDate - 25569) * 86400 * 1000));
            formattedJoinDate = date.toISOString().split('T')[0];
          } else {
            const date = new Date(joinDate as string | number | Date);
            if (!isNaN(date.getTime())) {
              formattedJoinDate = date.toISOString().split('T')[0];
            }
          }
        } catch {
          // Ignore date error, just keep empty
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
    ['NV002', 'Trần Thị B', 'SubLeader', teamNames[0] || '', '2023-10-01'],
    ['NV003', 'Lê Văn C', 'Leader', teamNames[1] || teamNames[0] || '', '2022-05-20'],
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
    ['Chức vụ', `Chọn đúng 1 trong các giá trị: ${VALID_ROLES.join(', ')}`],
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
