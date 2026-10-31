import { useEffect, useState } from 'react';
import { router, usePage } from '@inertiajs/react';
import { useTranslation } from 'react-i18next';
import {
    BookOpen, HandCoins, Heart, LayoutDashboard, Library, Search, Settings, Ticket, User,
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
    'settings':         Settings,
    'ticket':           Ticket,
    'user':             User,
    'heart':            Heart,
    'search':           Search,
};

interface SearchResult { id: string; title: string; slug?: string }

export function GlobalSearch() {
    const { menus } = usePage().props;
    const { t } = useTranslation();
    const navItems = flattenMenuItems(menus);
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [catalogResults, setCatalogResults] = useState<SearchResult[]>([]);
    const [collectionResults, setCollectionResults] = useState<SearchResult[]>([]);
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
        window.addEventListener('global-search:open', handleOpenEvent);
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('global-search:open', handleOpenEvent);
        };
    }, []);

    useEffect(() => {
        if (!open) return;
        const q = query.trim();
        if (q.length < 2) {
            setCatalogResults([]);
            setCollectionResults([]);
            setSearching(false);
            return;
        }
        setSearching(true);
        const timer = setTimeout(async () => {
            try {
                const url = new URL(route('search'), window.location.origin);
                url.searchParams.set('q', q);
                const res = await fetch(url.toString(), { credentials: 'same-origin' });
                const data: { catalog: SearchResult[]; collection: SearchResult[] } = await res.json();
                setCatalogResults(data.catalog);
                setCollectionResults(data.collection);
            } catch {
                setCatalogResults([]);
                setCollectionResults([]);
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
        <CommandDialog
            open={open}
            onOpenChange={setOpen}
            title={t('palette.userTitle')}
            description={t('palette.userDescription')}
        >
            <Command shouldFilter={false}>
                <CommandInput
                    placeholder={t('palette.userPlaceholder')}
                    value={query}
                    onValueChange={setQuery}
                />
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

                    {collectionResults.length > 0 && (
                        <CommandGroup heading={t('palette.myCollection')}>
                            {collectionResults.map((r) => (
                                <CommandItem
                                    key={`collection-${r.id}`}
                                    value={`collection-${r.id}`}
                                    onSelect={() => go('collection.show', r.slug ?? r.id)}
                                >
                                    <Library />
                                    {r.title}
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    )}

                    {catalogResults.length > 0 && (
                        <CommandGroup heading={t('palette.catalog')}>
                            {catalogResults.map((r) => (
                                <CommandItem
                                    key={`series-${r.id}`}
                                    value={`series-${r.id}`}
                                    onSelect={() => go('catalog.show', r.slug ?? r.id)}
                                >
                                    <BookOpen />
                                    {r.title}
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    )}
                </CommandList>
            </Command>
        </CommandDialog>
    );
}
