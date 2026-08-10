'use client';

import { QueryClient, QueryClientProvider, QueryCache, MutationCache } from '@tanstack/react-query';
import { ReactNode, useState } from 'react';
import { showToast } from '@/components/ui/Toast';

export default function QueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000,
        retry: 1,
      },
    },
    queryCache: new QueryCache({
      onError: (error) => {
        showToast(error.message || 'Lỗi tải dữ liệu.', 'error');
      }
    }),
    mutationCache: new MutationCache({
      onError: (error) => {
        showToast(error.message || 'Có lỗi xảy ra khi thực hiện thao tác.', 'error');
      },
    }),
  }));

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
