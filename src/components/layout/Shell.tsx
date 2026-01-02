import React, { useState } from 'react';
import { 
  LayoutDashboard, 
  BookOpen, 
  Compass, 
  UserCircle2, 
  Settings,
  ChevronRight,
  Menu,
  X
} from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { useLanguage } from '../../hooks/useLanguage';

interface NavItemProps {
  to: string;
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick?: () => void;
}

const NavItem = ({ to, icon, label, active, onClick }: NavItemProps) => (
  <Link to={to} onClick={onClick} className="block group">
    <div className={cn(
      "flex items-center justify-between px-4 py-3 rounded-xl transition-all duration-200 ease-out",
      active 
        ? "bg-primary text-white shadow-lg shadow-primary/20" 
        : "text-gray-400 hover:bg-secondary hover:text-white"
    )}>
      <div className="flex items-center gap-3">
        <span className={cn("transition-transform duration-300", active ? "scale-110" : "group-hover:scale-110")}>
          {icon}
        </span>
        <span className="font-semibold tracking-tight">{label}</span>
      </div>
      {active && <ChevronRight className="w-4 h-4 opacity-50" />}
    </div>
  </Link>
);

export const Shell = ({ children }: { children: React.ReactNode }) => {
  const location = useLocation();
  const { t } = useLanguage();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const navItems = [
    { to: '/', icon: <LayoutDashboard size={20} />, label: t('navDashboard') },
    { to: '/journal', icon: <BookOpen size={20} />, label: t('navJournal') },
    { to: '/strategy', icon: <Compass size={20} />, label: t('navStrategy') },
    { to: '/profile', icon: <UserCircle2 size={20} />, label: t('navProfile') },
    { to: '/settings', icon: <Settings size={20} />, label: t('navSettings') },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-primary/30">
      {/* Mobile Header */}
      <header className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-background/80 backdrop-blur-xl border-b border-border z-40 px-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shadow-lg shadow-primary/20">
                <Compass className="w-5 h-5 text-white" />
            </div>
            <span className="font-black text-xl tracking-tighter">MyStats</span>
        </div>
        <button 
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="p-2 hover:bg-secondary rounded-lg transition-colors"
        >
          {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </header>

      {/* Sidebar - Desktop */}
      <aside className="fixed left-0 top-0 bottom-0 w-72 bg-secondary/30 backdrop-blur-2xl border-r border-border hidden lg:flex flex-col p-6 z-30">
        <div className="flex items-center gap-3 px-2 mb-10">
          <div className="w-10 h-10 rounded-2xl bg-primary flex items-center justify-center shadow-xl shadow-primary/30">
            <Compass className="w-6 h-6 text-white" />
          </div>
          <div className="flex flex-col">
            <span className="font-black text-2xl tracking-tighter leading-none">MyStats</span>
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-1">Vibe Intelligence</span>
          </div>
        </div>

        <nav className="flex-1 space-y-1">
          {navItems.map((item) => (
            <NavItem
              key={item.to}
              {...item}
              active={location.pathname === item.to}
            />
          ))}
        </nav>


      </aside>

      {/* Mobile Menu Overlay */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div 
            initial={{ opacity: 0, x: -100 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -100 }}
            className="fixed inset-0 bg-background/95 backdrop-blur-2xl z-50 lg:hidden p-6 pt-20"
          >
            <nav className="space-y-2">
              {navItems.map((item) => (
                <NavItem
                  key={item.to}
                  {...item}
                  active={location.pathname === item.to}
                  onClick={() => setIsMobileMenuOpen(false)}
                />
              ))}
            </nav>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="lg:pl-72 pt-24 lg:pt-12 px-6 lg:px-12 min-h-screen">
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
};
