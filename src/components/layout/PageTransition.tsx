'use client';

import { LazyMotion, domAnimation, m } from 'framer-motion';
import { usePathname } from 'next/navigation';
import React from 'react';

interface PageTransitionProps {
  children: React.ReactNode;
}

export default function PageTransition({ children }: PageTransitionProps) {
  const pathname = usePathname();

  return (
    <LazyMotion features={domAnimation}>
      <m.div
        key={pathname}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ 
          duration: 0.15, 
          ease: 'easeOut'
        }}
        className="w-full flex-1 flex flex-col"
      >
        {children}
      </m.div>
    </LazyMotion>
  );
}
