'use client';

import { QueryClient, QueryClientProvider, QueryCache } from '@tanstack/react-query';
import { ReactNode, useState } from 'react';
import { showToast } from '@/components/ui/Toast';

export default function QueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000,
        retry: 1,
        // App nội bộ — dữ liệu đổi qua chính app; focus tab không cần refetch query nặng (C5)
        refetchOnWindowFocus: false,
      },
    },
    queryCache: new QueryCache({
      onError: (error) => {
        showToast(error.message || 'Lỗi tải dữ liệu.', 'error');
      }
    }),
    // MutationCache KHÔNG có onError global — mọi mutation đều có onError local ở page,
    // nếu thêm global sẽ hiển thị 2 toast trùng nội dung (verified 2026-08-12 rule leader).
  }));

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
