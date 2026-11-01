import { useEffect, useRef, useState } from 'react';
import { Head, Link, router } from '@inertiajs/react';
import { useTranslation } from 'react-i18next';
import {
    Search, BookOpen, Download, CheckCircle, ExternalLink, X,
} from 'lucide-react';
import AdminLayout from '@/Layouts/AdminLayout';
import PageHeader from '@/Components/app/PageHeader';
import { Button, buttonVariants } from '@/Components/ui/button';
import { Checkbox } from '@/Components/ui/checkbox';
import { Input } from '@/Components/ui/input';
import { Label } from '@/Components/ui/label';
import { Badge } from '@/Components/ui/badge';
import { SeriesTypeBadge } from '@/Components/app/StatusBadge';
import { ToggleGroup, ToggleGroupItem } from '@/Components/ui/toggle-group';
import { PageProps } from '@/types';
import { type SeriesType } from '@/lib/types';
import { useTypeFilterOptions } from '@/lib/typeFilters';

interface ExternalResult {
    source: 'anilist' | 'ranobedb';
    source_label: string;
    external_id: number;
    title: string;
    title_secondary: string | null;
    cover_url: string | null;
    type: SeriesType;
    volumes: number | null;
    score: number | null;
    synopsis: string | null;
    published_from: string | null;
    is_adult: boolean;
    already_imported: boolean;
    series_id: string | null;
    series_slug: string | null;
}

interface Props extends PageProps {
    results: ExternalResult[];
    filters: { q: string; hide_adult: boolean; type: string | null };
    errors: { anilist?: string; ranobedb?: string };
}

const SOURCE_BADGE_CLASS: Record<ExternalResult['source'], string> = {
    anilist: 'border-blue-500 text-blue-600 dark:text-blue-400',
    ranobedb: 'border-purple-500 text-purple-600 dark:text-purple-400',
};

export default function ExternalSearchIndex({ results, filters, errors }: Props) {
    const { t } = useTranslation('admin');
    const typeOptions = useTypeFilterOptions();
    const [search, setSearch]       = useState(filters.q);
    const [hideAdult, setHideAdult] = useState(filters.hide_adult);
    const [type, setType]           = useState(filters.type || 'all');
    const [preview, setPreview]     = useState<ExternalResult | null>(null);
    const [importing, setImporting] = useState(false);
    const debounceRef               = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            if (search.trim()) {
                router.get(
                    route('admin.search-external.index'),
                    { q: search.trim(), hide_adult: hideAdult ? '1' : '0', type: type === 'all' ? undefined : type },
                    { preserveState: true, replace: true },
                );
            }
        }, 500);
        return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    }, [search, hideAdult, type]);

    function resultKey(item: ExternalResult) {
        return `${item.source}-${item.external_id}`;
    }

    function handleImport(item: ExternalResult) {
        setImporting(true);

        const routeName = item.source === 'anilist' ? 'admin.anilist.import' : 'admin.ranobedb.import';
        const payload = item.source === 'anilist'
            ? {
                anilist_id: item.external_id,
                title: item.title,
                title_english: item.title_secondary,
                cover_url: item.cover_url,
                type: item.type,
                volumes: item.volumes,
                score: item.score,
                synopsis: item.synopsis,
                published_from: item.published_from,
                is_adult: item.is_adult,
            }
            : { ranobedb_id: item.external_id };

        router.post(route(routeName), payload, {
            onFinish: () => { setImporting(false); setPreview(null); },
        });
    }

    return (
        <AdminLayout
            header={
                <PageHeader
                    title={t('search.title')}
                    description={t('search.description')}
                />
            }
        >
            <Head title={t('search.title')} />
            {/* Search */}
            <div className="mb-6 flex flex-wrap items-center gap-4">
                <div className="relative max-w-lg flex-1">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        className="pl-9"
                        placeholder={t('search.searchPlaceholder')}
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

            {/* Error states (one source failing does not stop the others) */}
            {(errors.anilist || errors.ranobedb) && (
                <div className="mb-6 space-y-2">
                    {errors.anilist && (
                        <div className="flex items-start gap-3 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                            <span className="shrink-0 font-semibold">AniList:</span>
                            <span>{errors.anilist}</span>
                        </div>
                    )}
                    {errors.ranobedb && (
                        <div className="flex items-start gap-3 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                            <span className="shrink-0 font-semibold">RanobeDB:</span>
                            <span>{errors.ranobedb}</span>
                        </div>
                    )}
                </div>
            )}

            {/* Empty / prompt state */}
            {results.length === 0 && (
                <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
                    <BookOpen className="mb-4 h-12 w-12 opacity-30" />
                    <p className="text-sm">{filters.q ? t('anilist.noResults') : t('anilist.typeToSearch')}</p>
                </div>
            )}

            {/* Results grid */}
            {results.length > 0 && (
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                    {results.map((item) => (
                        <div key={resultKey(item)} className="relative">
                            <button
                                type="button"
                                className="group flex w-full flex-col overflow-hidden rounded-lg border bg-card text-left transition-shadow hover:shadow-md focus:outline-none focus:ring-2 focus:ring-ring"
                                onClick={() => setPreview(preview && resultKey(preview) === resultKey(item) ? null : item)}
                            >
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
                                    {item.is_adult && (
                                        <div className="absolute top-2 left-2 rounded bg-destructive px-1.5 py-0.5 text-xs font-bold text-destructive-foreground">
                                            18+
                                        </div>
                                    )}
                                </div>

                                <div className="flex flex-col gap-1 p-3">
                                    <p className="line-clamp-2 text-sm font-medium leading-tight">{item.title}</p>
                                    <div className="flex flex-wrap gap-1">
                                        <Badge variant="outline" className={`text-xs ${SOURCE_BADGE_CLASS[item.source]}`}>
                                            {item.source_label}
                                        </Badge>
                                        <SeriesTypeBadge type={item.type} />
                                    </div>
                                    {item.volumes && (
                                        <p className="text-xs text-muted-foreground">{t('anilist.volumeCount', { count: item.volumes })}</p>
                                    )}
                                </div>
                            </button>

                            {preview && resultKey(preview) === resultKey(item) && (
                                <div className="absolute inset-0 z-20 flex flex-col justify-between overflow-hidden rounded-lg border border-border bg-card shadow-xl">
                                    <div className="flex items-start justify-between gap-2 border-b p-3">
                                        <div className="min-w-0">
                                            <p className="text-sm font-semibold leading-tight line-clamp-2">{item.title}</p>
                                            {item.title_secondary && (
                                                <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">{item.title_secondary}</p>
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
                                            <Badge variant="outline" className={`text-xs ${SOURCE_BADGE_CLASS[item.source]}`}>
                                                {item.source_label}
                                            </Badge>
                                            <SeriesTypeBadge type={item.type} />
                                        </div>
                                        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                                            <div>
                                                <p className="text-muted-foreground">{t('anilist.volume')}</p>
                                                <p className="font-medium">{item.volumes ?? '—'}</p>
                                            </div>
                                            <div>
                                                <p className="text-muted-foreground">{t('search.score')}</p>
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
            )}
        </AdminLayout>
    );
}
