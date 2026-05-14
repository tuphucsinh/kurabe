'use client';

import { QueryClient, QueryClientProvider, QueryCache, MutationCache } from '@tanstack/react-query';
import { ReactNode, useState } from 'react';
import { toast } from 'sonner';

export default function QueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000,
        retry: 1,
      },
    },
    mutationCache: new MutationCache({
      onError: (error) => {
        toast.error(error.message || 'Có lỗi xảy ra khi thực hiện thao tác.');
      },
    }),
  }));

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
