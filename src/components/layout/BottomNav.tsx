'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Users, UsersRound, ClipboardCheck, Settings } from 'lucide-react';

export default function BottomNav() {
  const pathname = usePathname();

  const navItems = [
    { name: 'Tổng quan', href: '/dashboard', icon: LayoutDashboard },
    { name: 'Nhân sự', href: '/employees', icon: Users },
    { name: 'Nhóm', href: '/teams', icon: UsersRound },
    { name: 'Tiêu chí', href: '/criteria', icon: ClipboardCheck },
  ];

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-outline-variant px-2 py-1 z-40 flex justify-around items-center shadow-[0_-4px_12px_rgba(0,0,0,0.05)]">
      {navItems.map((item) => {
        const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
        const Icon = item.icon;
        
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-col items-center gap-1 p-2 min-w-[72px] transition-all ${
              isActive ? 'text-primary' : 'text-on-surface-variant hover:text-primary/70'
            }`}
          >
            <div className={`relative p-1 rounded-xl transition-all ${isActive ? 'bg-primary/10' : ''}`}>
              <Icon size={20} className={isActive ? 'animate-bounce-subtle' : ''} />
              {isActive && (
                <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-primary rounded-full"></span>
              )}
            </div>
            <span className={`text-[10px] font-bold ${isActive ? 'text-primary' : ''}`}>
              {item.name}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
