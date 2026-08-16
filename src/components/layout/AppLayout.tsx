'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import Sidebar from '@/components/layout/Sidebar';
import { usePathname, useRouter } from 'next/navigation';
import { Menu, Home, Users, Layout, Settings, Bell, FileText, HelpCircle } from 'lucide-react';
import Link from 'next/link';

import PageTransition from '@/components/layout/PageTransition';
import ChatWidget from '@/components/chat/ChatWidget';

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
      if (user.role === 'Employee') {
        router.push(`/evaluations/${user.id}`);
      } else {
        router.push('/dashboard');
      }
    } else if (user && pathname === '/') {
      if (user.role === 'Employee') {
        router.push(`/evaluations/${user.id}`);
      } else {
        router.push('/dashboard');
      }
    }
  }, [user, isLoading, pathname, router]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsSidebarOpen(false);
  }, [pathname]);

  // Trang login luôn full-screen (không sidebar) — tránh hiện sidebar + login card
  // trong 1-2s sau khi set session trước khi redirect dashboard.
  if (pathname === '/login') {
    return (
      <main className="flex-1 w-full">
        <PageTransition>{children}</PageTransition>
      </main>
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
      {/* Mobile Header */}
      <header className="md:hidden sticky top-0 bg-white/70 backdrop-blur-xl text-on-surface px-4 h-14 flex items-center justify-between z-40 border-b border-outline-variant/50 print:hidden">
        <button 
          onClick={() => setIsSidebarOpen(true)}
          className="p-2 hover:bg-surface rounded-xl transition-all active:scale-90"
        >
          <Menu size={24} />
        </button>
        <span className="font-black tracking-tighter text-lg italic text-primary">KURABE</span>
        <div className="flex items-center gap-2.5">
          <button className="p-3 hover:bg-surface rounded-xl transition-colors relative">
            <Bell size={20} className="text-on-surface-variant" />
            <span className="absolute top-2.5 right-2.5 w-2 h-2 bg-rose-500 rounded-full border-2 border-white" />
          </button>
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-primary to-indigo-600 flex items-center justify-center font-bold text-sm text-white shadow-md shadow-primary/20">
            {user?.name?.charAt(0) || 'U'}
          </div>
        </div>
      </header>

      <div className="flex w-full min-h-screen">
        <Sidebar 
          isOpen={isSidebarOpen} 
          onClose={() => setIsSidebarOpen(false)} 
        />
        
        <main className="flex-1 min-w-0 md:pl-[240px] pb-44 md:pb-0 overflow-y-auto overflow-x-hidden print:pl-0 print:pb-0 print:overflow-visible">
          <PageTransition>
            {children}
          </PageTransition>
          <ChatWidget />
        </main>
      </div>

      {/* Mobile Floating Navigation */}
      <nav className="md:hidden fixed bottom-6 left-6 right-6 h-14 bg-white/80 backdrop-blur-xl border border-white/20 shadow-[0_8px_32px_rgba(0,0,0,0.12)] rounded-2xl flex items-center justify-around z-40 px-2 print:hidden">
        {user?.role === 'Employee' ? (
          <>
            <BottomNavItem href={`/evaluations/${user.id}`} icon={<FileText size={24} />} ariaLabel="Phiếu đánh giá" active={pathname.startsWith('/evaluations')} />
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
