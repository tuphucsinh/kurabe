const fs = require('fs');

const tour = {
  "name": "Kurabe Codebase Tour",
  "description": "Hướng dẫn khám phá cấu trúc và luồng xử lý chính của dự án Kurabe.",
  "entryPoints": [
    {
      "file": "src/app/layout.tsx",
      "description": "Root layout chứa cấu trúc khung, AuthContext, QueryProvider và Sidebar."
    },
    {
      "file": "src/app/page.tsx",
      "description": "Điểm bắt đầu của ứng dụng, thường điều hướng đến Dashboard hoặc Login."
    }
  ],
  "highlights": [
    {
      "title": "Authentication System",
      "files": ["src/contexts/AuthContext.tsx", "src/app/login/page.tsx"],
      "description": "Quản lý trạng thái đăng nhập và bảo mật các routes."
    },
    {
      "title": "Criteria Management",
      "files": ["src/app/criteria/page.tsx", "src/actions/criteria.ts", "src/lib/db/criteria.ts"],
      "description": "Quản lý các tiêu chí đánh giá (CRUD) thông qua Server Actions và Supabase."
    },
    {
      "title": "Evaluation Engine",
      "files": ["src/app/evaluations/[id]/page.tsx", "src/actions/evaluation.ts", "src/lib/scoring.ts"],
      "description": "Logic cốt lõi để thực hiện và tính toán điểm đánh giá nhân viên."
    },
    {
      "title": "Reporting & Charts",
      "files": ["src/app/reports/page.tsx", "src/components/charts/GradeDistribution.tsx"],
      "description": "Trực quan hóa dữ liệu đánh giá thông qua các biểu đồ."
    }
  ],
  "techStack": ["Next.js (App Router)", "TypeScript", "Supabase", "TailwindCSS", "Lucide React"]
};

fs.writeFileSync('d:/AI/Kurabe/.understand-anything/intermediate/tour-guide.json', JSON.stringify(tour, null, 2));
console.log('Successfully generated tour-guide.json');
