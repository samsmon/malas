import { useEffect, useRef, useState } from 'react';
import { Head, Link, router } from '@inertiajs/react';
import { useTranslation } from 'react-i18next';
import { Plus, MoreHorizontal, Pencil, RefreshCw, Trash2, Eye, ExternalLink } from 'lucide-react';
import AdminLayout from '@/Layouts/AdminLayout';
import PageHeader from '@/Components/app/PageHeader';
import { AdminPagination } from '@/Components/app/AdminPagination';
import { SeriesStatusBadge, SeriesTypeBadge } from '@/Components/app/StatusBadge';
import { Button, buttonVariants } from '@/Components/ui/button';
import { Checkbox } from '@/Components/ui/checkbox';
import { Input } from '@/Components/ui/input';
import {
    ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger,
} from '@/Components/ui/context-menu';
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/Components/ui/dropdown-menu';
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/Components/ui/dialog';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/Components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/Components/ui/toggle-group';
import { cn } from '@/lib/utils';
import { PageProps } from '@/types';
import { type PaginatedData, type SeriesStatus, type SeriesType } from '@/lib/types';
import { useTypeFilterOptions } from '@/lib/typeFilters';

interface SeriesRow {
    id: string;
    slug: string;
    title_romaji: string;
    title_english: string | null;
    cover_url: string | null;
    status: SeriesStatus;
    type: SeriesType;
    total_volumes: number | null;
    volumes_count: number;
    score: number | null;
}

interface Props extends PageProps {
    series: PaginatedData<SeriesRow>;
    filters: { search?: string | null; status?: string | null; type?: string | null };
}

export default function SeriesIndex({ series, filters }: Props) {
    const { t } = useTranslation('admin');
    const typeOptions = useTypeFilterOptions();

    const STATUSES = [
        { value: 'publishing',        label: t('common:badge.status.publishing') },
        { value: 'finished',          label: t('common:badge.status.finished') },
        { value: 'on_hiatus',         label: t('common:badge.status.on_hiatus') },
        { value: 'discontinued',      label: t('common:badge.status.discontinued') },
        { value: 'not_yet_published', label: t('common:badge.status.not_yet_published') },
    ];

    const [search, setSearch]               = useState(filters.search ?? '');
    const [deleteTarget, setDeleteTarget]   = useState<SeriesRow | null>(null);
    const [deleting, setDeleting]           = useState(false);
    const [selectedIds, setSelectedIds]     = useState<Set<string>>(new Set());
    const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
    const [bulkDeleting, setBulkDeleting]   = useState(false);
    const [refreshing, setRefreshing]       = useState(false);
    const isFirstRender = useRef(true);

    useEffect(() => {
        // Reset pilihan saat halaman/filter berubah
        setSelectedIds(new Set());
    }, [series.current_page]);

    useEffect(() => {
        if (isFirstRender.current) {
            isFirstRender.current = false;
            return;
        }
        const timer = setTimeout(() => {
            router.get(
                route('admin.series.index'),
                { ...filters, search: search || undefined },
                { preserveState: true, preserveScroll: true, replace: true },
            );
        }, 400);
        return () => clearTimeout(timer);
    }, [search]);

    function handleFilter(key: string, value: string) {
        router.get(
            route('admin.series.index'),
            { ...filters, search, [key]: (value && value !== 'all') ? value : undefined },
            { preserveState: true, preserveScroll: true, replace: true },
        );
    }

    function handleRefresh() {
        setRefreshing(true);
        router.reload({ onFinish: () => setRefreshing(false) });
    }

    function handleDelete() {
        if (!deleteTarget) return;
        setDeleting(true);
        router.delete(route('admin.series.destroy', deleteTarget.id), {
            onFinish: () => { setDeleting(false); setDeleteTarget(null); },
        });
    }

    function toggleRow(id: string) {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    }

    function toggleAll() {
        const pageIds = series.data.map((s) => s.id);
        const allSelected = pageIds.every((id) => selectedIds.has(id));
        if (allSelected) {
            setSelectedIds((prev) => {
                const next = new Set(prev);
                pageIds.forEach((id) => next.delete(id));
                return next;
            });
        } else {
            setSelectedIds((prev) => new Set([...prev, ...pageIds]));
        }
    }

    function handleBulkDelete() {
        setBulkDeleting(true);
        router.delete(route('admin.series.bulk-destroy'), {
            data: { ids: Array.from(selectedIds) },
            onSuccess: () => setSelectedIds(new Set()),
            onFinish: () => { setBulkDeleting(false); setBulkDeleteOpen(false); },
        });
    }

    const pageIds      = series.data.map((s) => s.id);
    const allSelected  = pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));
    const someSelected = pageIds.some((id) => selectedIds.has(id)) && !allSelected;

    return (
        <AdminLayout
            header={
                <PageHeader
                    title={t('series.breadcrumb')}
                    description={t('series.index.totalCount', { count: series.total })}
                    actions={
                        <div className="flex flex-wrap items-center gap-2">
                            <Link
                                href={route('admin.series.create')}
                                className={buttonVariants()}
                            >
                                <Plus className="h-4 w-4 mr-1.5" />
                                {t('series.create.title')}
                            </Link>
                            {selectedIds.size > 0 && (
                                <Button
                                    variant="destructive"
                                    size="sm"
                                    className="ml-1 border-l pl-3"
                                    onClick={() => setBulkDeleteOpen(true)}
                                >
                                    <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                                    {t('series.index.deleteCount', { count: selectedIds.size })}
                                </Button>
                            )}
                        </div>
                    }
                />
            }
        >
            <Head title={t('series.breadcrumb')} />
            {/* Filters */}
            <div className="mb-4 flex flex-wrap items-center gap-2">
                <Input
                    placeholder={t('series.index.searchPlaceholder')}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-56"
                />
                <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={handleRefresh}
                    disabled={refreshing}
                    aria-label={t('series.index.refresh')}
                >
                    <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
                </Button>
                <Select
                    value={filters.status ?? 'all'}
                    onValueChange={(v) => handleFilter('status', v ?? 'all')}
                >
                    <SelectTrigger className="w-40">
                        <SelectValue placeholder={t('series.index.allStatuses')}>
                            {(value: string) => STATUSES.find((s) => s.value === value)?.label ?? t('series.index.allStatuses')}
                        </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">{t('series.index.allStatuses')}</SelectItem>
                        {STATUSES.map((s) => (
                            <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {/* Quick filter tipe — Segmented Control, terpisah dari filter lain */}
            <div className="mb-4 overflow-x-auto">
                <ToggleGroup
                    value={[filters.type || 'all']}
                    onValueChange={(vals) => handleFilter('type', vals[0] === 'all' ? '' : (vals[0] ?? ''))}
                    variant="outline"
                    size="sm"
                >
                    {typeOptions.map((opt) => (
                        <ToggleGroupItem key={opt.value} value={opt.value}>
                            {opt.label}
                        </ToggleGroupItem>
                    ))}
                </ToggleGroup>
            </div>

            {/* Select all */}
            <div className="mb-3 flex items-center gap-2 text-sm text-muted-foreground">
                <Checkbox
                    checked={allSelected}
                    indeterminate={someSelected}
                    onCheckedChange={toggleAll}
                    aria-label={t('series.index.selectAll')}
                />
                <span>{t('series.index.selectAll')}</span>
            </div>

            {/* Cards */}
            {series.data.length === 0 ? (
                <div className="rounded-lg border py-12 text-center text-muted-foreground">
                    {t('series.index.empty')}
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                    {series.data.map((s) => (
                        <ContextMenu key={s.id}>
                            <ContextMenuTrigger
                                onClick={() => router.visit(route('admin.series.show', s.slug))}
                                render={
                                    <div
                                        className={cn(
                                            'relative flex cursor-pointer gap-3 rounded-xl border bg-card p-3 transition-colors hover:bg-muted/40',
                                            selectedIds.has(s.id) && 'border-primary ring-1 ring-primary',
                                        )}
                                    />
                                }
                            >
                                {s.cover_url ? (
                                    <img src={s.cover_url} alt={s.title_romaji} className="h-36 w-24 shrink-0 rounded-md object-cover" />
                                ) : (
                                    <div className="h-36 w-24 shrink-0 rounded-md bg-muted" />
                                )}
                                <div className="flex min-w-0 flex-1 flex-col">
                                    <div className="absolute right-3 top-3" onClick={(e) => e.stopPropagation()}>
                                        <Checkbox
                                            checked={selectedIds.has(s.id)}
                                            onCheckedChange={() => toggleRow(s.id)}
                                            aria-label={t('series.index.selectItem', { title: s.title_romaji })}
                                        />
                                    </div>
                                    <p className="pr-8 font-medium leading-snug">{s.title_romaji}</p>
                                    {s.title_english && (
                                        <p className="text-xs text-muted-foreground">{s.title_english}</p>
                                    )}
                                    <div className="mt-2 flex flex-wrap gap-1.5">
                                        <SeriesTypeBadge type={s.type} />
                                        <SeriesStatusBadge status={s.status} />
                                    </div>
                                    <div className="mt-3 flex gap-6 text-sm">
                                        <div>
                                            <p className="text-xs text-muted-foreground">{t('series.index.table.volume')}</p>
                                            <p className="font-medium">{s.volumes_count}{s.total_volumes ? `/${s.total_volumes}` : ''}</p>
                                            {s.total_volumes ? (
                                                <div className="mt-1 h-1 w-24 overflow-hidden rounded-full bg-muted">
                                                    <div
                                                        className="h-full bg-primary"
                                                        style={{ width: `${Math.min(100, Math.round((s.volumes_count / s.total_volumes) * 100))}%` }}
                                                    />
                                                </div>
                                            ) : null}
                                        </div>
                                        <div>
                                            <p className="text-xs text-muted-foreground">{t('series.index.table.score')}</p>
                                            <p className="font-medium">{s.score !== null ? Number(s.score).toFixed(1) : '—'}</p>
                                        </div>
                                    </div>
                                    <div className="mt-auto flex items-center gap-1.5 pt-3" onClick={(e) => e.stopPropagation()}>
                                        <Link
                                            href={route('admin.series.edit', s.slug)}
                                            className={buttonVariants({ variant: 'outline', size: 'sm' })}
                                        >
                                            <Pencil className="mr-1.5 h-3.5 w-3.5" />
                                            {t('common:common.edit')}
                                        </Link>
                                        <a
                                            href={route('admin.series.show', s.slug)}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            aria-label={t('series.index.openInNewTab')}
                                            title={t('series.index.openInNewTab')}
                                            className={cn(buttonVariants({ variant: 'outline', size: 'icon' }), 'h-8 w-8')}
                                        >
                                            <ExternalLink className="h-4 w-4" />
                                        </a>
                                        <DropdownMenu>
                                            <DropdownMenuTrigger
                                                className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }), 'ml-auto h-8 w-8')}
                                            >
                                                <MoreHorizontal className="h-4 w-4" />
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuItem onClick={() => router.visit(route('admin.series.show', s.slug))}>
                                                    <Eye className="mr-2 h-4 w-4" />
                                                    {t('series.index.view')}
                                                </DropdownMenuItem>
                                                <DropdownMenuSeparator />
                                                <DropdownMenuItem variant="destructive" onClick={() => setDeleteTarget(s)}>
                                                    <Trash2 className="mr-2 h-4 w-4" />
                                                    {t('common:common.delete')}
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>
                                </div>
                            </ContextMenuTrigger>
                            <ContextMenuContent>
                                <ContextMenuItem onClick={() => router.visit(route('admin.series.show', s.slug))}>
                                    <Eye className="mr-2 h-4 w-4" />
                                    {t('series.index.view')}
                                </ContextMenuItem>
                                <ContextMenuItem onClick={() => window.open(route('admin.series.show', s.slug), '_blank', 'noopener,noreferrer')}>
                                    <ExternalLink className="mr-2 h-4 w-4" />
                                    {t('series.index.openInNewTab')}
                                </ContextMenuItem>
                                <ContextMenuItem onClick={() => router.visit(route('admin.series.edit', s.slug))}>
                                    <Pencil className="mr-2 h-4 w-4" />
                                    {t('common:common.edit')}
                                </ContextMenuItem>
                                <ContextMenuSeparator />
                                <ContextMenuItem variant="destructive" onClick={() => setDeleteTarget(s)}>
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    {t('common:common.delete')}
                                </ContextMenuItem>
                            </ContextMenuContent>
                        </ContextMenu>
                    ))}
                </div>
            )}

            <div className="mt-4">
                <AdminPagination
                    data={series}
                    routeName="admin.series.index"
                    filters={{ search, status: filters.status, type: filters.type }}
                />
            </div>

            {/* Single delete confirmation */}
            <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t('series.index.deleteSeriesTitle')}</DialogTitle>
                        <DialogDescription>
                            {t('series.index.deleteSeriesConfirmPrefix')} <strong>{deleteTarget?.title_romaji}</strong>
                            {t('series.index.deleteSeriesConfirmSuffix')}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDeleteTarget(null)}>{t('common:common.cancel')}</Button>
                        <Button variant="destructive" disabled={deleting} onClick={handleDelete}>
                            {deleting ? t('common:common.deleting') : t('common:common.delete')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Bulk delete confirmation */}
            <Dialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t('series.index.bulkDeleteTitle', { count: selectedIds.size })}</DialogTitle>
                        <DialogDescription>
                            {t('series.index.bulkDeleteConfirmPrefix')} <strong>{selectedIds.size} {t('series.index.bulkDeleteConfirmMiddle')}</strong>{' '}
                            {t('series.index.bulkDeleteConfirmSuffix')}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setBulkDeleteOpen(false)}>{t('common:common.cancel')}</Button>
                        <Button variant="destructive" disabled={bulkDeleting} onClick={handleBulkDelete}>
                            {bulkDeleting ? t('common:common.deleting') : t('series.index.bulkDeleteTitle', { count: selectedIds.size })}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </AdminLayout>
    );
}
