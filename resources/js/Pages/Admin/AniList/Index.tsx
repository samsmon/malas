import { useEffect, useRef, useState } from 'react';
import { Head, Link, router } from '@inertiajs/react';
import { useTranslation } from 'react-i18next';
import {
    Search, BookOpen, Download, RefreshCw, CheckCircle, ExternalLink, X, TrendingUp, CheckSquare, Square, Loader2,
} from 'lucide-react';
import AdminLayout from '@/Layouts/AdminLayout';
import PageHeader from '@/Components/app/PageHeader';
import { Button, buttonVariants } from '@/Components/ui/button';
import { Checkbox } from '@/Components/ui/checkbox';
import { Input } from '@/Components/ui/input';
import { Label } from '@/Components/ui/label';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/Components/ui/select';
import { SeriesStatusBadge, SeriesTypeBadge } from '@/Components/app/StatusBadge';
import { ToggleGroup, ToggleGroupItem } from '@/Components/ui/toggle-group';
import { PageProps } from '@/types';
import { type SeriesStatus, type SeriesType } from '@/lib/types';
import { useTypeFilterOptions } from '@/lib/typeFilters';

// Canonical AniList genres (MediaGenre enum) — intentionally hardcoded here, AniList has no
// separate endpoint for the list of valid genres.
const ANILIST_GENRES = [
    'Action', 'Adventure', 'Comedy', 'Drama', 'Ecchi', 'Fantasy', 'Horror',
    'Mahou Shoujo', 'Mecha', 'Music', 'Mystery', 'Psychological', 'Romance',
    'Sci-Fi', 'Slice of Life', 'Sports', 'Supernatural', 'Thriller',
] as const;

interface AniListResult {
    anilist_id: number;
    title: string;
    title_english: string | null;
    cover_url: string | null;
    type: SeriesType;
    status: SeriesStatus;
    volumes: number | null;
    score: number | null;
    synopsis: string | null;
    published_from: string | null;
    already_imported: boolean;
    series_id: string | null;
    series_slug: string | null;
    is_adult: boolean;
}

interface Props extends PageProps {
    results: AniListResult[];
    pagination: {
        lastPage?: number;
        hasNextPage?: boolean;
        currentPage?: number;
    };
    filters: {
        q: string;
        hide_adult: boolean;
        type: string | null;
        genre: string | null;
        year: number | null;
        sort_popularity: boolean;
    };
    error: string | null;
}

export default function AniListIndex({ results, pagination, filters, error }: Props) {
    const { t } = useTranslation('admin');
    const typeOptions = useTypeFilterOptions();
    const [search, setSearch]               = useState(filters.q);
    const [hideAdult, setHideAdult]         = useState(filters.hide_adult);
    const [type, setType]                   = useState(filters.type || 'all');
    const [genre, setGenre]                 = useState(filters.genre || 'all');
    const [year, setYear]                   = useState(filters.year ? String(filters.year) : '');
    const [sortPopularity, setSortPopularity] = useState(filters.sort_popularity);
    const [hideImported, setHideImported]   = useState(false);
    const [preview, setPreview]             = useState<AniListResult | null>(null);
    const [importing, setImporting]         = useState(false);
    const [selected, setSelected]           = useState<Set<number>>(new Set());
    const [bulkImporting, setBulkImporting] = useState(false);
    const debounceRef                       = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            // Browsing by genre/year alone is allowed, without typing any title.
            if (search.trim() || genre !== 'all' || year.trim()) {
                router.get(
                    route('admin.anilist.index'),
                    {
                        q: search.trim(),
                        hide_adult: hideAdult ? '1' : '0',
                        type: type === 'all' ? undefined : type,
                        genre: genre === 'all' ? undefined : genre,
                        year: year.trim() || undefined,
                        sort_popularity: sortPopularity ? '1' : '0',
                    },
                    { preserveState: true, replace: true },
                );
            }
        }, 500);
        return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    }, [search, hideAdult, type, genre, year, sortPopularity]);

    // Reset the selection whenever the search results change — the old selection from the previous
    // page/filter is no longer relevant.
    useEffect(() => {
        setSelected(new Set());
    }, [results]);

    const visibleResults = hideImported ? results.filter((r) => !r.already_imported) : results;
    const selectableResults = visibleResults.filter((r) => !r.already_imported);

    function toggleSelect(anilistId: number) {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(anilistId)) next.delete(anilistId);
            else next.add(anilistId);
            return next;
        });
    }

    function toggleSelectAll() {
        if (selected.size === selectableResults.length) {
            setSelected(new Set());
        } else {
            setSelected(new Set(selectableResults.map((r) => r.anilist_id)));
        }
    }

    function handleBulkImport() {
        setBulkImporting(true);
        router.post(
            route('admin.anilist.bulk-import'),
            { anilist_ids: Array.from(selected) },
            {
                onFinish: () => { setBulkImporting(false); setSelected(new Set()); },
            },
        );
    }

    function handleImport(item: AniListResult) {
        setImporting(true);
        router.post(
            route('admin.anilist.import'),
            {
                anilist_id:     item.anilist_id,
                title:          item.title,
                title_english:  item.title_english,
                cover_url:      item.cover_url,
                type:           item.type,
                status:         item.status,
                volumes:        item.volumes,
                score:          item.score,
                synopsis:       item.synopsis,
                published_from: item.published_from,
                is_adult:       item.is_adult,
            },
            {
                onFinish: () => { setImporting(false); setPreview(null); },
            },
        );
    }

    function goToPage(page: number) {
        router.get(
            route('admin.anilist.index'),
            {
                q: search.trim(),
                page,
                hide_adult: hideAdult ? '1' : '0',
                type: type === 'all' ? undefined : type,
                genre: genre === 'all' ? undefined : genre,
                year: year.trim() || undefined,
                sort_popularity: sortPopularity ? '1' : '0',
            },
            { preserveState: true, replace: true },
        );
    }

    const currentPage = pagination.currentPage ?? 1;

    return (
        <AdminLayout
            header={
                <PageHeader
                    title={t('anilist.title')}
                    description={t('anilist.description')}
                />
            }
        >
            <Head title={t('anilist.searchTitle')} />
            {/* Search */}
            <div className="mb-4 flex flex-wrap items-center gap-4">
                <div className="relative max-w-lg flex-1">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        className="pl-9"
                        placeholder={t('anilist.searchPlaceholder')}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
                <div className="flex items-center gap-2">
                    <Checkbox
                        id="hide_adult"
                        checked={hideAdult}
                        onCheckedChange={(v) => setHideAdult(v === true)}
                    />
                    <Label htmlFor="hide_adult" className="text-sm font-normal text-muted-foreground">
                        {t('anilist.hideAdult')}
                    </Label>
                </div>
            </div>

            {/* Batch filters — genre, tahun, sort popularitas */}
            <div className="mb-4 flex flex-wrap items-center gap-3">
                <Select value={genre} onValueChange={(v) => v !== null && setGenre(v)}>
                    <SelectTrigger className="w-44">
                        <SelectValue placeholder={t('anilist.allGenres')} />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">{t('anilist.allGenres')}</SelectItem>
                        {ANILIST_GENRES.map((g) => (
                            <SelectItem key={g} value={g}>{g}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Input
                    type="number"
                    inputMode="numeric"
                    placeholder={t('anilist.year')}
                    className="w-28"
                    value={year}
                    onChange={(e) => setYear(e.target.value)}
                    min={1900}
                    max={2100}
                />
                <div className="flex items-center gap-2">
                    <Checkbox
                        id="sort_popularity"
                        checked={sortPopularity}
                        onCheckedChange={(v) => setSortPopularity(v === true)}
                    />
                    <Label htmlFor="sort_popularity" className="flex items-center gap-1 text-sm font-normal text-muted-foreground">
                        <TrendingUp className="h-3.5 w-3.5" />
                        {t('anilist.sortPopularity')}
                    </Label>
                </div>
                <div className="flex items-center gap-2">
                    <Checkbox
                        id="hide_imported"
                        checked={hideImported}
                        onCheckedChange={(v) => setHideImported(v === true)}
                    />
                    <Label htmlFor="hide_imported" className="text-sm font-normal text-muted-foreground">
                        {t('anilist.hideImported')}
                    </Label>
                </div>
            </div>

            {/* Quick filter tipe — Segmented Control */}
            <div className="mb-4 overflow-x-auto">
                <ToggleGroup
                    value={[type]}
                    onValueChange={(vals) => setType(vals[0] ?? 'all')}
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

            <p className="mb-4 text-xs text-muted-foreground">
                {t('anilist.searchHint')}
            </p>

            {/* Bulk select bar — only shown when there are selectable results */}
            {selectableResults.length > 0 && (
                <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border bg-muted/40 p-3">
                    <Button variant="outline" size="sm" onClick={toggleSelectAll}>
                        {selected.size === selectableResults.length
                            ? <CheckSquare className="mr-1.5 h-3.5 w-3.5" />
                            : <Square className="mr-1.5 h-3.5 w-3.5" />}
                        {selected.size === selectableResults.length ? t('anilist.deselectAll') : t('anilist.selectAllNotImported', { count: selectableResults.length })}
                    </Button>
                    {selected.size > 0 && (
                        <>
                            <span className="text-sm text-muted-foreground">
                                {t('anilist.selectedCount', { count: selected.size })}
                            </span>
                            <Button size="sm" className="ml-auto" disabled={bulkImporting} onClick={handleBulkImport}>
                                {bulkImporting ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Download className="mr-1.5 h-3.5 w-3.5" />}
                                {bulkImporting ? t('anilist.bulkImporting') : t('anilist.bulkImport', { count: selected.size })}
                            </Button>
                        </>
                    )}
                </div>
            )}

            {/* Error state */}
            {error && (
                <div className="mb-6 flex items-start gap-3 rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
                    <span className="shrink-0 font-semibold">{t('anilist.errorPrefix')}</span>
                    <span>{error}</span>
                    <button
                        type="button"
                        className="ml-auto flex items-center gap-1 hover:underline"
                        onClick={() => router.get(route('admin.anilist.index'), { q: search }, { preserveState: true })}
                    >
                        <RefreshCw className="h-3 w-3" /> {t('anilist.tryAgain')}
                    </button>
                </div>
            )}

            {/* Empty / prompt state */}
            {!error && visibleResults.length === 0 && (
                <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
                    <BookOpen className="mb-4 h-12 w-12 opacity-30" />
                    <p className="text-sm">
                        {results.length > 0 ? t('anilist.allHiddenByFilter') : (filters.q ? t('anilist.noResults') : t('anilist.typeToSearch'))}
                    </p>
                </div>
            )}

            {/* Results grid */}
            {visibleResults.length > 0 && (
                <>
                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                        {visibleResults.map((item) => (
                            <div key={item.anilist_id} className="relative">
                                {/* Selection checkbox — only for items not yet imported */}
                                {!item.already_imported && (
                                    <button
                                        type="button"
                                        className="absolute left-2 top-2 z-10 flex h-5 w-5 items-center justify-center rounded border-2 border-white bg-black/40 shadow"
                                        onClick={(e) => { e.stopPropagation(); toggleSelect(item.anilist_id); }}
                                        aria-label={t('anilist.selectItem', { title: item.title })}
                                    >
                                        <Checkbox
                                            checked={selected.has(item.anilist_id)}
                                            onCheckedChange={() => toggleSelect(item.anilist_id)}
                                            className="pointer-events-none h-3.5 w-3.5 border-none"
                                        />
                                    </button>
                                )}
                                {/* Card */}
                                <button
                                    type="button"
                                    className="group flex w-full flex-col overflow-hidden rounded-lg border bg-card text-left transition-shadow hover:shadow-md focus:outline-none focus:ring-2 focus:ring-ring"
                                    onClick={() => setPreview(preview?.anilist_id === item.anilist_id ? null : item)}
                                >
                                    {/* Cover */}
                                    <div className="relative aspect-[2/3] overflow-hidden bg-muted">
                                        {item.cover_url ? (
                                            <img
                                                src={item.cover_url}
                                                alt={item.title}
                                                className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                                            />
                                        ) : (
                                            <div className="flex h-full items-center justify-center">
                                                <BookOpen className="h-8 w-8 text-muted-foreground/30" />
                                            </div>
                                        )}
                                        {item.already_imported && (
                                            <div className="absolute inset-0 flex items-end bg-gradient-to-t from-black/60 to-transparent p-2">
                                                <span className="flex items-center gap-1 text-xs font-medium text-white">
                                                    <CheckCircle className="h-3.5 w-3.5 text-green-400" />
                                                    {t('anilist.alreadyImported')}
                                                </span>
                                            </div>
                                        )}
                                        {item.score && (
                                            <div className="absolute top-2 right-2 rounded bg-black/60 px-1.5 py-0.5 text-xs font-medium text-white">
                                                ★ {item.score}
                                            </div>
                                        )}
                                        {item.is_adult && (
                                            <div className="absolute top-2 left-2 rounded bg-destructive px-1.5 py-0.5 text-xs font-bold text-destructive-foreground">
                                                18+
                                            </div>
                                        )}
                                    </div>

                                    {/* Info */}
                                    <div className="flex flex-col gap-1 p-3">
                                        <p className="line-clamp-2 text-sm font-medium leading-tight">{item.title}</p>
                                        <div className="flex flex-wrap gap-1">
                                            <SeriesTypeBadge type={item.type} />
                                        </div>
                                        {item.volumes && (
                                            <p className="text-xs text-muted-foreground">{t('anilist.volumeCount', { count: item.volumes })}</p>
                                        )}
                                    </div>
                                </button>

                                {/* Detail overlay — appears right on top of the card */}
                                {preview?.anilist_id === item.anilist_id && (
                                    <div className="absolute inset-0 z-20 flex flex-col justify-between overflow-hidden rounded-lg border border-border bg-card shadow-xl">
                                        <div className="flex items-start justify-between gap-2 border-b p-3">
                                            <div className="min-w-0">
                                                <p className="text-sm font-semibold leading-tight line-clamp-2">{item.title}</p>
                                                {item.title_english && (
                                                    <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">{item.title_english}</p>
                                                )}
                                            </div>
                                            <button
                                                type="button"
                                                className="shrink-0 rounded p-0.5 hover:bg-muted"
                                                onClick={() => setPreview(null)}
                                            >
                                                <X className="h-3.5 w-3.5 text-muted-foreground" />
                                            </button>
                                        </div>

                                        <div className="flex-1 overflow-y-auto p-3 space-y-2">
                                            <div className="flex flex-wrap gap-1">
                                                <SeriesTypeBadge type={item.type} />
                                                <SeriesStatusBadge status={item.status} />
                                            </div>
                                            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                                                <div>
                                                    <p className="text-muted-foreground">{t('anilist.volume')}</p>
                                                    <p className="font-medium">{item.volumes ?? '—'}</p>
                                                </div>
                                                <div>
                                                    <p className="text-muted-foreground">{t('anilist.score')}</p>
                                                    <p className="font-medium">{item.score ?? '—'}</p>
                                                </div>
                                            </div>
                                            {item.synopsis && (
                                                <p className="line-clamp-4 text-xs text-muted-foreground leading-relaxed">
                                                    {item.synopsis}
                                                </p>
                                            )}
                                            {item.already_imported && (
                                                <p className="text-xs text-amber-600 dark:text-amber-400">
                                                    {t('anilist.alreadyInDb')}
                                                </p>
                                            )}
                                        </div>

                                        <div className="flex gap-2 border-t p-3">
                                            <Button
                                                size="sm"
                                                className="w-full"
                                                disabled={importing}
                                                onClick={() => handleImport(item)}
                                            >
                                                <Download className="mr-1.5 h-3.5 w-3.5" />
                                                {importing ? t('anilist.importing') : item.already_imported ? t('anilist.update') : t('anilist.import')}
                                            </Button>
                                            {item.already_imported && item.series_slug && (
                                                <Link
                                                    href={route('admin.series.show', item.series_slug)}
                                                    className={buttonVariants({ variant: 'outline', size: 'sm' })}
                                                >
                                                    <ExternalLink className="h-3.5 w-3.5" />
                                                </Link>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>

                    {/* Pagination */}
                    {(pagination.currentPage ?? 1) > 1 || pagination.hasNextPage ? (
                        <div className="mt-6 flex items-center justify-center gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={currentPage <= 1}
                                onClick={() => goToPage(currentPage - 1)}
                            >
                                {t('anilist.previous')}
                            </Button>
                            <span className="text-sm text-muted-foreground">{t('anilist.pagePrefix', { page: currentPage })}</span>
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={!pagination.hasNextPage}
                                onClick={() => goToPage(currentPage + 1)}
                            >
                                {t('anilist.next')}
                            </Button>
                        </div>
                    ) : null}
                </>
            )}
        </AdminLayout>
    );
}
