import { useState } from 'react';
import { Link } from '@inertiajs/react';
import { ChevronDown, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/Components/ui/tooltip';
import { cn } from '@/lib/utils';
import { flattenMenuItems, menuTranslationKey } from '@/lib/menu';
import { type MenuItem } from '@/types';

function useMenuLabel() {
    const { t } = useTranslation();
    return (item: MenuItem) => {
        const key = menuTranslationKey(item.key);
        return key ? t(key) : item.label;
    };
}

interface NavLinkProps {
    item: MenuItem;
    iconMap: Record<string, LucideIcon>;
    onClick?: () => void;
    indent?: boolean;
    collapsed?: boolean;
}

function NavLink({ item, iconMap, onClick, indent, collapsed }: NavLinkProps) {
    const label = useMenuLabel()(item);
    const Icon = item.icon ? (iconMap[item.icon] ?? null) : null;
    const isActive = !!item.route_name && route().current(item.route_name);
    const href = item.route_name && route().has(item.route_name) ? route(item.route_name) : '#';
    // Ambil data halaman saat kursor melintas supaya klik terasa instan. Halaman admin yang
    // berhubungan dengan API luar tidak di-prefetch (hover tidak boleh memicu panggilan keluar).
    const canPrefetch = href !== '#' && !/^admin\.(anilist|ranobedb|search-external)/.test(item.route_name ?? '');

    const link = (
        <Link
            href={href}
            prefetch={canPrefetch ? 'hover' : undefined}
            onClick={onClick}
            className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                indent && !collapsed && 'pl-9',
                collapsed && 'justify-center px-2',
                isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
            )}
        >
            {Icon && <Icon className="h-4 w-4 shrink-0" />}
            {!collapsed && <span>{label}</span>}
            {!collapsed && item.is_maintenance && (
                <span className="ml-auto text-[10px] text-yellow-500">●</span>
            )}
        </Link>
    );

    if (!collapsed) return link;

    return (
        <Tooltip>
            <TooltipTrigger render={link} />
            <TooltipContent side="right">{label}</TooltipContent>
        </Tooltip>
    );
}

interface CategoryGroupProps {
    item: MenuItem;
    items: MenuItem[];
    iconMap: Record<string, LucideIcon>;
    onNavClick?: () => void;
}

function CategoryGroup({ item, items, iconMap, onNavClick }: CategoryGroupProps) {
    const label = useMenuLabel()(item);
    const hasActiveChild = items.some((c) => c.route_name && route().current(c.route_name));
    const [open, setOpen] = useState(hasActiveChild);
    const Icon = item.icon ? (iconMap[item.icon] ?? null) : null;

    return (
        <div>
            <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
                {Icon && <Icon className="h-4 w-4 shrink-0" />}
                <span className="flex-1 text-left">{label}</span>
                <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 transition-transform', open && 'rotate-180')} />
            </button>
            {open && (
                <div className="mt-0.5 space-y-0.5">
                    {items.map((c) => (
                        <NavLink key={c.key} item={c} iconMap={iconMap} onClick={onNavClick} indent />
                    ))}
                </div>
            )}
        </div>
    );
}

interface SidebarNavProps {
    menus: MenuItem[];
    iconMap: Record<string, LucideIcon>;
    onNavClick?: () => void;
    collapsed?: boolean;
}

export function SidebarNav({ menus, iconMap, onNavClick, collapsed }: SidebarNavProps) {
    if (collapsed) {
        return (
            <div className="space-y-0.5">
                {flattenMenuItems(menus).map((item) => (
                    <NavLink key={item.key} item={item} iconMap={iconMap} onClick={onNavClick} collapsed />
                ))}
            </div>
        );
    }

    const topLevel = menus.filter((m) => !m.parent_key);
    const childrenByParent = new Map<string, MenuItem[]>();
    menus.filter((m) => m.parent_key).forEach((m) => {
        const arr = childrenByParent.get(m.parent_key!) ?? [];
        arr.push(m);
        childrenByParent.set(m.parent_key!, arr);
    });

    return (
        <div className="space-y-0.5">
            {topLevel.map((item) => {
                const children = childrenByParent.get(item.key);
                if (children && children.length > 0) {
                    return (
                        <CategoryGroup
                            key={item.key}
                            item={item}
                            items={children}
                            iconMap={iconMap}
                            onNavClick={onNavClick}
                        />
                    );
                }
                return <NavLink key={item.key} item={item} iconMap={iconMap} onClick={onNavClick} />;
            })}
        </div>
    );
}
