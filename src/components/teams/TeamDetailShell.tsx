'use client';

import { ReactNode } from 'react';

interface TeamDetailShellProps {
  children: ReactNode;
}

export default function TeamDetailShell({ children }: TeamDetailShellProps) {
  return (
    <div
      className="px-6 md:px-10 lg:px-12 py-8 space-y-6 animate-in fade-in duration-500 w-full max-w-[1600px] mx-auto"
      data-load-layer="shell"
    >
      {children}
    </div>
  );
}
