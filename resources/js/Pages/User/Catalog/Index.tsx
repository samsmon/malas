import { useEffect, useRef, useState } from 'react';
import { Head, Link, router } from '@inertiajs/react';
import { useTranslation } from 'react-i18next';
import { RefreshCw } from 'lucide-react';
import UserLayout from '@/Layouts/UserLayout';
import PageHeader from '@/Components/app/PageHeader';
import { SeriesCard, SeriesCardSkeleton } from '@/Components/app/SeriesCard';
import { Pagination } from '@/Components/app/Pagination';
import { GenreMultiSelect } from '@/Components/app/GenreMultiSelect';
import { Button } from '@/Components/ui/button';
import { Input } from '@/Components/ui/input';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/Components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/Components/ui/toggle-group';
import { cn } from '@/lib/utils';
import { useTypeFilterOptions } from '@/lib/typeFilters';
import { PageProps } from '@/types';
import { type PaginatedData, type SeriesStatus, type SeriesType } from '@/lib/types';

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
    is_adult: boolean;
}

interface Props extends PageProps {
    series: PaginatedData<SeriesRow>;
    collectionSeriesIds: string[];
    genreOptions: { manga: string[]; novel: string[] };
    tagOptions: Record<string, string[]>;
    filters: {
        search?: string | null; status?: string | null; type?: string | null;
        genre?: string[] | null; tag?: string[] | null; ownership?: string | null;
    };
}

export default function CatalogIndex({ series, collectionSeriesIds, genreOptions, tagOptions, filters }: Props) {
    const { t } = useTranslation('catalog');
    const typeFilterOptions = useTypeFilterOptions();
    const statusLabels: Record<string, string> = {
        all: t('allStatus'),
        publishing: t('common:badge.status.publishing'),
        finished: t('common:badge.status.finished'),
        on_hiatus: t('common:badge.status.on_hiatus'),
        discontinued: t('common:badge.status.discontinued'),
        not_yet_published: t('common:badge.status.not_yet_published'),
    };
    const ownershipFilters = [
        { value: 'all', label: t('ownership.all') },
        { value: 'owned', label: t('ownership.owned') },
        { value: 'not_owned', label: t('ownership.notOwned') },
    ];
    const genreGroups = [
        { label: t('common:common.manga'), options: genreOptions.manga },
        { label: t('common:common.lightNovel'), options: genreOptions.novel },
    ];
    const tagGroups = Object.entries(tagOptions).map(([category, tags]) => ({ category, tags }));
    const [search, setSearch]         = useState(filters.search ?? '');
    const [refreshing, setRefreshing] = useState(false);
    const [loading, setLoading]       = useState(false);
    const isFirstRender = useRef(true);

    useEffect(() => {
        const removeStart = router.on('start', () => setLoading(true));
        const removeFinish = router.on('finish', () => setLoading(false));

        return () => {
            removeStart();
            removeFinish();
        };
    }, []);

    useEffect(() => {
        if (isFirstRender.current) {
            isFirstRender.current = false;
            return;
        }
        const t = setTimeout(() => {
            router.get(
                route('catalog.index'),
                { ...filters, search: search || undefined },
                { preserveState: true, preserveScroll: true, replace: true },
            );
        }, 400);
        return () => clearTimeout(t);
    }, [search]);

    function handleFilter(key: string, value: string | string[]) {
        const cleaned = Array.isArray(value)
            ? (value.length > 0 ? value : undefined)
            : (value && value !== 'all' ? value : undefined);
        router.get(
            route('catalog.index'),
            { ...filters, search, [key]: cleaned },
            { preserveState: true, preserveScroll: true, replace: true },
        );
    }

    function handleRefresh() {
        setRefreshing(true);
        router.reload({ onFinish: () => setRefreshing(false) });
    }

    const collectionSet = new Set(collectionSeriesIds);

    return (
        <UserLayout
            header={
                <PageHeader
                    title={t('title')}
                    description={t('seriesAvailable', { count: series.total })}
                />
            }
        >
            <Head title={t('title')} />

            {/* Quick filter tipe — Segmented Control, terpisah dari filter lain */}
            <div className="mb-3 overflow-x-auto">
                <ToggleGroup
                    value={[filters.type || 'all']}
                    onValueChange={(vals) => handleFilter('type', vals[0] === 'all' ? '' : (vals[0] ?? ''))}
                    variant="outline"
                    size="sm"
                >
                    {typeFilterOptions.map((opt) => (
                        <ToggleGroupItem key={opt.value} value={opt.value}>
                            {opt.label}
                        </ToggleGroupItem>
                    ))}
                </ToggleGroup>
            </div>

            {/* Filters */}
            <div className="mb-5 flex flex-wrap items-center gap-2">
                <Input
                    placeholder={t('searchPlaceholder')}
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
                    aria-label={t('refresh')}
                >
                    <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
                </Button>
                <Select
                    value={filters.status ?? 'all'}
                    onValueChange={(v) => handleFilter('status', v ?? 'all')}
                >
                    <SelectTrigger className="w-36">
                        <SelectValue placeholder={t('allStatus')}>
                            {(value: string) => statusLabels[value] ?? statusLabels['all']}
                        </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">{t('allStatus')}</SelectItem>
                        <SelectItem value="publishing">{t('common:badge.status.publishing')}</SelectItem>
                        <SelectItem value="finished">{t('common:badge.status.finished')}</SelectItem>
                        <SelectItem value="on_hiatus">{t('common:badge.status.on_hiatus')}</SelectItem>
                        <SelectItem value="discontinued">{t('common:badge.status.discontinued')}</SelectItem>
                        <SelectItem value="not_yet_published">{t('common:badge.status.not_yet_published')}</SelectItem>
                    </SelectContent>
                </Select>
                <GenreMultiSelect
                    value={filters.genre ?? []}
                    onChange={(genres) => handleFilter('genre', genres)}
                    groups={genreGroups}
                    placeholder={t('allGenre')}
                    searchPlaceholder={t('genreFilter.searchPlaceholder')}
                    emptyText={t('genreFilter.emptyText')}
                    clearLabel={t('genreFilter.clearLabel')}
                    selectedLabel={(count) => t('genreFilter.selectedCount', { count })}
                    tagGroups={tagGroups}
                    tagValue={filters.tag ?? []}
                    onTagChange={(tags) => handleFilter('tag', tags)}
                    tagSectionLabel={t('genreFilter.tagSectionLabel')}
                />
                <ToggleGroup
                    value={[filters.ownership || 'all']}
                    onValueChange={(vals) => handleFilter('ownership', vals[0] === 'all' ? '' : (vals[0] ?? ''))}
                    variant="outline"
                    size="sm"
                >
                    {ownershipFilters.map((o) => (
                        <ToggleGroupItem key={o.value} value={o.value}>
                            {o.label}
                        </ToggleGroupItem>
                    ))}
                </ToggleGroup>
            </div>

            {/* Grid */}
            {loading ? (
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                    {Array.from({ length: 12 }).map((_, idx) => (
                        <SeriesCardSkeleton key={idx} />
                    ))}
                </div>
            ) : series.data.length === 0 ? (
                <div className="py-20 text-center">
                    <p className="text-muted-foreground">{t('empty.title')}</p>
                    {filters.search && (
                        <p className="mt-2 text-sm text-muted-foreground">
                            {t('empty.requestPrompt')}{' '}
                            <Link
                                href={route('tickets.create')}
                                className="font-medium text-primary underline-offset-4 hover:underline"
                            >
                                {t('empty.createTicket')}
                            </Link>{' '}
                            {t('empty.toAdmin')}
                        </p>
                    )}
                </div>
            ) : (
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                    {series.data.map((s) => (
                        <SeriesCard
                            key={s.id}
                            {...s}
                            href={route('catalog.show', s.slug)}
                            inCollection={collectionSet.has(s.id)}
                            showCollectionQuickAction
                        />
                    ))}
                </div>
            )}

            <div className="mt-6">
                <Pagination data={series} />
            </div>
        </UserLayout>
    );
}
