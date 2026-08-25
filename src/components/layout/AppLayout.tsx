'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import Sidebar from '@/components/layout/Sidebar';
import { usePathname, useRouter } from 'next/navigation';
import { Menu, Home, Users, Layout, Settings, FileText, HelpCircle } from 'lucide-react';
import Link from 'next/link';
import { isIndividualRole } from '@/lib/role-policy';

import dynamic from 'next/dynamic';
import PageTransition from '@/components/layout/PageTransition';

const ChatWidget = dynamic(() => import('@/components/chat/ChatWidget'), {
  ssr: false,
});

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading, isLoggingOut } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  useEffect(() => {
    if (isLoading || isLoggingOut) return;

    if (!user && pathname !== '/login') {
      router.push('/login');
    } else if (user && pathname === '/login') {
      if (isIndividualRole(user.role)) {
        router.push(`/evaluations/${user.id}`);
      } else {
        router.push('/dashboard');
      }
    } else if (user && pathname === '/') {
      if (isIndividualRole(user.role)) {
        router.push(`/evaluations/${user.id}`);
      } else {
        router.push('/dashboard');
      }
    }
  }, [user, isLoading, isLoggingOut, pathname, router]);

  // Đóng sidebar khi đổi route — adjust state during render (không cần effect)
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    setIsSidebarOpen(false);
  }

  // Trang login luôn full-screen (không sidebar) — tránh hiện sidebar + login card
  // trong 1-2s sau khi set session trước khi redirect dashboard.
  if (pathname === '/login') {
    return (
      <main className="flex-1 w-full">
        <PageTransition>{children}</PageTransition>
      </main>
    );
  }

  if (isLoggingOut) {
    return (
      <div className="min-h-screen bg-[#003449] flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

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
      <div className="flex w-full min-h-screen">
        <Sidebar 
          isOpen={isSidebarOpen} 
          onClose={() => setIsSidebarOpen(false)} 
        />
        
        <main className="flex-1 min-w-0 md:pl-[240px] pb-[calc(5rem+env(safe-area-inset-bottom,0px))] md:pb-0 overflow-y-auto overflow-x-hidden print:pl-0 print:pb-0 print:overflow-visible">
          <PageTransition>
            {children}
          </PageTransition>
          <ChatWidget />
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 h-[calc(3.5rem+env(safe-area-inset-bottom,0px))] bg-white/80 backdrop-blur-xl border-t border-slate-200/80 shadow-[0_-4px_20px_rgba(0,0,0,0.05)] flex items-center justify-around z-40 px-2 pb-[env(safe-area-inset-bottom,0px)] print:hidden">
        <button
          type="button"
          onClick={() => setIsSidebarOpen(true)}
          aria-label="Mở menu"
          className="relative flex flex-col items-center justify-center w-14 h-12 text-slate-400 hover:text-slate-600 transition-all duration-300"
        >
          <Menu size={24} />
        </button>
        {isIndividualRole(user?.role) ? (
          <>
            <BottomNavItem href={`/evaluations/${user?.id}`} icon={<FileText size={24} />} ariaLabel="Phiếu đánh giá" active={pathname.startsWith('/evaluations')} />
            <BottomNavItem href="/settings" icon={<Settings size={24} />} ariaLabel="Cài đặt" active={pathname === '/settings'} />
            <BottomNavItem href="/support" icon={<HelpCircle size={24} />} ariaLabel="Hướng dẫn" active={pathname === '/support'} />
          </>
        ) : (
          <>
            <BottomNavItem href="/dashboard" icon={<Home size={24} />} ariaLabel="Trang chủ" active={pathname === '/dashboard'} />
            <BottomNavItem href="/teams" icon={<Layout size={24} />} ariaLabel="Nhóm" active={pathname === '/teams'} />
            <BottomNavItem href="/employees" icon={<Users size={24} />} ariaLabel="Nhân sự" active={pathname === '/employees'} />
            <BottomNavItem href="/settings" icon={<Settings size={24} />} ariaLabel="Cài đặt" active={pathname === '/settings'} />
          </>
        )}
      </nav>
    </div>
  );
}

function BottomNavItem({ href, icon, ariaLabel, active }: { href: string; icon: React.ReactNode; ariaLabel: string; active: boolean }) {
  return (
    <Link 
      href={href}
      prefetch={false}
      aria-label={ariaLabel}
      className={`relative flex flex-col items-center justify-center w-14 h-12 transition-all duration-300 ${active ? 'text-primary' : 'text-slate-400 hover:text-slate-600'}`}
    >
      <div className={`transition-transform duration-300 ${active ? '-translate-y-1 scale-110' : ''}`}>
        {icon}
      </div>
      {active && (
        <div className="absolute -bottom-1 w-1 h-1 bg-primary rounded-full shadow-[0_0_8px_rgba(var(--color-primary),0.8)]" />
      )}
    </Link>
  );
}
