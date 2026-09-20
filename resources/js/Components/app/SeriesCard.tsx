import { useState, type MouseEvent } from 'react';
import { Link, router } from '@inertiajs/react';
import { useTranslation } from 'react-i18next';
import { BookOpen, Check, Plus, Loader2, LibraryBig } from 'lucide-react';
import { SeriesStatusBadge, SeriesTypeBadge } from '@/Components/app/StatusBadge';
import { AdultBlurOverlay } from '@/Components/app/AdultBlurOverlay';
import { cn } from '@/lib/utils';
import { type SeriesStatus, type SeriesType } from '@/lib/types';

interface SeriesCardProps {
    id: string;
    title_romaji: string;
    title_english: string | null;
    cover_url: string | null;
    status: SeriesStatus;
    type: SeriesType;
    total_volumes: number | null;
    volumes_count: number;
    score: number | null;
    href: string;
    inCollection?: boolean;
    is_adult?: boolean;
    /** Tampilkan quick-add/shortcut koleksi di atas cover — dipakai di Katalog, di-skip di halaman lain (mis. hasil "Series Serupa") biar nggak ganggu. */
    showCollectionQuickAction?: boolean;
}

export function SeriesCard({
    id,
    title_romaji,
    title_english,
    cover_url,
    status,
    type,
    score,
    href,
    inCollection,
    is_adult,
    showCollectionQuickAction,
}: SeriesCardProps) {
    const { t } = useTranslation();
    const [adding, setAdding] = useState(false);

    function handleQuickAdd(e: MouseEvent) {
        e.preventDefault();
        e.stopPropagation();
        if (adding) return;
        setAdding(true);
        router.post(route('collection.store'), { series_ids: [id] }, {
            preserveScroll: true,
            preserveState: true,
            onFinish: () => setAdding(false),
        });
    }

    function handleGoToCollection(e: MouseEvent) {
        e.preventDefault();
        e.stopPropagation();
        router.visit(route('collection.index'));
    }

    return (
        <Link href={href} className="group flex flex-col overflow-hidden rounded-lg border bg-card text-card-foreground transition-shadow hover:shadow-md">
            {/* Cover */}
            <AdultBlurOverlay isAdult={!!is_adult} className="aspect-[2/3] overflow-hidden bg-muted">
                {cover_url ? (
                    <img
                        src={cover_url}
                        alt={title_romaji}
                        className={cn(
                            'h-full w-full object-cover transition-transform duration-300 group-hover:scale-105',
                            inCollection && 'scale-105 blur-[2px]',
                        )}
                    />
                ) : (
                    <div className="flex h-full items-center justify-center">
                        <BookOpen className="h-10 w-10 text-muted-foreground/40" />
                    </div>
                )}
                {inCollection && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-black/40 px-2 text-center text-white">
                        <Check className="h-5 w-5" />
                        <span className="text-xs font-medium leading-tight">{t('components.seriesCard.alreadyInCollection')}</span>
                        {showCollectionQuickAction && (
                            <button
                                type="button"
                                onClick={handleGoToCollection}
                                className="mt-1 flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-medium text-black opacity-100 transition-opacity hover:bg-white md:opacity-0 md:group-hover:opacity-100"
                            >
                                <LibraryBig className="h-3 w-3" />
                                {t('components.seriesCard.goToCollection')}
                            </button>
                        )}
                    </div>
                )}
                {showCollectionQuickAction && !inCollection && (
                    <button
                        type="button"
                        onClick={handleQuickAdd}
                        disabled={adding}
                        aria-label={t('components.seriesCard.quickAdd')}
                        className="absolute bottom-2 right-2 flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-black opacity-100 transition-opacity hover:bg-white disabled:opacity-50 md:opacity-0 md:group-hover:opacity-100"
                    >
                        {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                    </button>
                )}
                {score !== null && (
                    <div className="absolute bottom-2 left-2 rounded bg-black/60 px-1.5 py-0.5 text-xs font-medium text-white">
                        ★ {Number(score).toFixed(1)}
                    </div>
                )}
            </AdultBlurOverlay>

            {/* Info */}
            <div className="flex flex-1 flex-col gap-1.5 p-3">
                <p className="line-clamp-2 text-sm font-medium leading-tight">{title_romaji}</p>
                {title_english && (
                    <p className="line-clamp-1 text-xs text-muted-foreground">{title_english}</p>
                )}
                <div className="mt-auto flex flex-wrap items-center gap-1 pt-1.5">
                    <SeriesTypeBadge type={type} />
                    <SeriesStatusBadge status={status} />
                </div>
            </div>
        </Link>
    );
}

export function SeriesCardSkeleton() {
    return (
        <div className="flex flex-col overflow-hidden rounded-lg border bg-card text-card-foreground">
            {/* Cover Aspect Ratio Skeleton */}
            <div className="aspect-[2/3] w-full animate-pulse bg-muted" />
            {/* Info Skeleton */}
            <div className="flex flex-1 flex-col gap-2 p-3">
                <div className="h-4 w-4/5 animate-pulse rounded bg-muted" />
                <div className="h-3 w-1/2 animate-pulse rounded bg-muted/60" />
                <div className="mt-auto flex items-center gap-1.5 pt-2">
                    <div className="h-5 w-12 animate-pulse rounded-full bg-muted" />
                    <div className="h-5 w-16 animate-pulse rounded-full bg-muted" />
                </div>
            </div>
        </div>
    );
}
