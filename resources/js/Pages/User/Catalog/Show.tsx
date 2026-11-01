import { useState } from 'react';
import { Head, Link, router } from '@inertiajs/react';
import { useTranslation } from 'react-i18next';
import { BookOpen, ExternalLink, Heart, Library, Ticket, Users } from 'lucide-react';
import UserLayout from '@/Layouts/UserLayout';
import PageHeader from '@/Components/app/PageHeader';
import { SeriesCard } from '@/Components/app/SeriesCard';
import { AdultBlurOverlay } from '@/Components/app/AdultBlurOverlay';
import { SeriesStatusBadge, SeriesTypeBadge } from '@/Components/app/StatusBadge';
import { Badge } from '@/Components/ui/badge';
import { Button, buttonVariants } from '@/Components/ui/button';
import {
    Avatar, AvatarFallback, AvatarGroup, AvatarGroupCount, AvatarImage,
} from '@/Components/ui/avatar';
import { cn } from '@/lib/utils';
import { PageProps } from '@/types';
import { type SeriesStatus, type SeriesType } from '@/lib/types';

interface SimilarSeriesRow {
    id: string;
    slug: string;
    title_romaji: string;
    title_english: string | null;
    cover_url: string | null;
    type: SeriesType;
    status: SeriesStatus;
    total_volumes: number | null;
    score: number | null;
    is_adult: boolean;
}

interface SeriesData {
    id: string;
    slug: string;
    anilist_id: number | null;
    title_romaji: string;
    title_english: string | null;
    title_japanese: string | null;
    synopsis: string | null;
    status: SeriesStatus;
    type: SeriesType;
    published_from: string | null;
    published_to: string | null;
    total_volumes: number | null;
    score: number | null;
    rank: number | null;
    cover_url: string | null;
    genres: string[] | null;
    authors: string[] | null;
    themes: string[] | null;
    demographics: string[] | null;
    is_adult: boolean;
}

interface MediaItem {
    id: string;
    image_url: string | null;
    caption: string | null;
}

interface CollectorAvatar {
    id: string;
    username: string | null;
    avatar: string | null;
}

interface WishlistItemRef {
    id: string;
}

interface Props extends PageProps {
    series: SeriesData;
    similar_series: SimilarSeriesRow[];
    media: MediaItem[];
    collection: { id: string } | null;
    wishlist_item: WishlistItemRef | null;
    collectors: { avatars: CollectorAvatar[]; count: number };
}

export default function CatalogShow({ series, similar_series, media, collection, wishlist_item, collectors }: Props) {
    const { t } = useTranslation('catalog');
    const [adding, setAdding] = useState(false);
    const [wishlisting, setWishlisting] = useState(false);

    function handleAddToCollection() {
        setAdding(true);
        router.post(
            route('collection.store'),
            { series_ids: [series.id] },
            {
                onFinish: () => setAdding(false),
            },
        );
    }

    function handleToggleWishlist() {
        setWishlisting(true);
        if (wishlist_item) {
            router.delete(route('wishlist.destroy', wishlist_item.id), {
                preserveScroll: true,
                onFinish: () => setWishlisting(false),
            });
        } else {
            router.post(route('wishlist.store'), { series_id: series.id }, {
                preserveScroll: true,
                onFinish: () => setWishlisting(false),
            });
        }
    }

    return (
        <UserLayout
            header={
                <PageHeader
                    title={series.title_romaji}
                    breadcrumbs={[
                        { label: t('title'), href: route('catalog.index') },
                        { label: series.title_romaji },
                    ]}
                    actions={
                        <div className="flex flex-wrap gap-2">
                            <Link
                                href={`${route('tickets.create')}?series_id=${series.id}`}
                                className={cn(buttonVariants({ variant: 'outline' }))}
                            >
                                <Ticket className="mr-1.5 h-4 w-4" />
                                {t('show.createTicket')}
                            </Link>
                            {collection ? (
                                <Link
                                    href={route('collection.show', series.slug)}
                                    className={cn(buttonVariants({ variant: 'outline' }))}
                                >
                                    <Library className="mr-1.5 h-4 w-4" />
                                    {t('show.viewInCollection')}
                                </Link>
                            ) : (
                                <Button onClick={handleAddToCollection} disabled={adding}>
                                    <Library className="mr-1.5 h-4 w-4" />
                                    {adding ? t('show.adding') : t('show.addToCollection')}
                                </Button>
                            )}
                            {!collection && (
                                <Button
                                    variant="outline"
                                    onClick={handleToggleWishlist}
                                    disabled={wishlisting}
                                >
                                    <Heart className={cn('mr-1.5 h-4 w-4', wishlist_item && 'fill-current')} />
                                    {wishlisting
                                        ? t('show.processing')
                                        : wishlist_item ? t('show.removeFromWishlist') : t('show.addToWishlist')}
                                </Button>
                            )}
                        </div>
                    }
                />
            }
        >
            <Head title={series.title_romaji} />
            {/* Series info */}
            <div className="grid gap-6 lg:grid-cols-[auto_1fr]">
                <div className="shrink-0">
                    <AdultBlurOverlay isAdult={series.is_adult} className="h-52 w-36 overflow-hidden rounded-lg bg-muted shadow-sm">
                        {series.cover_url ? (
                            <img src={series.cover_url} alt={series.title_romaji} className="h-full w-full object-cover" />
                        ) : (
                            <div className="flex h-full w-full items-center justify-center">
                                <BookOpen className="h-10 w-10 text-muted-foreground" />
                            </div>
                        )}
                    </AdultBlurOverlay>
                </div>

                <div className="space-y-3">
                    {series.title_english && <p className="text-muted-foreground">{series.title_english}</p>}
                    {series.title_japanese && <p className="text-sm text-muted-foreground">{series.title_japanese}</p>}
                    {series.authors && series.authors.length > 0 && (
                        <p className="text-sm text-muted-foreground">
                            <span className="text-xs">{t('show.author')}</span> {series.authors.join(', ')}
                        </p>
                    )}

                    <div className="flex flex-wrap gap-2">
                        <SeriesStatusBadge status={series.status} />
                        <SeriesTypeBadge type={series.type} />
                        {series.demographics?.map((d) => (
                            <Badge key={d} variant="secondary">{d}</Badge>
                        ))}
                    </div>

                    {((series.genres?.length ?? 0) > 0 || (series.themes?.length ?? 0) > 0) && (
                        <div className="flex flex-wrap gap-1.5">
                            {series.genres?.map((g) => (
                                <Badge key={g} variant="outline">{g}</Badge>
                            ))}
                            {series.themes?.map((t) => (
                                <Badge key={t} variant="outline" className="text-muted-foreground">{t}</Badge>
                            ))}
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm sm:grid-cols-4">
                        <div>
                            <p className="text-xs text-muted-foreground">{t('show.totalVolume')}</p>
                            <p className="font-medium">{series.total_volumes ?? '—'}</p>
                        </div>
                        <div>
                            <p className="text-xs text-muted-foreground">{t('show.score')}</p>
                            <p className="font-medium">
                                {series.score !== null ? Number(series.score).toFixed(2) : '—'}
                            </p>
                        </div>
                        <div>
                            <p className="text-xs text-muted-foreground">{t('show.rank')}</p>
                            <p className="font-medium">{series.rank ?? '—'}</p>
                        </div>
                        <div>
                            <p className="text-xs text-muted-foreground">{t('show.published')}</p>
                            <p className="font-medium">
                                {series.published_from ?? '—'}
                                {series.published_to ? ` – ${series.published_to}` : ''}
                            </p>
                        </div>
                    </div>

                    {collectors.count > 0 && (
                        <div className="flex items-center gap-2.5">
                            <AvatarGroup>
                                {collectors.avatars.map((c) => (
                                    <Avatar
                                        key={c.id}
                                        size="sm"
                                        className="cursor-pointer"
                                        onClick={() => router.visit(route('profile.show', c.username ?? c.id))}
                                    >
                                        <AvatarImage src={c.avatar || undefined} alt="" />
                                        <AvatarFallback>
                                            <Users className="h-3 w-3" />
                                        </AvatarFallback>
                                    </Avatar>
                                ))}
                                {collectors.count > collectors.avatars.length && (
                                    <AvatarGroupCount className="size-6 text-xs">
                                        +{collectors.count - collectors.avatars.length}
                                    </AvatarGroupCount>
                                )}
                            </AvatarGroup>
                            <p className="text-sm text-muted-foreground">
                                {t('show.collectorsCount', { count: collectors.count })}
                            </p>
                        </div>
                    )}

                    {series.synopsis && (
                        <p className="text-sm text-muted-foreground leading-relaxed">{series.synopsis}</p>
                    )}

                    {series.anilist_id && (
                        <a
                            href={`https://anilist.co/manga/${series.anilist_id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline"
                        >
                            {t('show.viewOnAnilist')}
                            <ExternalLink className="h-3 w-3" />
                        </a>
                    )}
                </div>
            </div>

            {/* Galeri media */}
            {media.length > 0 && (
                <div className="mt-8">
                    <h2 className="mb-3 text-base font-semibold">{t('show.gallery')}</h2>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                        {media.map((m) => (
                            <div key={m.id} className="aspect-video overflow-hidden rounded-lg border bg-muted">
                                {m.image_url && (
                                    <img src={m.image_url} alt={m.caption ?? series.title_romaji} className="h-full w-full object-cover" />
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Recommendations — similar series (same genre), replacing the removed volume list */}
            {similar_series.length > 0 && (
                <div className="mt-8">
                    <h2 className="mb-3 text-base font-semibold">{t('show.similarSeries')}</h2>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                        {similar_series.map((s) => (
                            <SeriesCard
                                key={s.id}
                                id={s.id}
                                title_romaji={s.title_romaji}
                                title_english={s.title_english}
                                cover_url={s.cover_url}
                                status={s.status}
                                type={s.type}
                                total_volumes={s.total_volumes}
                                volumes_count={0}
                                score={s.score}
                                is_adult={s.is_adult}
                                href={route('catalog.show', s.slug)}
                            />
                        ))}
                    </div>
                </div>
            )}
        </UserLayout>
    );
}
