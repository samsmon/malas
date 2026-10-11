import { PropsWithChildren, ReactNode, useEffect, useRef, useState } from 'react';
import { usePage } from '@inertiajs/react';
import { useTranslation } from 'react-i18next';
import i18n from '@/lib/i18n';
import {
    Activity, BookOpen, Database, HandCoins, HardDrive, Layers, LayoutDashboard, Library,
    Megaphone, Menu as MenuIcon, PanelLeftClose, PanelLeftOpen, Search, Settings, Sparkles,
    Ticket, User, Users, X,
    type LucideIcon,
} from 'lucide-react';
import { Button } from '@/Components/ui/button';
import { ScrollArea } from '@/Components/ui/scroll-area';
import {
    Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/Components/ui/sheet';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/Components/ui/tooltip';
import { ThemeSwitcher } from '@/Components/app/ThemeSwitcher';
import { AccountSwitcher } from '@/Components/app/AccountSwitcher';
import { useFlash } from '@/hooks/useFlash';
import AnnouncementBanner from '@/Components/app/AnnouncementBanner';
import { SidebarNav } from '@/Components/app/SidebarNav';
import { CommandPalette } from '@/Components/app/CommandPalette';
import { LanguageSwitcher } from '@/Components/app/LanguageSwitcher';
import { cn } from '@/lib/utils';
import { type MenuItem } from '@/types';

const ICON_MAP: Record<string, LucideIcon> = {
    'layout-dashboard': LayoutDashboard,
    'book-open':        BookOpen,
    'library':          Library,
    'hand-coins':       HandCoins,
    'users':            Users,
    'user':             User,
    'menu':             MenuIcon,
    'megaphone':        Megaphone,
    'search':           Search,
    'settings':         Settings,
    'activity':         Activity,
    'ticket':           Ticket,
    'hard-drive':       HardDrive,
    'database':         Database,
    'layers':           Layers,
    'sparkles':         Sparkles,
};

interface SidebarContentProps {
    menus: MenuItem[];
    onNavClick?: () => void;
    collapsed?: boolean;
    onToggleCollapsed?: () => void;
}

function SidebarContent({ menus, onNavClick, collapsed, onToggleCollapsed }: SidebarContentProps) {
    const { t } = useTranslation();

    return (
        <div className="flex h-full flex-col">
            <div className={cn('flex h-14 items-center border-b', collapsed ? 'justify-center px-2' : 'justify-between px-5')}>
                {!collapsed && <span className="text-base font-bold tracking-tight">Malas</span>}
                {onToggleCollapsed && (
                    <Tooltip>
                        <TooltipTrigger
                            render={
                                <Button variant="ghost" size="icon-sm" onClick={onToggleCollapsed} aria-label={collapsed ? t('nav.expandSidebar') : t('nav.collapseSidebar')}>
                                    {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
                                </Button>
                            }
                        />
                        <TooltipContent side="right">{collapsed ? t('nav.expandSidebar') : t('nav.collapseSidebar')}</TooltipContent>
                    </Tooltip>
                )}
            </div>

            <div className="px-2 pt-2">
                {collapsed ? (
                    <Tooltip>
                        <TooltipTrigger
                            render={
                                <button
                                    type="button"
                                    onClick={() => window.dispatchEvent(new Event('command-palette:open'))}
                                    className="flex w-full items-center justify-center rounded-lg border border-input/50 bg-muted/50 py-1.5 text-muted-foreground transition-colors hover:bg-accent"
                                >
                                    <Search className="h-3.5 w-3.5" />
                                </button>
                            }
                        />
                        <TooltipContent side="right">{t('nav.quickSearchHint')}</TooltipContent>
                    </Tooltip>
                ) : (
                    <button
                        type="button"
                        onClick={() => window.dispatchEvent(new Event('command-palette:open'))}
                        className="flex w-full items-center gap-2 rounded-lg border border-input/50 bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent"
                    >
                        <Search className="h-3.5 w-3.5" />
                        <span className="flex-1 text-left">{t('nav.quickSearch')}</span>
                        <kbd className="rounded border bg-background px-1 py-0.5 font-mono text-[10px]">⌘K</kbd>
                    </button>
                )}
            </div>

            <ScrollArea className="min-h-0 flex-1">
                <nav className="px-2 py-3">
                    {!collapsed && (
                        <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                            {t('nav.navigation')}
                        </p>
                    )}
                    <SidebarNav menus={menus} iconMap={ICON_MAP} onNavClick={onNavClick} collapsed={collapsed} />
                </nav>
            </ScrollArea>

            <div className="border-t px-2 py-3 space-y-0.5">
                <ThemeSwitcher collapsed={collapsed} />

                <LanguageSwitcher collapsed={collapsed} />

                <AccountSwitcher collapsed={collapsed} />
            </div>
        </div>
    );
}

interface AdminLayoutProps extends PropsWithChildren {
    header?: ReactNode;
}

export default function AdminLayout({ children, header }: AdminLayoutProps) {
    const { menus, announcements, locale } = usePage().props;
    const { t } = useTranslation();
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [fabVisible, setFabVisible] = useState(true);
    const [collapsed, setCollapsed] = useState(() => (
        typeof window !== 'undefined' && window.localStorage.getItem('admin-sidebar-collapsed') === '1'
    ));
    const scrollWrapRef = useRef<HTMLDivElement>(null);
    const lastScrollTop = useRef(0);
    useFlash();

    function closeSidebar() {
        setSidebarOpen(false);
    }

    function toggleCollapsed() {
        setCollapsed((prev) => {
            const next = !prev;
            window.localStorage.setItem('admin-sidebar-collapsed', next ? '1' : '0');
            return next;
        });
    }

    useEffect(() => {
        const viewport = scrollWrapRef.current?.querySelector('[data-slot="scroll-area-viewport"]');
        if (!viewport) return;

        function onScroll() {
            const scrollTop = (viewport as HTMLElement).scrollTop;
            setFabVisible(scrollTop <= lastScrollTop.current || scrollTop < 80);
            lastScrollTop.current = scrollTop;
        }

        viewport.addEventListener('scroll', onScroll);
        return () => viewport.removeEventListener('scroll', onScroll);
    }, []);

    useEffect(() => {
        if (locale) void i18n.changeLanguage(locale);
    }, [locale]);

    return (
        <div className="flex h-screen overflow-hidden bg-background">
            <CommandPalette />

            {/* Desktop sidebar */}
            <aside
                className={cn(
                    'hidden shrink-0 border-r bg-background transition-[width] duration-200 lg:flex lg:flex-col',
                    collapsed ? 'w-16' : 'w-56',
                )}
            >
                <SidebarContent menus={menus} collapsed={collapsed} onToggleCollapsed={toggleCollapsed} />
            </aside>

            {/* Mobile menu — popup bottom sheet, dipicu dari FAB, bukan panel slide-in dari sisi */}
            <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
                <SheetContent side="bottom" className="flex h-[85vh] flex-col gap-0 p-0 lg:hidden">
                    <SheetHeader className="sr-only">
                        <SheetTitle>{t('nav.navigation')}</SheetTitle>
                    </SheetHeader>
                    <SidebarContent menus={menus} onNavClick={closeSidebar} />
                </SheetContent>
            </Sheet>

            {/* Mobile floating menu button — satu-satunya elemen mengambang, buka panel menu (termasuk Cari cepat) */}
            <Button
                size="icon"
                className={cn(
                    'fixed bottom-6 right-6 z-[60] h-14 w-14 rounded-full shadow-lg transition-all duration-200 lg:hidden',
                    fabVisible || sidebarOpen ? 'scale-100 opacity-100' : 'pointer-events-none scale-75 opacity-0',
                )}
                onClick={() => setSidebarOpen((prev) => !prev)}
                aria-label={t('nav.openMenu')}
            >
                {sidebarOpen ? <X className="h-6 w-6" /> : <MenuIcon className="h-6 w-6" />}
                {!sidebarOpen && announcements.length > 0 && (
                    <span className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-destructive ring-2 ring-background" />
                )}
            </Button>

            {/* Main area */}
            <div className="flex flex-1 flex-col overflow-hidden">
                <AnnouncementBanner />

                {header && (
                    <div className="border-b bg-background px-6 py-4">
                        {header}
                    </div>
                )}

                <div ref={scrollWrapRef} className="min-h-0 flex-1">
                    <ScrollArea className="h-full">
                        <main className="p-6">
                            {children}
                        </main>
                    </ScrollArea>
                </div>
            </div>
        </div>
    );
}
