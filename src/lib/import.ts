import * as XLSX from 'xlsx';
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
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data, { type: 'array' });
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    
    // Convert to JSON with headers as keys
    const rows = XLSX.utils.sheet_to_json<any>(worksheet);

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
            const date = new Date(joinDate);
            if (!isNaN(date.getTime())) {
              formattedJoinDate = date.toISOString().split('T')[0];
            }
          }
        } catch (e) {
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
  } catch (error: any) {
    return {
      ...result,
      errorCount: 1,
      errors: [`Lỗi khi đọc file: ${error.message}`]
    };
  }
}

export async function downloadSampleExcel(teams: Team[]) {
  const ExcelJS = (await import('exceljs')).default;

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Danh sách nhân viên');
  const dataWs = wb.addWorksheet('Data', { state: 'hidden' });

  // --- Prepare Data Sheet for Dropdowns ---
  const teamNames = teams.map(t => t.name);
  
  // Write Roles to Data Sheet
  VALID_ROLES.forEach((role, i) => {
    dataWs.getCell(`A${i + 1}`).value = role;
  });
  
  // Write Teams to Data Sheet
  teamNames.forEach((teamName, i) => {
    dataWs.getCell(`B${i + 1}`).value = teamName;
  });

  // --- Headers ---
  const headerRow = ws.addRow(['Mã NV', 'Họ tên', 'Chức vụ', 'Nhóm', 'Ngày vào làm']);
  headerRow.eachCell(cell => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = {
      bottom: { style: 'thin', color: { argb: 'FF000000' } },
    };
  });

  // --- Column widths ---
  ws.columns = [
    { width: 15 },
    { width: 28 },
    { width: 18 },
    { width: 22 },
    { width: 18 },
  ];

  // --- Sample data (3 rows) ---
  const sampleRows = [
    ['NV001', 'Nguyễn Văn A', 'Employee', teamNames[0] || '', '2024-01-15'],
    ['NV002', 'Trần Thị B', 'SubLeader', teamNames[0] || '', '2023-10-01'],
    ['NV003', 'Lê Văn C', 'Leader', teamNames[1] || teamNames[0] || '', '2022-05-20'],
  ];
  sampleRows.forEach(row => ws.addRow(row));

  // --- Data Validation (dropdown) cho 1000 dòng dữ liệu ---
  const maxRow = 1001; // header + 1000 rows
  for (let r = 2; r <= maxRow; r++) {
    // Cột C (Chức vụ)
    ws.getCell(`C${r}`).dataValidation = {
      type: 'list',
      allowBlank: false,
      formulae: [`Data!$A$1:$A$${VALID_ROLES.length}`],
      showErrorMessage: true,
      errorTitle: 'Chức vụ không hợp lệ',
      error: `Vui lòng chọn từ danh sách có sẵn.`,
    };
    // Cột D (Nhóm)
    if (teamNames.length > 0) {
      ws.getCell(`D${r}`).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [`Data!$B$1:$B$${teamNames.length}`],
        showErrorMessage: true,
        errorTitle: 'Nhóm không hợp lệ',
        error: `Vui lòng chọn nhóm có sẵn trong danh sách.`,
      };
    }
  }

  // --- Ghi chú hướng dẫn ---
  ws.getCell('A1').note = 'Mã nhân viên duy nhất, dùng để nhận dạng khi import cập nhật.';
  ws.getCell('C1').note = 'Chọn từ danh sách: Manager, Leader, SubLeader, Employee';
  ws.getCell('D1').note = 'Chọn nhóm từ danh sách. Manager không cần chọn nhóm.';
  ws.getCell('E1').note = 'Định dạng: YYYY-MM-DD (VD: 2024-01-15)';

  // --- Export ---
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'Mau_Nhap_Nhan_Vien.xlsx';
  a.click();
  URL.revokeObjectURL(url);
}
