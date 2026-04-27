'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import Sidebar from '@/components/layout/Sidebar';
import BottomNav from '@/components/layout/BottomNav';
import { usePathname, useRouter } from 'next/navigation';
import { Menu } from 'lucide-react';

import PageTransition from '@/components/layout/PageTransition';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  useEffect(() => {
    if (isLoading) return;

    if (!user && pathname !== '/login') {
      router.push('/login');
    } else if (user && pathname === '/login') {
      router.push('/dashboard');
    } else if (user && pathname === '/') {
      router.push('/dashboard');
    }
  }, [user, isLoading, pathname, router]);

  // Close sidebar on pathname change
  useEffect(() => {
    if (isSidebarOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsSidebarOpen(false);
    }
  }, [pathname, isSidebarOpen]);

  // Conditional rendering
  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#003449] flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <main className="flex-1 w-full">
        <PageTransition>{children}</PageTransition>
      </main>
    );
  }

  return (
    <div className="min-h-screen w-full bg-[#F8FAFC]">
      {/* Mobile Header */}
      <header className="md:hidden sticky top-0 bg-[#003449] text-white px-4 h-16 flex items-center justify-between z-30 shadow-md">
        <button 
          onClick={() => setIsSidebarOpen(true)}
          className="p-2 hover:bg-white/10 rounded-lg transition-colors"
        >
          <Menu size={24} />
        </button>
        <span className="font-bold tracking-wide">KURABE</span>
        <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center font-bold text-sm">
          {user?.name?.charAt(0) || 'U'}
        </div>
      </header>

      <div className="flex w-full min-h-screen">
        <Sidebar 
          isOpen={isSidebarOpen} 
          onClose={() => setIsSidebarOpen(false)} 
        />
        
        <main className="flex-1 min-w-0 md:pl-[240px] pb-20 md:pb-0">
          <PageTransition>
            {children}
          </PageTransition>
        </main>
      </div>
      <BottomNav />
    </div>
  );
}
