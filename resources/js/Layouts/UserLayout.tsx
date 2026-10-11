import { PropsWithChildren, ReactNode, useEffect, useRef, useState } from 'react';
import { usePage } from '@inertiajs/react';
import { useTranslation } from 'react-i18next';
import i18n from '@/lib/i18n';
import {
    BookOpen, HandCoins, Heart, Layers, LayoutDashboard, Library,
    Menu as MenuIcon, PanelLeftClose, PanelLeftOpen, Search, Settings, Ticket, User, X,
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
import { GlobalSearch } from '@/Components/app/GlobalSearch';
import { LanguageSwitcher } from '@/Components/app/LanguageSwitcher';
import { cn } from '@/lib/utils';
import { type MenuItem } from '@/types';

const ICON_MAP: Record<string, LucideIcon> = {
    'layout-dashboard': LayoutDashboard,
    'book-open':        BookOpen,
    'library':          Library,
    'hand-coins':       HandCoins,
    'settings':         Settings,
    'ticket':           Ticket,
    'user':             User,
    'layers':           Layers,
    'heart':            Heart,
    'search':           Search,
};

interface SidebarContentProps {
    menus: MenuItem[];
    onNavClick?: () => void;
    collapsed?: boolean;
    onToggleCollapsed?: () => void;
}

function SidebarContent({ menus, onNavClick, collapsed, onToggleCollapsed }: SidebarContentProps) {
    const { t } = useTranslation();

    function handleOpenSearch() {
        window.dispatchEvent(new Event('global-search:open'));
        onNavClick?.();
    }

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

            <ScrollArea className="min-h-0 flex-1">
                <nav className="px-2 py-3">
                    <SidebarNav menus={menus} iconMap={ICON_MAP} onNavClick={onNavClick} collapsed={collapsed} />
                </nav>
            </ScrollArea>

            <div className="border-t px-2 py-3 space-y-0.5">
                <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start gap-3 text-muted-foreground lg:hidden"
                    onClick={handleOpenSearch}
                >
                    <Search className="h-4 w-4" />
                    {t('nav.search')}
                </Button>

                <ThemeSwitcher collapsed={collapsed} />

                <LanguageSwitcher collapsed={collapsed} />

                <AccountSwitcher collapsed={collapsed} />
            </div>
        </div>
    );
}

interface UserLayoutProps extends PropsWithChildren {
    header?: ReactNode;
}

export default function UserLayout({ children, header }: UserLayoutProps) {
    const { menus, announcements, locale } = usePage().props;
    const { t } = useTranslation();
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [fabVisible, setFabVisible] = useState(true);
    const [collapsed, setCollapsed] = useState(() => (
        typeof window !== 'undefined' && window.localStorage.getItem('user-sidebar-collapsed') === '1'
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
            window.localStorage.setItem('user-sidebar-collapsed', next ? '1' : '0');
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
            <GlobalSearch />

            {/* Desktop sidebar */}
            <aside
                className={cn(
                    'hidden shrink-0 border-r bg-background transition-[width] duration-200 lg:flex lg:flex-col',
                    collapsed ? 'w-16' : 'w-52',
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

            {/* Mobile floating menu button — satu-satunya elemen mengambang, buka panel menu (termasuk Cari) */}
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
                {/* Desktop topbar */}
                <header className="hidden h-14 items-center border-b px-6 lg:flex">
                    <div className="mx-auto flex w-full max-w-md justify-center">
                        <button
                            type="button"
                            onClick={() => window.dispatchEvent(new Event('global-search:open'))}
                            className="flex w-full items-center gap-2 rounded-lg border border-input/50 bg-muted/50 px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent"
                        >
                            <Search className="h-4 w-4" />
                            <span className="flex-1 text-left">{t('nav.searchPlaceholder')}</span>
                            <kbd className="rounded border bg-background px-1 py-0.5 font-mono text-[10px]">⌘K</kbd>
                        </button>
                    </div>
                </header>

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
