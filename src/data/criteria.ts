export type CriteriaRole = 'Leader' | 'Employee';
export type AppliesTo = 'both' | 'leader' | 'staff';

export interface CriterionLevel {
  points: number;
  label: string;
  description?: string;
}

export interface Criterion {
  id: string;
  name: string;
  levels: CriterionLevel[];
  appliesTo: AppliesTo;
  weight?: number;
}

export interface CriteriaGroup {
  id: string;
  name: string;
  criteria: Criterion[];
}

export const allCriteria: CriteriaGroup[] = [
  {
    id: 'A',
    name: 'Tính kỷ luật (Discipline)',
    criteria: [
      {
        id: 'A1',
        name: 'Tỷ lệ hiện diện',
        appliesTo: 'both',
        levels: [
          { points: 3, label: 'Trên 99%' },
          { points: 2, label: 'Trên 98%' },
          { points: 1, label: 'Trên 95%' },
          { points: -3, label: 'Dưới 95%' },
          { points: -6, label: 'Dưới 93%' },
        ]
      },
      {
        id: 'A2',
        name: 'Số lần vắng mặt không phép',
        appliesTo: 'both',
        levels: [
          { points: 3, label: '0 lần' },
          { points: -3, label: '1 lần' },
          { points: -6, label: '2 lần trở lên' },
        ]
      },
      {
        id: 'A3',
        name: 'Số lần đến trễ, về sớm',
        appliesTo: 'both',
        levels: [
          { points: 3, label: '0 lần' },
          { points: 0, label: '1 lần' },
          { points: -1, label: '2 lần' },
          { points: -3, label: '3 lần' },
          { points: -6, label: '4 lần trở lên' },
        ]
      },
      {
        id: 'A4',
        name: 'Vi phạm ATGT (Mũ bảo hiểm/Quai nón)',
        appliesTo: 'both',
        levels: [
          { points: 0, label: '0 lần' },
          { points: -3, label: '1 lần' },
          { points: -6, label: '2 lần' },
          { points: -10, label: '3 lần trở lên' },
        ]
      },
      {
        id: 'A5',
        name: 'Thực hiện 6S',
        appliesTo: 'both',
        levels: [
          { points: 3, label: 'Rất tốt' },
          { points: 2, label: 'Tốt' },
          { points: 1, label: 'Bình thường' },
          { points: -1, label: 'Kém' },
          { points: -2, label: 'Rất kém' },
        ]
      },
      {
        id: 'A6',
        name: 'Biên bản cảnh cáo',
        appliesTo: 'both',
        levels: [
          { points: -3, label: 'Biên bản cảnh cáo' }
        ]
      },
      {
        id: 'A7',
        name: 'Biên bản 1',
        appliesTo: 'both',
        levels: [
          { points: -10, label: 'Biên bản 1' }
        ]
      },
      {
        id: 'A8',
        name: 'Biên bản 2',
        appliesTo: 'both',
        levels: [
          { points: -15, label: 'Biên bản 2' }
        ]
      },
      {
        id: 'A9',
        name: 'Biên bản 3',
        appliesTo: 'both',
        levels: [
          { points: -30, label: 'Biên bản 3' }
        ]
      }
    ]
  },
  {
    id: 'B',
    name: 'Tính hợp tác (Cooperation)',
    criteria: [
      {
        id: 'B1',
        name: 'Thuận thảo và hợp tác',
        appliesTo: 'both',
        levels: [
          { points: 5, label: 'Rất tốt' },
          { points: 4, label: 'Tốt' },
          { points: 3, label: 'Bình thường' },
          { points: 2, label: 'Kém' },
          { points: 1, label: 'Rất kém' },
        ]
      },
      {
        id: 'B2',
        name: 'Thái độ chuyển đổi/hỗ trợ BP',
        appliesTo: 'both',
        levels: [
          { points: 5, label: 'Rất tốt' },
          { points: 4, label: 'Tốt' },
          { points: 3, label: 'Bình thường' },
          { points: 2, label: 'Kém' },
          { points: 1, label: 'Rất kém' },
        ]
      },
      {
        id: 'B3',
        name: 'Sẵn sàng tham gia ngoài giờ',
        appliesTo: 'leader',
        levels: [
          { points: 5, label: 'Rất tốt' },
          { points: 4, label: 'Tốt' },
          { points: 3, label: 'Bình thường' },
          { points: 2, label: 'Kém' },
          { points: 1, label: 'Rất kém' },
        ]
      }
    ]
  },
  {
    id: 'C',
    name: 'Tính tích cực (Proactivity)',
    criteria: [
      {
        id: 'C1',
        name: 'Nỗ lực nâng cao trình độ',
        appliesTo: 'both',
        levels: [
          { points: 5, label: 'Rất tốt' },
          { points: 4, label: 'Tốt' },
          { points: 3, label: 'Bình thường' },
          { points: 2, label: 'Kém' },
          { points: 1, label: 'Rất kém' },
        ]
      },
      {
        id: 'C2',
        name: 'Sẵn sàng nhận thêm việc',
        appliesTo: 'both',
        levels: [
          { points: 5, label: 'Sẵn sàng nhận thêm nhiều việc' },
          { points: 4, label: 'Thêm 2 việc' },
          { points: 3, label: 'Thêm 1 việc' },
          { points: 2, label: 'Từ chối 1 lần' },
          { points: 1, label: 'Từ chối từ 2 lần' },
        ]
      },
      {
        id: 'C3',
        name: 'Tham gia đề án (kaizen)',
        appliesTo: 'both',
        levels: [
          { points: 5, label: 'Trên 3 vụ' },
          { points: 3, label: '2 vụ' },
          { points: 1, label: '1 vụ' },
        ]
      },
      {
        id: 'C4',
        name: '"Hãy để việc đó cho tôi làm"',
        appliesTo: 'staff',
        levels: [
          { points: 5, label: 'Luôn luôn' },
          { points: 4, label: '3 lần' },
          { points: 3, label: '2 lần' },
          { points: 2, label: '1 lần' },
          { points: 1, label: '0 lần' },
        ]
      }
    ]
  },
  {
    id: 'D',
    name: 'Tính trách nhiệm (Responsibility)',
    criteria: [
      {
        id: 'D1',
        name: 'Đùn đẩy trách nhiệm',
        appliesTo: 'both',
        levels: [
          { points: 5, label: 'Hoàn toàn không' },
          { points: 4, label: '1 lần' },
          { points: 3, label: '2 lần' },
          { points: 2, label: 'Đôi khi' },
          { points: 1, label: 'Luôn luôn' },
        ]
      },
      {
        id: 'D2',
        name: 'Đối ứng khiếu nại',
        appliesTo: 'both',
        levels: [
          { points: 5, label: 'Rất nhanh, rất tốt' },
          { points: 4, label: 'Nhanh, khá tốt' },
          { points: 3, label: 'Bình thường' },
          { points: 2, label: 'Chậm, kém' },
          { points: 1, label: 'Rất chậm, rất kém' },
        ]
      },
      {
        id: 'D3',
        name: 'HO-REN-SO',
        appliesTo: 'both',
        levels: [
          { points: 5, label: 'Rất tốt' },
          { points: 4, label: 'Tốt' },
          { points: 3, label: 'Bình thường' },
          { points: 2, label: 'Kém' },
          { points: 1, label: 'Rất kém' },
        ]
      },
      {
        id: 'D4',
        name: 'Ứng phó thất bại cấp dưới',
        appliesTo: 'leader',
        levels: [
          { points: 5, label: 'Luôn luôn nhanh chóng' },
          { points: 4, label: 'Nhanh' },
          { points: 3, label: 'Bình thường' },
          { points: 2, label: 'Không' },
          { points: 1, label: 'Luôn tránh né' },
        ]
      }
    ]
  },
  {
    id: 'E',
    name: 'Năng lực thực hiện (Competency)',
    criteria: [
      {
        id: 'E1',
        name: 'Kỹ năng, kiến thức công việc',
        appliesTo: 'both',
        levels: [
          { points: 5, label: 'Rất tốt' },
          { points: 4, label: 'Tốt' },
          { points: 3, label: 'Bình thường' },
          { points: 2, label: 'Kém' },
          { points: 1, label: 'Rất kém' },
        ]
      },
      {
        id: 'E2',
        name: 'Khả năng cải tiến',
        appliesTo: 'both',
        levels: [
          { points: 5, label: 'Rất tốt' },
          { points: 4, label: 'Tốt' },
          { points: 3, label: 'Bình thường' },
          { points: 2, label: 'Kém' },
          { points: 1, label: 'Rất kém' },
        ]
      },
      {
        id: 'E3',
        name: 'Thương lượng, thuyết phục',
        appliesTo: 'both',
        levels: [
          { points: 5, label: 'Rất tốt' },
          { points: 4, label: 'Tốt' },
          { points: 3, label: 'Bình thường' },
          { points: 2, label: 'Kém' },
          { points: 1, label: 'Rất kém' },
        ]
      },
      {
        id: 'E4',
        name: 'Lập kế hoạch công việc',
        appliesTo: 'both',
        levels: [
          { points: 5, label: 'Rất tốt' },
          { points: 4, label: 'Tốt' },
          { points: 3, label: 'Bình thường' },
          { points: 2, label: 'Kém' },
          { points: 1, label: 'Rất kém' },
        ]
      },
      {
        id: 'E5',
        name: 'Thực hiện ISO QLCL',
        appliesTo: 'both',
        levels: [
          { points: 5, label: 'Rất tốt' },
          { points: 4, label: 'Tốt' },
          { points: 3, label: 'Bình thường' },
          { points: 2, label: 'Kém' },
          { points: 1, label: 'Rất kém' },
        ]
      },
      {
        id: 'E6',
        name: 'Khả năng quản lý',
        appliesTo: 'leader',
        levels: [
          { points: 5, label: 'Rất tốt' },
          { points: 4, label: 'Tốt' },
          { points: 3, label: 'Bình thường' },
          { points: 2, label: 'Kém' },
          { points: 1, label: 'Rất kém' },
        ]
      },
      {
        id: 'E7',
        name: 'Khả năng đào tạo',
        appliesTo: 'leader',
        levels: [
          { points: 5, label: 'Rất tốt' },
          { points: 4, label: 'Tốt' },
          { points: 3, label: 'Bình thường' },
          { points: 2, label: 'Kém' },
          { points: 1, label: 'Rất kém' },
        ]
      }
    ]
  },
  {
    id: 'F',
    name: 'Thành tích (Achievements)',
    criteria: [
      {
        id: 'F1',
        name: 'Xử trí bất thường',
        appliesTo: 'both',
        levels: [
          { points: 15, label: 'Rất tốt' },
          { points: 12, label: 'Tốt' },
          { points: 9, label: 'Bình thường' },
          { points: 6, label: 'Kém' },
          { points: 3, label: 'Rất kém' },
        ]
      },
      {
        id: 'F2',
        name: 'Khối lượng hoàn thành',
        appliesTo: 'staff',
        levels: [
          { points: 15, label: 'Rất cao' },
          { points: 12, label: 'Cao' },
          { points: 9, label: 'Bình thường' },
          { points: 6, label: 'Thấp' },
          { points: 3, label: 'Rất thấp' },
        ]
      },
      {
        id: 'F3',
        name: 'Chất lượng hoàn thành',
        appliesTo: 'staff',
        levels: [
          { points: 15, label: 'Rất tốt' },
          { points: 12, label: 'Tốt' },
          { points: 9, label: 'Bình thường' },
          { points: 6, label: 'Kém' },
          { points: 3, label: 'Rất kém' },
        ]
      },
      {
        id: 'F4',
        name: 'Lặp lại sai sót',
        appliesTo: 'staff',
        levels: [
          { points: 15, label: 'Không lặp lại' },
          { points: 12, label: 'Rất ít' },
          { points: 9, label: 'Thỉnh thoảng' },
          { points: 6, label: 'Nhiều' },
          { points: 3, label: 'Rất nhiều' },
        ]
      },
      {
        id: 'F5',
        name: 'Nhân viên đa năng',
        appliesTo: 'staff',
        levels: [
          { points: 15, label: 'Rất tốt' },
          { points: 12, label: 'Tốt' },
          { points: 9, label: 'Bình thường' },
          { points: 6, label: 'Kém' },
          { points: 3, label: 'Rất kém' },
        ]
      },
      {
        id: 'F6',
        name: 'Giảm hàng hư BP phụ trách',
        appliesTo: 'leader',
        levels: [
          { points: 15, label: 'Rất tốt' },
          { points: 12, label: 'Tốt' },
          { points: 9, label: 'Bình thường' },
          { points: 6, label: 'Kém' },
          { points: 3, label: 'Rất kém' },
        ]
      },
      {
        id: 'F7',
        name: 'Quản lý giờ giấc cấp dưới',
        appliesTo: 'leader',
        levels: [
          { points: 15, label: 'Rất tốt' },
          { points: 12, label: 'Tốt' },
          { points: 9, label: 'Bình thường' },
          { points: 6, label: 'Kém' },
          { points: 3, label: 'Rất kém' },
        ]
      },
      {
        id: 'F8',
        name: 'Bố trí người khi cấp bách',
        appliesTo: 'leader',
        levels: [
          { points: 15, label: 'Rất tốt' },
          { points: 12, label: 'Tốt' },
          { points: 9, label: 'Bình thường' },
          { points: 6, label: 'Kém' },
          { points: 3, label: 'Rất kém' },
        ]
      },
      {
        id: 'F9',
        name: 'Đào tạo NV chủ chốt/đa năng',
        appliesTo: 'leader',
        levels: [
          { points: 15, label: 'Rất tốt' },
          { points: 12, label: 'Tốt' },
          { points: 9, label: 'Bình thường' },
          { points: 6, label: 'Kém' },
          { points: 3, label: 'Rất kém' },
        ]
      }
    ]
  }
];

export function getCriteriaForRole(role: CriteriaRole): CriteriaGroup[] {
  const targetAppliesTo = role === 'Leader' ? 'leader' : 'staff';
  
  return allCriteria.map(group => {
    const filteredCriteria = group.criteria.filter(
      c => c.appliesTo === 'both' || c.appliesTo === targetAppliesTo
    );
    
    if (filteredCriteria.length === 0) return null;
    
    return {
      ...group,
      criteria: filteredCriteria
    };
  }).filter((group): group is CriteriaGroup => group !== null);
}

export const gradingLeader = [
  { grade: 'S', minScore: 170 },
  { grade: 'A', minScore: 160, maxScore: 170 },
  { grade: 'AB', minScore: 130, maxScore: 159 },
  { grade: 'B', minScore: 100, maxScore: 129 },
  { grade: 'C', minScore: 70, maxScore: 99 },
  { grade: 'D', maxScore: 70 },
];

export const gradingStaff = [
  { grade: 'S', minScore: 155 },
  { grade: 'A', minScore: 145, maxScore: 155 },
  { grade: 'AB', minScore: 115, maxScore: 144 },
  { grade: 'B', minScore: 90, maxScore: 114 },
  { grade: 'C', minScore: 60, maxScore: 89 },
  { grade: 'D', maxScore: 60 },
];

