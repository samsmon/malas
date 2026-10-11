import { Link, router } from '@inertiajs/react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { pageWindow } from '@/lib/pageWindow';
import { type PaginatedData } from '@/lib/types';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/Components/ui/select';

const PER_PAGE_OPTIONS = [5, 10, 25, 50, 100];

const BTN = 'inline-flex h-8 min-w-8 items-center justify-center rounded border px-2 text-sm transition-colors';

interface AdminPaginationProps<T> {
    data: PaginatedData<T>;
    /** Inertia route name (e.g. "admin.series.index"); used to build page links and the per-page selector. */
    routeName: string;
    /** Other active query params (search/status/type) preserved on every page link. */
    filters?: Record<string, string | number | undefined | null>;
}

/**
 * Windowed pager (1 … 9 10 11 … 17) with constant width. Admin-side only;
 * the shared <Pagination> used by other pages is untouched.
 */
export function AdminPagination<T>({ data, routeName, filters = {} }: AdminPaginationProps<T>) {
    const { t } = useTranslation();
    if (data.total === 0) return null;

    const total = Math.max(1, data.last_page);
    const current = Math.min(Math.max(1, data.current_page), total);

    function pageHref(page: number) {
        const params: Record<string, string | number> = { page, per_page: data.per_page };
        Object.entries(filters).forEach(([k, v]) => {
            if (v !== undefined && v !== null && v !== '') params[k] = v;
        });
        return route(routeName, params);
    }

    function handlePerPageChange(value: string | null) {
        if (!value) return;
        router.get(route(routeName), { ...filters, per_page: value }, {
            preserveState: true,
            preserveScroll: true,
            replace: true,
        });
    }

    const items = pageWindow(current, total);

    return (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-3">
                <p className="text-sm text-muted-foreground">
                    {data.from !== null && data.to !== null
                        ? t('pagination.showing', { from: data.from, to: data.to, total: data.total })
                        : t('pagination.total', { total: data.total })}
                </p>
                <div className="flex items-center gap-1.5">
                    <span className="text-sm text-muted-foreground">{t('pagination.perPage')}</span>
                    <Select value={String(data.per_page)} onValueChange={handlePerPageChange}>
                        <SelectTrigger className="h-8 w-[68px]">
                            <SelectValue>{(v: string) => v}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                            {PER_PAGE_OPTIONS.map((n) => (
                                <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>
            {total > 1 && (
                <nav aria-label={t('pagination.nav')} className="flex items-center gap-1">
                    {current > 1 ? (
                        <Link
                            href={pageHref(current - 1)}
                            preserveScroll
                            aria-label={t('pagination.prev')}
                            className={cn(BTN, 'border-input bg-background hover:bg-accent')}
                        >
                            ‹
                        </Link>
                    ) : (
                        <span aria-disabled="true" aria-label={t('pagination.prev')} className={cn(BTN, 'border-input opacity-40')}>‹</span>
                    )}
                    {items.map((item, index) => (
                        item === '…' ? (
                            <span key={`gap-${index}`} aria-hidden="true" className="inline-flex h-8 min-w-6 items-center justify-center text-sm text-muted-foreground">…</span>
                        ) : (
                            <Link
                                key={item}
                                href={pageHref(item)}
                                preserveScroll
                                aria-label={t('pagination.goToPage', { page: item })}
                                aria-current={item === current ? 'page' : undefined}
                                className={cn(
                                    BTN,
                                    item === current
                                        ? 'border-primary bg-primary text-primary-foreground'
                                        : 'border-input bg-background hover:bg-accent',
                                )}
                            >
                                {item}
                            </Link>
                        )
                    ))}
                    {current < total ? (
                        <Link
                            href={pageHref(current + 1)}
                            preserveScroll
                            aria-label={t('pagination.next')}
                            className={cn(BTN, 'border-input bg-background hover:bg-accent')}
                        >
                            ›
                        </Link>
                    ) : (
                        <span aria-disabled="true" aria-label={t('pagination.next')} className={cn(BTN, 'border-input opacity-40')}>›</span>
                    )}
                </nav>
            )}
        </div>
    );
}
