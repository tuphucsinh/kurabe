'use client';

import { ReactNode } from 'react';

interface TeamsShellProps {
  children: ReactNode;
}

export default function TeamsShell({ children }: TeamsShellProps) {
  return (
    <div
      className="px-6 md:px-10 lg:px-12 py-8 space-y-8 animate-in fade-in duration-500 w-full max-w-[1600px] mx-auto max-md:bg-gradient-to-b max-md:from-primary/5 max-md:via-indigo-50/30 max-md:to-transparent md:bg-none"
      data-load-layer="shell"
    >
      {children}
    </div>
  );
}
