import { 
  CriteriaRole, 
  Criterion, 
  CriteriaGroup, 
  Role 
} from '@/types';

const BOTH: Role[] = ['Manager', 'Leader', 'SubLeader', 'Employee'];
const LEADER: Role[] = ['Manager', 'Leader'];
const STAFF: Role[] = ['SubLeader', 'Employee'];

export const allCriteria: CriteriaGroup[] = [
  {
    id: 'A',
    code: 'A',
    name: 'Tính kỷ luật (Discipline)',
    shortName: 'Kỷ luật',
    criteria: [
      {
        id: 'A1',
        code: 'A1',
        name: 'Tỷ lệ hiện diện',
        appliesTo: BOTH,
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
        code: 'A2',
        name: 'Số lần vắng mặt không phép',
        appliesTo: BOTH,
        levels: [
          { points: 3, label: '0 lần' },
          { points: -3, label: '1 lần' },
          { points: -6, label: '2 lần trở lên' },
        ]
      },
      {
        id: 'A3',
        code: 'A3',
        name: 'Số lần đến trễ, về sớm',
        appliesTo: BOTH,
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
        code: 'A4',
        name: 'Vi phạm ATGT (Mũ bảo hiểm/Quai nón)',
        description: 'Đánh giá việc chấp hành luật an toàn giao thông đường bộ, đặc biệt là quy định đội mũ bảo hiểm và cài quai nón đúng cách khi vào bãi xe công ty.',
        appliesTo: BOTH,
        levels: [
          { points: 0, label: '0 lần' },
          { points: -3, label: '1 lần' },
          { points: -6, label: '2 lần' },
          { points: -10, label: '3 lần trở lên' },
        ]
      },
      {
        id: 'A5',
        code: 'A5',
        name: 'Thực hiện 6S',
        appliesTo: BOTH,
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
        code: 'A6',
        name: 'Biên bản cảnh cáo',
        appliesTo: BOTH,
        levels: [
          { points: -3, label: 'Biên bản cảnh cáo' }
        ]
      },
      {
        id: 'A7',
        code: 'A7',
        name: 'Biên bản 1',
        appliesTo: BOTH,
        levels: [
          { points: -10, label: 'Biên bản 1' }
        ]
      },
      {
        id: 'A8',
        code: 'A8',
        name: 'Biên bản 2',
        appliesTo: BOTH,
        levels: [
          { points: -15, label: 'Biên bản 2' }
        ]
      },
      {
        id: 'A9',
        code: 'A9',
        name: 'Biên bản 3',
        appliesTo: BOTH,
        levels: [
          { points: -30, label: 'Biên bản 3' }
        ]
      }
    ]
  },
  {
    id: 'B',
    code: 'B',
    name: 'Tính hợp tác (Cooperation)',
    shortName: 'Hợp tác',
    criteria: [
      {
        id: 'B1',
        code: 'B1',
        name: 'Thuận thảo và hợp tác',
        appliesTo: BOTH,
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
        code: 'B2',
        name: 'Thái độ chuyển đổi/hỗ trợ BP',
        appliesTo: BOTH,
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
        code: 'B3',
        name: 'Sẵn sàng tham gia ngoài giờ',
        appliesTo: LEADER,
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
    code: 'C',
    name: 'Tính tích cực (Proactivity)',
    shortName: 'Tích cực',
    criteria: [
      {
        id: 'C1',
        code: 'C1',
        name: 'Nỗ lực nâng cao trình độ',
        appliesTo: BOTH,
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
        code: 'C2',
        name: 'Sẵn sàng nhận thêm việc',
        appliesTo: BOTH,
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
        code: 'C3',
        name: 'Tham gia đề án (kaizen)',
        appliesTo: BOTH,
        levels: [
          { points: 5, label: 'Trên 3 vụ' },
          { points: 3, label: '2 vụ' },
          { points: 1, label: '1 vụ' },
        ]
      },
      {
        id: 'C4',
        code: 'C4',
        name: '"Hãy để việc đó cho tôi làm"',
        appliesTo: STAFF,
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
    code: 'D',
    name: 'Tính trách nhiệm (Responsibility)',
    shortName: 'Trách nhiệm',
    criteria: [
      {
        id: 'D1',
        code: 'D1',
        name: 'Đùn đẩy trách nhiệm',
        appliesTo: BOTH,
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
        code: 'D2',
        name: 'Đối ứng khiếu nại',
        appliesTo: BOTH,
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
        code: 'D3',
        name: 'HO-REN-SO',
        appliesTo: BOTH,
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
        code: 'D4',
        name: 'Ứng phó thất bại cấp dưới',
        appliesTo: LEADER,
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
    code: 'E',
    name: 'Năng lực thực hiện (Competency)',
    shortName: 'Năng lực',
    criteria: [
      {
        id: 'E1',
        code: 'E1',
        name: 'Kỹ năng, kiến thức công việc',
        appliesTo: BOTH,
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
        code: 'E2',
        name: 'Khả năng cải tiến',
        appliesTo: BOTH,
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
        code: 'E3',
        name: 'Thương lượng, thuyết phục',
        appliesTo: BOTH,
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
        code: 'E4',
        name: 'Lập kế hoạch công việc',
        appliesTo: BOTH,
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
        code: 'E5',
        name: 'Thực hiện ISO QLCL',
        appliesTo: BOTH,
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
        code: 'E6',
        name: 'Khả năng quản lý',
        appliesTo: LEADER,
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
        code: 'E7',
        name: 'Khả năng đào tạo',
        appliesTo: LEADER,
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
    code: 'F',
    name: 'Thành tích (Achievements)',
    shortName: 'Thành tích',
    criteria: [
      {
        id: 'F1',
        code: 'F1',
        name: 'Xử trí bất thường',
        appliesTo: BOTH,
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
        code: 'F2',
        name: 'Khối lượng hoàn thành',
        appliesTo: STAFF,
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
        code: 'F3',
        name: 'Chất lượng hoàn thành',
        appliesTo: STAFF,
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
        code: 'F4',
        name: 'Lặp lại sai sót',
        appliesTo: STAFF,
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
        code: 'F5',
        name: 'Nhân viên đa năng',
        appliesTo: STAFF,
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
        code: 'F6',
        name: 'Giảm hàng hư BP phụ trách',
        appliesTo: LEADER,
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
        code: 'F7',
        name: 'Quản lý giờ giấc cấp dưới',
        appliesTo: LEADER,
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
        code: 'F8',
        name: 'Bố trí người khi cấp bách',
        appliesTo: LEADER,
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
        code: 'F9',
        name: 'Đào tạo NV chủ chốt/đa năng',
        appliesTo: LEADER,
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
  return allCriteria.map(group => {
    const filteredCriteria = group.criteria.filter(
      c => c.appliesTo.includes(role)
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

