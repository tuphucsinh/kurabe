'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LazyMotion, domAnimation, m, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard,
  Users,
  BarChart3,
  UsersRound,
  Scale,
  Settings,
  HelpCircle,
  LogOut,
  X
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { User } from '@/types';

import PeriodSelector from './PeriodSelector';

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useAuth();

  const mainLinks = [
    { href: '/dashboard', label: 'Bảng điều khiển', icon: LayoutDashboard },
    { href: '/teams', label: 'Nhóm', icon: UsersRound },
    { href: '/employees', label: 'Nhân viên', icon: Users },
    { href: '/reports', label: 'Báo cáo', icon: BarChart3 },
    { href: '/criteria', label: 'Tiêu chuẩn', icon: Scale },
  ];

  const bottomLinks = [
    { href: '/settings', label: 'Cài đặt', icon: Settings },
    { href: '/support', label: 'Hỗ trợ', icon: HelpCircle },
  ];

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/');

  return (
    <>
      {/* Desktop Sidebar (Fixed) */}
      <aside className="hidden md:flex fixed left-0 top-0 h-screen w-[240px] bg-[#003449] z-50 flex-col overflow-hidden shadow-2xl print:hidden">
        <SidebarContent 
          user={user} 
          
          mainLinks={mainLinks} 
          bottomLinks={bottomLinks} 
          isActive={isActive} 
          onClose={onClose} 
        />
      </aside>

      {/* Mobile Drawer */}
      <LazyMotion features={domAnimation}>
        <AnimatePresence>
          {isOpen && (
            <>
              {/* Mobile Overlay */}
              <m.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] md:hidden"
                onClick={onClose}
              />

              {/* Sidebar */}
              <m.aside 
                initial={{ x: '-100%' }}
                animate={{ x: 0 }}
                exit={{ x: '-100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className="fixed left-0 top-0 h-screen w-[280px] bg-[#003449] z-[70] flex flex-col overflow-hidden shadow-2xl md:hidden"
              >
                <SidebarContent 
                  user={user} 
                  
                  mainLinks={mainLinks} 
                  bottomLinks={bottomLinks} 
                  isActive={isActive} 
                  onClose={onClose}
                  isMobile 
                />
              </m.aside>
            </>
          )}
        </AnimatePresence>
      </LazyMotion>
    </>
  );
}

interface SidebarContentProps {
  user: User | null;
  mainLinks: { href: string; label: string; icon: React.ElementType }[];
  bottomLinks: { href: string; label: string; icon: React.ElementType }[];
  isActive: (href: string) => boolean;
  onClose?: () => void;
  isMobile?: boolean;
}

function SidebarContent({ user, mainLinks, bottomLinks, isActive, onClose, isMobile }: SidebarContentProps) {
  const router = useRouter();
  return (
    <>
      {/* Logo & Close Button */}
      <div className="px-6 pt-7 pb-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-white/10 rounded-lg flex items-center justify-center">
            <LayoutDashboard className="text-white" size={18} />
          </div>
          <h1 className="text-xl font-bold text-white tracking-wide">KURABE</h1>
        </div>
        {isMobile && (
          <button 
            onClick={onClose}
            className="text-white/70 hover:text-white p-1 hover:bg-white/10 rounded-full transition-colors"
          >
            <X size={24} />
          </button>
        )}
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 px-3 space-y-1 overflow-y-auto custom-scrollbar">
        {mainLinks.map((link) => {
          const Icon = link.icon;
          const active = isActive(link.href);

          return (
            <Link
              key={link.href}
              href={link.href}
              onClick={onClose}
              className={`flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 group ${
                active
                  ? 'bg-white/15 text-white shadow-lg'
                  : 'text-white/70 hover:bg-white/8 hover:text-white'
              }`}
            >
              <Icon size={20} strokeWidth={active ? 2 : 1.5} className={active ? 'text-white' : 'group-hover:scale-110 transition-transform'} />
              {link.label}
            </Link>
          );
        })}
      </nav>

      {/* Bottom Links */}
      <div className="px-3 space-y-1 mb-2">
        {bottomLinks.map((link) => {
          const Icon = link.icon;
          const active = isActive(link.href);

          return (
            <Link
              key={link.href}
              href={link.href}
              onClick={onClose}
              className={`flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 group ${
                active
                  ? 'bg-white/15 text-white'
                  : 'text-white/70 hover:bg-white/8 hover:text-white'
              }`}
            >
              <Icon size={20} strokeWidth={1.5} className="group-hover:rotate-12 transition-transform" />
              {link.label}
            </Link>
          );
        })}

        {/* Logout */}
        <button
          onClick={() => {
            onClose?.();
            // Xóa session local rồi FULL RELOAD sang /login —
            // window.location (không phải client navigation) để browser tải hẳn trang login,
            // KHÔNG giữ layout/sidebar cũ (tránh frame trung gian lẫn login + sidebar).
            localStorage.removeItem('auth_user_id');
            document.cookie = 'auth_session=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;';
            window.location.href = '/login';
          }}
          className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium text-white/70 hover:bg-white/8 hover:text-red-400 transition-all duration-200 w-full text-left group"
        >
          <LogOut size={20} strokeWidth={1.5} className="group-hover:-translate-x-1 transition-transform" />
          Đăng xuất
        </button>
      </div>

      {/* Period Selector */}
      <PeriodSelector />

      {/* User Info */}
      <div className="border-t border-white/10 px-4 py-4 bg-black/10">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-[#0E4B66] to-[#003449] flex items-center justify-center text-white text-sm font-bold flex-shrink-0 border border-white/10 shadow-inner">
            {user?.name?.charAt(0) || 'U'}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-white truncate">{user?.name || 'User'}</p>
            <p className="text-xs text-white/50">{user?.role || 'Manager'}</p>
          </div>
        </div>
      </div>
    </>
  );
}
