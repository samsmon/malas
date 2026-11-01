import { useEffect, useRef, useState } from 'react';
import { Head, Link, router } from '@inertiajs/react';
import { useTranslation } from 'react-i18next';
import {
    Search, BookOpen, Download, RefreshCw, CheckCircle, ExternalLink, X,
} from 'lucide-react';
import AdminLayout from '@/Layouts/AdminLayout';
import PageHeader from '@/Components/app/PageHeader';
import { Button, buttonVariants } from '@/Components/ui/button';
import { Input } from '@/Components/ui/input';
import { PageProps } from '@/types';

interface RanobeDbResult {
    ranobedb_id: number;
    title: string;
    title_display: string | null;
    cover_url: string | null;
    volumes: number | null;
    published_from: string | null;
    published_to: string | null;
    already_imported: boolean;
    series_id: string | null;
    series_slug: string | null;
}

interface Props extends PageProps {
    results: RanobeDbResult[];
    pagination: {
        currentPage?: number;
        totalPages?: number;
        count?: number;
    };
    filters: { q: string };
    error: string | null;
}

export default function RanobeDbIndex({ results, pagination, filters, error }: Props) {
    const { t } = useTranslation('admin');
    const [search, setSearch]     = useState(filters.q);
    const [preview, setPreview]   = useState<RanobeDbResult | null>(null);
    const [importing, setImporting] = useState(false);
    const debounceRef             = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            if (search.trim()) {
                router.get(
                    route('admin.ranobedb.index'),
                    { q: search.trim() },
                    { preserveState: true, replace: true },
                );
            }
        }, 500);
        return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    }, [search]);

    function handleImport(item: RanobeDbResult) {
        setImporting(true);
        router.post(
            route('admin.ranobedb.import'),
            { ranobedb_id: item.ranobedb_id },
            { onFinish: () => { setImporting(false); setPreview(null); } },
        );
    }

    function goToPage(page: number) {
        router.get(
            route('admin.ranobedb.index'),
            { q: search.trim(), page },
            { preserveState: true, replace: true },
        );
    }

    const currentPage = pagination.currentPage ?? 1;
    const totalPages = pagination.totalPages ?? 1;

    return (
        <AdminLayout
            header={
                <PageHeader
                    title={t('ranobedb.title')}
                    description={t('ranobedb.description')}
                />
            }
        >
            <Head title={t('ranobedb.searchTitle')} />
            {/* Search */}
            <div className="mb-6 flex flex-wrap items-center gap-4">
                <div className="relative max-w-lg flex-1">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        className="pl-9"
                        placeholder={t('ranobedb.searchPlaceholder')}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
            </div>

            {/* Error state */}
            {error && (
                <div className="mb-6 flex items-start gap-3 rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
                    <span className="shrink-0 font-semibold">{t('anilist.errorPrefix')}</span>
                    <span>{error}</span>
                    <button
                        type="button"
                        className="ml-auto flex items-center gap-1 hover:underline"
                        onClick={() => router.get(route('admin.ranobedb.index'), { q: search }, { preserveState: true })}
                    >
                        <RefreshCw className="h-3 w-3" /> {t('anilist.tryAgain')}
                    </button>
                </div>
            )}

            {/* Empty / prompt state */}
            {!error && results.length === 0 && (
                <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
                    <BookOpen className="mb-4 h-12 w-12 opacity-30" />
                    <p className="text-sm">{filters.q ? t('anilist.noResults') : t('anilist.typeToSearch')}</p>
                </div>
            )}

            {/* Results grid */}
            {results.length > 0 && (
                <>
                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                        {results.map((item) => (
                            <div key={item.ranobedb_id} className="relative">
                                {/* Card */}
                                <button
                                    type="button"
                                    className="group flex w-full flex-col overflow-hidden rounded-lg border bg-card text-left transition-shadow hover:shadow-md focus:outline-none focus:ring-2 focus:ring-ring"
                                    onClick={() => setPreview(preview?.ranobedb_id === item.ranobedb_id ? null : item)}
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
                                    </div>

                                    {/* Info */}
                                    <div className="flex flex-col gap-1 p-3">
                                        <p className="line-clamp-2 text-sm font-medium leading-tight">{item.title}</p>
                                        {item.volumes && (
                                            <p className="text-xs text-muted-foreground">{t('anilist.volumeCount', { count: item.volumes })}</p>
                                        )}
                                    </div>
                                </button>

                                {/* Detail overlay — appears right on top of the card */}
                                {preview?.ranobedb_id === item.ranobedb_id && (
                                    <div className="absolute inset-0 z-20 flex flex-col justify-between overflow-hidden rounded-lg border border-border bg-card shadow-xl">
                                        <div className="flex items-start justify-between gap-2 border-b p-3">
                                            <div className="min-w-0">
                                                <p className="text-sm font-semibold leading-tight line-clamp-2">{item.title}</p>
                                                {item.title_display && item.title_display !== item.title && (
                                                    <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">{item.title_display}</p>
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
                                            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                                                <div>
                                                    <p className="text-muted-foreground">{t('anilist.volume')}</p>
                                                    <p className="font-medium">{item.volumes ?? '—'}</p>
                                                </div>
                                                <div>
                                                    <p className="text-muted-foreground">{t('ranobedb.published')}</p>
                                                    <p className="font-medium">{item.published_from ?? '—'}</p>
                                                </div>
                                            </div>
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
                    {totalPages > 1 && (
                        <div className="mt-6 flex items-center justify-center gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={currentPage <= 1}
                                onClick={() => goToPage(currentPage - 1)}
                            >
                                {t('anilist.previous')}
                            </Button>
                            <span className="text-sm text-muted-foreground">{t('ranobedb.pagePrefix', { page: currentPage, total: totalPages })}</span>
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={currentPage >= totalPages}
                                onClick={() => goToPage(currentPage + 1)}
                            >
                                {t('anilist.next')}
                            </Button>
                        </div>
                    )}
                </>
            )}
        </AdminLayout>
    );
}
