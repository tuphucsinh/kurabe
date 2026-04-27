
export interface CriterionLevel {
  points: number;
  label: string;
  description?: string;
}

export interface Criterion {
  id: string;
  name: string;
  levels: CriterionLevel[];
  weight?: number; // Optional, can be used for total calculation
}

export interface CriteriaGroup {
  id: string;
  name: string;
  criteria: Criterion[];
}

export const leaderCriteria: CriteriaGroup[] = [
  {
    id: 'A',
    name: 'Tính kỷ luật (Discipline)',
    criteria: [
      {
        id: 'A1',
        name: 'Tỷ lệ hiện diện',
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
        levels: [
          { points: 3, label: '0 lần' },
          { points: -3, label: '1 lần' },
          { points: -6, label: '2 lần trở lên' },
        ]
      },
      {
        id: 'A3',
        name: 'Số lần đến trễ, về sớm',
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
        levels: [
          { points: 3, label: 'Rất tốt' },
          { points: 2, label: 'Tốt' },
          { points: 1, label: 'Bình thường' },
          { points: -1, label: 'Kém' },
          { points: -2, label: 'Rất kém' },
        ]
      },
      {
        id: 'A-Penalties',
        name: 'Biên bản vi phạm',
        levels: [
          { points: -3, label: 'Biên bản cảnh cáo' },
          { points: -10, label: 'Biên bản 1' },
          { points: -15, label: 'Biên bản 2' },
          { points: -30, label: 'Biên bản 3' },
        ]
      }
    ]
  },
  {
    id: 'B',
    name: 'Tính hợp tác (Cooperation)',
    criteria: [
      {
        id: 'B10',
        name: 'Thuận thảo và hợp tác với đồng nghiệp',
        levels: [
          { points: 5, label: 'Rất tốt' },
          { points: 4, label: 'Tốt' },
          { points: 3, label: 'Bình thường' },
          { points: 2, label: 'Kém' },
          { points: 1, label: 'Rất kém' },
        ]
      },
      {
        id: 'B11',
        name: 'Sẵn sàng tham gia công việc ngoài giờ/khác giờ',
        levels: [
          { points: 5, label: 'Rất tốt' },
          { points: 4, label: 'Tốt' },
          { points: 3, label: 'Bình thường' },
          { points: 2, label: 'Kém' },
          { points: 1, label: 'Rất kém' },
        ]
      },
      {
        id: 'B12',
        name: 'Thái độ khi chuyển đổi/hỗ trợ bộ phận khác',
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
        id: 'C13',
        name: 'Nỗ lực nâng cao trình độ, kỹ năng',
        levels: [
          { points: 5, label: 'Rất tốt' },
          { points: 4, label: 'Tốt' },
          { points: 3, label: 'Bình thường' },
          { points: 2, label: 'Kém' },
          { points: 1, label: 'Rất kém' },
        ]
      },
      {
        id: 'C14',
        name: 'Sẵn sàng nhận thêm việc khi người khác vắng',
        levels: [
          { points: 5, label: 'Sẵn sàng nhận thêm nhiều việc' },
          { points: 4, label: 'Thêm 2 việc' },
          { points: 3, label: 'Thêm 1 việc' },
          { points: 2, label: 'Từ chối 1 lần' },
          { points: 1, label: 'Từ chối từ 2 lần' },
        ]
      },
      {
        id: 'C15',
        name: 'Tham gia hoạt động đề án (chi phí, leadtime...)',
        levels: [
          { points: 5, label: 'Trên 3 vụ' },
          { points: 3, label: '2 vụ' },
          { points: 1, label: '1 vụ' },
        ]
      }
    ]
  },
  {
    id: 'D',
    name: 'Tính trách nhiệm (Responsibility)',
    criteria: [
      {
        id: 'D16',
        name: 'Sẵn sàng ứng phó với thất bại của cấp dưới',
        levels: [
          { points: 5, label: 'Luôn luôn nhanh chóng' },
          { points: 4, label: 'Nhanh' },
          { points: 3, label: 'Bình thường' },
          { points: 2, label: 'Không' },
          { points: 1, label: 'Luôn tránh né' },
        ]
      },
      {
        id: 'D17',
        name: 'Đối ứng khiếu nại, phàn nàn',
        levels: [
          { points: 5, label: 'Rất nhanh, rất tốt' },
          { points: 4, label: 'Nhanh, khá tốt' },
          { points: 3, label: 'Bình thường' },
          { points: 2, label: 'Chậm, kém' },
          { points: 1, label: 'Rất chậm, rất kém' },
        ]
      },
      {
        id: 'D18',
        name: 'Thực hiện HO-REN-SO (Báo cáo-Liên lạc-Thảo luận)',
        levels: [
          { points: 5, label: 'Rất tốt' },
          { points: 4, label: 'Tốt' },
          { points: 3, label: 'Bình thường' },
          { points: 2, label: 'Kém' },
          { points: 1, label: 'Rất kém' },
        ]
      },
      {
        id: 'D19',
        name: 'Đùn đẩy trách nhiệm về thất bại bản thân',
        levels: [
          { points: 5, label: 'Hoàn toàn không' },
          { points: 4, label: '1 lần' },
          { points: 3, label: '2 lần' },
          { points: 2, label: 'Đôi khi' },
          { points: 1, label: 'Luôn luôn' },
        ]
      }
    ]
  },
  {
    id: 'E',
    name: 'Năng lực thực hiện công việc (Competency)',
    criteria: [
      {
        id: 'E20',
        name: 'Được trang bị đủ kỹ năng, kiến thức cho công việc',
        levels: [
          { points: 5, label: 'Rất tốt' },
          { points: 4, label: 'Tốt' },
          { points: 3, label: 'Bình thường' },
          { points: 2, label: 'Kém' },
          { points: 1, label: 'Rất kém' },
        ]
      },
      {
        id: 'E21',
        name: 'Khả năng cải tiến trong công việc',
        levels: [
          { points: 5, label: 'Rất tốt' },
          { points: 4, label: 'Tốt' },
          { points: 3, label: 'Bình thường' },
          { points: 2, label: 'Kém' },
          { points: 1, label: 'Rất kém' },
        ]
      },
      {
        id: 'E22',
        name: 'Khả năng quản lý',
        levels: [
          { points: 5, label: 'Rất tốt' },
          { points: 4, label: 'Tốt' },
          { points: 3, label: 'Bình thường' },
          { points: 2, label: 'Kém' },
          { points: 1, label: 'Rất kém' },
        ]
      },
      {
        id: 'E23',
        name: 'Khả năng đào tạo',
        levels: [
          { points: 5, label: 'Rất tốt' },
          { points: 4, label: 'Tốt' },
          { points: 3, label: 'Bình thường' },
          { points: 2, label: 'Kém' },
          { points: 1, label: 'Rất kém' },
        ]
      },
      {
        id: 'E24',
        name: 'Khả năng thương lượng, thuyết phục',
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
        id: 'F27',
        name: 'Giảm hàng hư/sai sót trong bộ phận phụ trách',
        levels: [
          { points: 15, label: 'Rất tốt' },
          { points: 12, label: 'Tốt' },
          { points: 9, label: 'Bình thường' },
          { points: 6, label: 'Kém' },
          { points: 3, label: 'Rất kém' },
        ]
      },
      {
        id: 'F28',
        name: 'Quản lý công việc, giờ giấc của cấp dưới',
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

export const staffCriteria: CriteriaGroup[] = [
  {
    id: 'A',
    name: 'Tính kỷ luật (Discipline)',
    criteria: leaderCriteria[0].criteria
  },
  {
    id: 'C',
    name: 'Tính hợp tác (Cooperation)',
    criteria: [
      {
        id: 'C10',
        name: 'Thuận thảo và hợp tác với đồng nghiệp',
        levels: [
          { points: 5, label: 'Rất tốt' },
          { points: 4, label: 'Tốt' },
          { points: 3, label: 'Bình thường' },
          { points: 2, label: 'Kém' },
          { points: 1, label: 'Rất kém' },
        ]
      },
      {
        id: 'C11',
        name: 'Thái độ khi hỗ trợ bộ phận khác (tăng ca, chuyển đổi...)',
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
    id: 'D',
    name: 'Tính tích cực (Proactivity)',
    criteria: [
      {
        id: 'D12',
        name: 'Nỗ lực nâng cao trình độ, kỹ năng',
        levels: [
          { points: 5, label: 'Rất tốt' },
          { points: 4, label: 'Tốt' },
          { points: 3, label: 'Bình thường' },
          { points: 2, label: 'Kém' },
          { points: 1, label: 'Rất kém' },
        ]
      },
      {
        id: 'D13',
        name: 'Đề nghị "Hãy để việc đó cho tôi làm"',
        levels: [
          { points: 5, label: 'Luôn luôn' },
          { points: 4, label: '3 lần' },
          { points: 3, label: '2 lần' },
          { points: 2, label: '1 lần' },
          { points: 1, label: '0 lần' },
        ]
      },
      {
        id: 'D14',
        name: 'Sẵn sàng nhận thêm việc khi người khác vắng',
        levels: [
          { points: 5, label: 'Sẵn sàng nhận thêm nhiều việc' },
          { points: 4, label: 'Thêm 2 việc' },
          { points: 3, label: 'Thêm 1 việc' },
          { points: 2, label: 'Từ chối 1 lần' },
          { points: 1, label: 'Từ chối từ 2 lần' },
        ]
      },
      {
        id: 'D15',
        name: 'Tham gia hoạt động đề án (chi phí, leadtime...)',
        levels: [
          { points: 5, label: 'Trên 3 vụ' },
          { points: 3, label: '2 vụ' },
          { points: 1, label: '1 vụ' },
        ]
      }
    ]
  },
  {
    id: 'E',
    name: 'Tính trách nhiệm (Responsibility)',
    criteria: [
      {
        id: 'E16',
        name: 'Đùn đẩy trách nhiệm về thất bại bản thân',
        levels: [
          { points: 5, label: 'Hoàn toàn không' },
          { points: 4, label: '1 lần' },
          { points: 3, label: '2 lần' },
          { points: 2, label: 'Đôi khi' },
          { points: 1, label: 'Luôn luôn' },
        ]
      },
      {
        id: 'E17',
        name: 'Đối ứng khiếu nại, phàn nàn',
        levels: [
          { points: 5, label: 'Rất nhanh, rất tốt' },
          { points: 4, label: 'Nhanh, khá tốt' },
          { points: 3, label: 'Bình thường' },
          { points: 2, label: 'Chậm, kém' },
          { points: 1, label: 'Rất chậm, rất kém' },
        ]
      },
      {
        id: 'E18',
        name: 'Thực hiện HO-REN-SO (Báo cáo-Liên lạc-Thảo luận)',
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
    name: 'Năng lực thực hiện công việc (Competency)',
    criteria: [
      {
        id: 'F19',
        name: 'Được trang bị đủ kỹ năng, kiến thức cho công việc',
        levels: [
          { points: 5, label: 'Rất tốt' },
          { points: 4, label: 'Tốt' },
          { points: 3, label: 'Bình thường' },
          { points: 2, label: 'Kém' },
          { points: 1, label: 'Rất kém' },
        ]
      },
      {
        id: 'F20',
        name: 'Khả năng cải tiến trong công việc',
        levels: [
          { points: 5, label: 'Rất tốt' },
          { points: 4, label: 'Tốt' },
          { points: 3, label: 'Bình thường' },
          { points: 2, label: 'Kém' },
          { points: 1, label: 'Rất kém' },
        ]
      }
      // Simplified for brevity, can be expanded
    ]
  },
  {
    id: 'G',
    name: 'Thành tích (Achievements)',
    criteria: [
      {
        id: 'G24',
        name: 'Khối lượng hoàn thành công việc được giao',
        levels: [
          { points: 15, label: 'Rất cao' },
          { points: 12, label: 'Cao' },
          { points: 9, label: 'Bình thường' },
          { points: 6, label: 'Thấp' },
          { points: 3, label: 'Rất thấp' },
        ]
      },
      {
        id: 'G25',
        name: 'Chất lượng công việc hoàn thành',
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
