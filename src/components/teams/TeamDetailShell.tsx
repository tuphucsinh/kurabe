'use client';

import { ReactNode } from 'react';

interface TeamDetailShellProps {
  children: ReactNode;
}

export default function TeamDetailShell({ children }: TeamDetailShellProps) {
  return (
    <div
      className="px-6 md:px-10 lg:px-12 py-8 lg:py-5 space-y-6 lg:space-y-4 animate-in fade-in duration-500 w-full max-w-[1600px] mx-auto max-md:bg-gradient-to-b max-md:from-brand/5 max-md:via-amber-50/20 max-md:to-transparent md:bg-none"
      data-load-layer="shell"
    >
      {children}
    </div>
  );
}
