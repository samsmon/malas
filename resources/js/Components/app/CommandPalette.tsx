import { useEffect, useState } from 'react';
import { router, usePage } from '@inertiajs/react';
import { useTranslation } from 'react-i18next';
import {
    Activity, BookOpen, HandCoins, HardDrive, LayoutDashboard, Layers, Library,
    Megaphone, Menu as MenuIcon, Search, Settings, Sparkles, Ticket, Users,
    type LucideIcon,
} from 'lucide-react';
import {
    Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/Components/ui/command';
import { flattenMenuItems, menuTranslationKey } from '@/lib/menu';

const ICON_MAP: Record<string, LucideIcon> = {
    'layout-dashboard': LayoutDashboard,
    'book-open':        BookOpen,
    'library':          Library,
    'hand-coins':       HandCoins,
    'users':            Users,
    'menu':             MenuIcon,
    'megaphone':        Megaphone,
    'search':           Search,
    'settings':         Settings,
    'activity':         Activity,
    'ticket':           Ticket,
    'hard-drive':       HardDrive,
    'layers':           Layers,
    'sparkles':         Sparkles,
};

interface SeriesResult { id: string; slug: string; title: string }
interface UserResult { id: string; name: string; email: string }
interface TicketResult { id: string; subject: string }

export function CommandPalette() {
    const { menus } = usePage().props;
    const { t } = useTranslation();
    const navItems = flattenMenuItems(menus);
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [series, setSeries] = useState<SeriesResult[]>([]);
    const [users, setUsers] = useState<UserResult[]>([]);
    const [tickets, setTickets] = useState<TicketResult[]>([]);
    const [searching, setSearching] = useState(false);

    useEffect(() => {
        function handleKeyDown(e: KeyboardEvent) {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                setOpen((o) => !o);
            }
        }
        function handleOpenEvent() {
            setOpen(true);
        }
        document.addEventListener('keydown', handleKeyDown);
        window.addEventListener('command-palette:open', handleOpenEvent);
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('command-palette:open', handleOpenEvent);
        };
    }, []);

    useEffect(() => {
        if (!open) return;
        const q = query.trim();
        if (q.length < 2) {
            setSeries([]);
            setUsers([]);
            setTickets([]);
            setSearching(false);
            return;
        }
        setSearching(true);
        const timer = setTimeout(async () => {
            try {
                const url = new URL(route('admin.command-search'), window.location.origin);
                url.searchParams.set('q', q);
                const res = await fetch(url.toString(), { credentials: 'same-origin' });
                const data: { series: SeriesResult[]; users: UserResult[]; tickets: TicketResult[] } = await res.json();
                setSeries(data.series);
                setUsers(data.users);
                setTickets(data.tickets);
            } catch {
                setSeries([]);
                setUsers([]);
                setTickets([]);
            } finally {
                setSearching(false);
            }
        }, 300);
        return () => clearTimeout(timer);
    }, [query, open]);

    function go(routeName: string, param?: string) {
        setOpen(false);
        setQuery('');
        router.visit(param ? route(routeName, param) : route(routeName));
    }

    return (
        <CommandDialog open={open} onOpenChange={setOpen} title={t('palette.adminTitle')} description={t('palette.adminDescription')}>
            <Command shouldFilter={false}>
                <CommandInput placeholder={t('palette.adminPlaceholder')} value={query} onValueChange={setQuery} />
                <CommandList>
                    {searching ? (
                        <div className="py-6 text-center text-sm text-muted-foreground">{t('palette.searching')}</div>
                    ) : (
                        <CommandEmpty>{t('palette.noResults')}</CommandEmpty>
                    )}
                    <CommandGroup heading={t('palette.navigation')}>
                        {navItems.map((item) => {
                            const Icon = item.icon ? (ICON_MAP[item.icon] ?? null) : null;
                            const labelKey = menuTranslationKey(item.key);
                            const label = labelKey ? t(labelKey) : item.label;
                            if (query.trim() && !label.toLowerCase().includes(query.trim().toLowerCase())) return null;
                            return (
                                <CommandItem key={item.key} value={label} onSelect={() => go(item.route_name!)}>
                                    {Icon && <Icon />}
                                    {label}
                                </CommandItem>
                            );
                        })}
                    </CommandGroup>

                    {series.length > 0 && (
                        <CommandGroup heading={t('palette.series')}>
                            {series.map((s) => (
                                <CommandItem key={s.id} value={`series-${s.id}`} onSelect={() => go('admin.series.show', s.slug)}>
                                    <BookOpen />
                                    {s.title}
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    )}

                    {users.length > 0 && (
                        <CommandGroup heading={t('palette.users')}>
                            {users.map((u) => (
                                <CommandItem key={u.id} value={`user-${u.id}`} onSelect={() => go('admin.users.show', u.id)}>
                                    <Users />
                                    {u.name}
                                    <span className="ml-1 text-xs text-muted-foreground">{u.email}</span>
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    )}

                    {tickets.length > 0 && (
                        <CommandGroup heading={t('palette.tickets')}>
                            {tickets.map((ticket) => (
                                <CommandItem key={ticket.id} value={`ticket-${ticket.id}`} onSelect={() => go('admin.tickets.show', ticket.id)}>
                                    <Search />
                                    {ticket.subject}
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    )}
                </CommandList>
            </Command>
        </CommandDialog>
    );
}
