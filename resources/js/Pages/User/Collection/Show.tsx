import { useEffect, useState } from 'react';
import { Head, Link, router } from '@inertiajs/react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import {
    BookMarked, BookOpen, Check, Eye, EyeOff, LayoutGrid, List, Minus, Plus, RotateCcw, Trash2, Wand2, X,
} from 'lucide-react';
import UserLayout from '@/Layouts/UserLayout';
import PageHeader from '@/Components/app/PageHeader';
import EmptyState from '@/Components/app/EmptyState';
import { AdultBlurOverlay } from '@/Components/app/AdultBlurOverlay';
import { SeriesStatusBadge, SeriesTypeBadge, VolumeFormatBadge } from '@/Components/app/StatusBadge';
import { Badge } from '@/Components/ui/badge';
import { Button, buttonVariants } from '@/Components/ui/button';
import { Checkbox } from '@/Components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle } from '@/Components/ui/card';
import { Input } from '@/Components/ui/input';
import { Label } from '@/Components/ui/label';
import { Textarea } from '@/Components/ui/textarea';
import { Slider } from '@/Components/ui/slider';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/Components/ui/select';
import {
    Popover, PopoverContent, PopoverHeader, PopoverTitle, PopoverTrigger,
} from '@/Components/ui/popover';
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/Components/ui/table';
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/Components/ui/dialog';
import { cn } from '@/lib/utils';
import { PageProps } from '@/types';
import {
    type SeriesStatus, type SeriesType, type CollectionVolumeFormat, type CollectionCondition,
    type EbookSource, type VolumeLanguage,
} from '@/lib/types';

const VOLUME_VIEW_KEY = 'malas.collection.volumes.view';

interface ActiveLoan {
    id: string;
    borrower_name: string;
    loaned_at: string | null;
    due_at: string | null;
    is_overdue: boolean;
}

interface VolumeRow {
    id: string;
    volume_number: number;
    format: CollectionVolumeFormat;
    ebook_source: EbookSource | null;
    language: VolumeLanguage | null;
    read_at: string | null;
    active_loan: ActiveLoan | null;
}

interface CollectionData {
    id: string;
    series_id: string;
    condition: CollectionCondition;
    personal_rating: number | null;
    personal_review: string | null;
}

interface SeriesData {
    id: string;
    slug: string;
    title_romaji: string;
    title_english: string | null;
    status: SeriesStatus;
    type: SeriesType;
    total_volumes: number | null;
    cover_url: string | null;
    genres: string[];
    themes: string[];
    demographics: string[];
    is_adult: boolean;
}

interface Props extends PageProps {
    collection: CollectionData;
    series: SeriesData;
    volumes: VolumeRow[];
    last_read_volume: number | null;
}

function useRatingLabel() {
    const { t } = useTranslation('collection');
    const ratingTiers: { min: number; label: string; className: string }[] = [
        { min: 5, label: t('show.review.labels.recommended'), className: 'text-green-600 dark:text-green-400' },
        { min: 1, label: t('show.review.labels.prettyGood'), className: 'text-lime-600 dark:text-lime-400' },
        { min: 0, label: t('show.review.labels.neutral'), className: 'text-muted-foreground' },
        { min: -4, label: t('show.review.labels.lacking'), className: 'text-orange-600 dark:text-orange-400' },
        { min: -10, label: t('show.review.labels.notRecommended'), className: 'text-destructive' },
    ];
    return (value: number) => ratingTiers.find((r) => value >= r.min) ?? ratingTiers[ratingTiers.length - 1];
}

const addVolumeSchema = z.object({
    volumes: z.string().min(1, 'Wajib diisi'),
    format:  z.enum(['physical', 'ebook', 'online', 'webtoon']),
    ebook_source: z.enum(['bookwalker', 'amazon', 'local_epub']).optional(),
    language: z.enum(['id', 'en', 'ja', 'other']).optional(),
}).refine((data) => data.format !== 'ebook' || !!data.ebook_source, {
    message: 'Pilih sumber ebook',
    path: ['ebook_source'],
});
type AddVolumeValues = z.infer<typeof addVolumeSchema>;

const formatUpdateSchema = z.object({
    format: z.enum(['physical', 'ebook', 'online', 'webtoon']),
    ebook_source: z.enum(['bookwalker', 'amazon', 'local_epub']).optional(),
    language: z.enum(['id', 'en', 'ja', 'other']).optional(),
}).refine((data) => data.format !== 'ebook' || !!data.ebook_source, {
    message: 'Pilih sumber ebook',
    path: ['ebook_source'],
});
type FormatUpdateValues = z.infer<typeof formatUpdateSchema>;

const loanSchema = z.object({
    borrower_name: z.string().min(1, 'Wajib diisi'),
    loaned_at:     z.string().min(1, 'Wajib diisi'),
    due_at:        z.string().optional(),
    notes:         z.string().optional(),
});
type LoanFormValues = z.infer<typeof loanSchema>;

function FieldError({ message }: { message?: string }) {
    if (!message) return null;
    return <p className="text-xs text-destructive">{message}</p>;
}

function useFormatLabels(): Record<string, string> {
    const { t } = useTranslation();
    return {
        physical: t('common:badge.format.physical'),
        ebook: t('common:badge.format.ebook'),
        online: t('common:badge.format.online'),
        webtoon: t('common:badge.format.webtoon'),
    };
}

function useEbookSourceLabels(): Record<EbookSource, string> {
    const { t } = useTranslation('collection');
    return {
        bookwalker: t('show.ebookSource.bookwalker'),
        amazon: t('show.ebookSource.amazon'),
        local_epub: t('show.ebookSource.local_epub'),
    };
}

function useLanguageLabels(): Record<VolumeLanguage, string> {
    const { t } = useTranslation('collection');
    return {
        id: t('show.language.id'),
        en: t('show.language.en'),
        ja: t('show.language.ja'),
        other: t('show.language.other'),
    };
}

function useConditionLabels(): Record<CollectionCondition, string> {
    const { t } = useTranslation('collection');
    return {
        mint: t('show.condition.mint'),
        good: t('show.condition.good'),
        fair: t('show.condition.fair'),
        poor: t('show.condition.poor'),
    };
}

function VolumeFormatSwitcher({ collectionId, volume }: { collectionId: string; volume: VolumeRow }) {
    const { t } = useTranslation('collection');
    const formatLabels = useFormatLabels();
    const ebookSourceLabels = useEbookSourceLabels();
    const languageLabels = useLanguageLabels();
    const [open, setOpen] = useState(false);
    const [saving, setSaving] = useState(false);

    const {
        control, handleSubmit, reset, watch,
        formState: { errors },
    } = useForm<FormatUpdateValues>({
        resolver: zodResolver(formatUpdateSchema),
        defaultValues: {
            format: volume.format,
            ebook_source: volume.ebook_source ?? undefined,
            language: volume.language ?? undefined,
        },
    });

    useEffect(() => {
        if (open) {
            reset({
                format: volume.format,
                ebook_source: volume.ebook_source ?? undefined,
                language: volume.language ?? undefined,
            });
        }
    }, [open, volume, reset]);

    const currentFormat = watch('format');

    function onSave(values: FormatUpdateValues) {
        setSaving(true);
        router.patch(
            route('collection.volumes.updateFormat', { collection: collectionId, collectionVolume: volume.id }),
            values,
            { preserveScroll: true, onSuccess: () => setOpen(false), onFinish: () => setSaving(false) },
        );
    }

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger render={<button type="button" />}>
                <VolumeFormatBadge format={volume.format} />
            </PopoverTrigger>
            <PopoverContent className="w-64" align="start" onClick={(e) => e.stopPropagation()}>
                <PopoverHeader>
                    <PopoverTitle>{t('show.formatSwitcher.title', { number: volume.volume_number })}</PopoverTitle>
                </PopoverHeader>
                <form onSubmit={handleSubmit(onSave)} className="space-y-3">
                    <div className="space-y-1.5">
                        <Label className="text-xs">{t('show.addVolumeDialog.format')}</Label>
                        <Controller<FormatUpdateValues, 'format'>
                            control={control}
                            name="format"
                            render={({ field }) => (
                                <Select value={field.value} onValueChange={field.onChange}>
                                    <SelectTrigger className="h-8 w-full text-xs">
                                        <SelectValue>{(value: string) => formatLabels[value] ?? value}</SelectValue>
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="physical">{t('common:badge.format.physical')}</SelectItem>
                                        <SelectItem value="ebook">{t('common:badge.format.ebook')}</SelectItem>
                                        <SelectItem value="online">{t('common:badge.format.online')}</SelectItem>
                                        <SelectItem value="webtoon">{t('common:badge.format.webtoon')}</SelectItem>
                                    </SelectContent>
                                </Select>
                            )}
                        />
                    </div>
                    {currentFormat === 'ebook' && (
                        <div className="space-y-1.5">
                            <Label className="text-xs">{t('show.addVolumeDialog.ebookSource')}</Label>
                            <Controller<FormatUpdateValues, 'ebook_source'>
                                control={control}
                                name="ebook_source"
                                render={({ field }) => (
                                    <Select value={field.value ?? ''} onValueChange={field.onChange}>
                                        <SelectTrigger className="h-8 w-full text-xs">
                                            <SelectValue placeholder={t('show.addVolumeDialog.selectSource')}>
                                                {(value: string) => ebookSourceLabels[value as EbookSource] ?? t('show.addVolumeDialog.selectSource')}
                                            </SelectValue>
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="bookwalker">{t('show.ebookSource.bookwalker')}</SelectItem>
                                            <SelectItem value="amazon">{t('show.ebookSource.amazon')}</SelectItem>
                                            <SelectItem value="local_epub">{t('show.ebookSource.local_epub')}</SelectItem>
                                        </SelectContent>
                                    </Select>
                                )}
                            />
                            <FieldError message={errors.ebook_source?.message} />
                        </div>
                    )}
                    <div className="space-y-1.5">
                        <Label className="text-xs">{t('show.addVolumeDialog.language')}</Label>
                        <Controller<FormatUpdateValues, 'language'>
                            control={control}
                            name="language"
                            render={({ field }) => (
                                <Select value={field.value ?? ''} onValueChange={field.onChange}>
                                    <SelectTrigger className="h-8 w-full text-xs">
                                        <SelectValue placeholder={t('show.addVolumeDialog.language')}>
                                            {(value: string) => languageLabels[value as VolumeLanguage] ?? t('show.addVolumeDialog.language')}
                                        </SelectValue>
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="id">{t('show.language.id')}</SelectItem>
                                        <SelectItem value="en">{t('show.language.en')}</SelectItem>
                                        <SelectItem value="ja">{t('show.language.ja')}</SelectItem>
                                        <SelectItem value="other">{t('show.language.other')}</SelectItem>
                                    </SelectContent>
                                </Select>
                            )}
                        />
                    </div>
                    <Button type="submit" size="sm" className="w-full" disabled={saving}>
                        {saving ? t('show.formatSwitcher.saving') : t('show.formatSwitcher.save')}
                    </Button>
                </form>
            </PopoverContent>
        </Popover>
    );
}

export default function CollectionShow({ collection, series, volumes, last_read_volume }: Props) {
    const { t } = useTranslation('collection');
    const formatLabels = useFormatLabels();
    const ebookSourceLabels = useEbookSourceLabels();
    const languageLabels = useLanguageLabels();
    const conditionLabels = useConditionLabels();
    const ratingLabel = useRatingLabel();
    const [addVolumeOpen, setAddVolumeOpen]   = useState(false);
    const [loanTarget, setLoanTarget]         = useState<VolumeRow | null>(null);
    const [deleteVolume, setDeleteVolume]     = useState<VolumeRow | null>(null);
    const [deleteOpen, setDeleteOpen]         = useState(false);
    const [addingVolume, setAddingVolume]     = useState(false);
    const [submittingLoan, setSubmittingLoan] = useState(false);
    const [deletingVol, setDeletingVol]       = useState(false);
    const [deleting, setDeleting]             = useState(false);
    const [returningId, setReturningId]       = useState<string | null>(null);
    const [selectMode, setSelectMode]         = useState(false);
    const [selectedIds, setSelectedIds]       = useState<Set<string>>(new Set());
    const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
    const [bulkDeleting, setBulkDeleting]     = useState(false);
    const [formatFilter, setFormatFilter]     = useState('all');
    const [bulkFormatOpen, setBulkFormatOpen] = useState(false);
    const [bulkFormatSaving, setBulkFormatSaving] = useState(false);
    const [togglingReadId, setTogglingReadId] = useState<string | null>(null);
    const [markingAllRead, setMarkingAllRead]  = useState(false);
    const [volumeView, setVolumeView]         = useState<'grid' | 'table'>(() => {
        if (typeof window === 'undefined') return 'grid';
        return (window.localStorage.getItem(VOLUME_VIEW_KEY) as 'grid' | 'table') || 'grid';
    });
    const [updatingCondition, setUpdatingCondition] = useState(false);
    const [advancingRead, setAdvancingRead]   = useState<'forward' | 'backward' | null>(null);
    const [adjustingFormat, setAdjustingFormat] = useState<string | null>(null);
    const [rating, setRating]                 = useState(collection.personal_rating ?? 0);
    const [reviewText, setReviewText]         = useState(collection.personal_review ?? '');
    const [savingReview, setSavingReview]     = useState(false);

    const today = new Date().toISOString().split('T')[0];

    function handleVolumeViewChange(mode: 'grid' | 'table') {
        setVolumeView(mode);
        window.localStorage.setItem(VOLUME_VIEW_KEY, mode);
    }

    function handleConditionChange(condition: string | null) {
        if (!condition) return;
        setUpdatingCondition(true);
        router.patch(route('collection.condition.update', collection.id), { condition }, {
            preserveScroll: true,
            onFinish: () => setUpdatingCondition(false),
        });
    }

    function toggleSelectMode() {
        setSelectMode((prev) => {
            if (prev) setSelectedIds(new Set());
            return !prev;
        });
    }

    function handleAdvanceRead(direction: 'forward' | 'backward') {
        setAdvancingRead(direction);
        router.patch(
            route('collection.volumes.readProgress', collection.id),
            { direction },
            { preserveScroll: true, onFinish: () => setAdvancingRead(null) },
        );
    }

    function handleQuickCount(format: CollectionVolumeFormat, direction: 'add' | 'remove') {
        setAdjustingFormat(`${format}:${direction}`);
        router.patch(
            route('collection.volumes.quickCount', collection.id),
            { format, direction },
            { preserveScroll: true, onFinish: () => setAdjustingFormat(null) },
        );
    }

    function toggleRead(volumeId: string) {
        setTogglingReadId(volumeId);
        router.patch(
            route('collection.volumes.toggleRead', { collection: collection.id, collectionVolume: volumeId }),
            {},
            { preserveScroll: true, onFinish: () => setTogglingReadId(null) },
        );
    }

    function handleMarkAllRead() {
        setMarkingAllRead(true);
        router.patch(
            route('collection.volumes.readAll', collection.id),
            {},
            { preserveScroll: true, onFinish: () => setMarkingAllRead(false) },
        );
    }

    function handleSaveReview() {
        setSavingReview(true);
        router.patch(
            route('collection.review.update', collection.id),
            { personal_rating: rating, personal_review: reviewText || null },
            { preserveScroll: true, onFinish: () => setSavingReview(false) },
        );
    }

    // Add volume form
    const {
        register: avReg, control: avCtrl, handleSubmit: avSubmit,
        setError: avSetError, reset: avReset, watch: avWatch,
        formState: { errors: avErrors },
    } = useForm<AddVolumeValues>({
        resolver: zodResolver(addVolumeSchema),
        defaultValues: { format: 'physical' },
    });

    const avFormat = avWatch('format');

    // Prefill + auto-open "Add Volume" when arriving from the "missing volumes" badge in My Collection
    // (?addVolumes=4,6-7,9-12) — clear the query param afterwards so refresh/back doesn't
    // trigger it again.
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const prefill = params.get('addVolumes');
        if (!prefill) return;

        avReset({ volumes: prefill, format: 'physical' });
        setAddVolumeOpen(true);

        params.delete('addVolumes');
        const query = params.toString();
        window.history.replaceState(null, '', window.location.pathname + (query ? `?${query}` : ''));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Loan form
    const {
        register, handleSubmit, reset, setError,
        formState: { errors },
    } = useForm<LoanFormValues>({
        resolver: zodResolver(loanSchema),
        defaultValues: { loaned_at: today },
    });

    // Bulk format-change form
    const {
        control: bfCtrl, handleSubmit: bfSubmit, reset: bfReset, watch: bfWatch,
        formState: { errors: bfErrors },
    } = useForm<FormatUpdateValues>({
        resolver: zodResolver(formatUpdateSchema),
        defaultValues: { format: 'physical' },
    });
    const bfFormat = bfWatch('format');

    function onBulkFormatSave(values: FormatUpdateValues) {
        setBulkFormatSaving(true);
        router.patch(
            route('collection.volumes.updateFormatBulk', collection.id),
            { ...values, volume_ids: Array.from(selectedIds) },
            {
                preserveScroll: true,
                onSuccess: () => { setBulkFormatOpen(false); setSelectedIds(new Set()); },
                onFinish: () => setBulkFormatSaving(false),
            },
        );
    }

    function onAddVolume(values: AddVolumeValues) {
        setAddingVolume(true);
        router.post(route('collection.volumes.store', collection.id), values, {
            onSuccess: () => { avReset({ format: 'physical' }); setAddVolumeOpen(false); },
            onError: (errs) => {
                Object.entries(errs).forEach(([k, msg]) => {
                    avSetError(k as keyof AddVolumeValues, { message: msg });
                });
            },
            onFinish: () => setAddingVolume(false),
        });
    }

    function handleDeleteVolume() {
        if (!deleteVolume) return;
        setDeletingVol(true);
        router.delete(route('collection.volumes.destroy', { collection: collection.id, collectionVolume: deleteVolume.id }), {
            onFinish: () => { setDeletingVol(false); setDeleteVolume(null); },
        });
    }

    function onLoanSubmit(values: LoanFormValues) {
        if (!loanTarget) return;
        setSubmittingLoan(true);
        router.post(
            route('loans.store', collection.id),
            { ...values, collection_volume_id: loanTarget.id },
            {
                onSuccess: () => { reset({ loaned_at: today }); setLoanTarget(null); },
                onError: (errs) => {
                    Object.entries(errs).forEach(([k, msg]) => {
                        setError(k as keyof LoanFormValues, { message: msg });
                    });
                },
                onFinish: () => setSubmittingLoan(false),
            },
        );
    }

    function markReturned(loanId: string) {
        setReturningId(loanId);
        router.put(route('loans.return', loanId), {}, {
            preserveScroll: true,
            onFinish: () => setReturningId(null),
        });
    }

    function handleDelete() {
        setDeleting(true);
        router.delete(route('collection.destroy', collection.id), {
            onFinish: () => { setDeleting(false); setDeleteOpen(false); },
        });
    }

    function toggleVolumeSelect(id: string) {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    }

    function handleBulkDelete() {
        setBulkDeleting(true);
        router.delete(route('collection.volumes.destroyBulk', collection.id), {
            data: { volume_ids: Array.from(selectedIds) },
            onSuccess: () => setSelectedIds(new Set()),
            onFinish: () => { setBulkDeleting(false); setBulkDeleteOpen(false); },
        });
    }

    const ownedCount = volumes.length;
    const filteredVolumes = formatFilter !== 'all' ? volumes.filter((v) => v.format === formatFilter) : volumes;
    const hasUnreadVolume = volumes.some((v) => !v.read_at);
    const hasReadVolume = volumes.some((v) => v.read_at);
    const formatSummaries = (['physical', 'ebook', 'online', 'webtoon'] as CollectionVolumeFormat[])
        .map((format) => {
            const forFormat = volumes.filter((v) => v.format === format);
            if (forFormat.length === 0) return null;
            const top = forFormat.reduce((a, b) => (b.volume_number > a.volume_number ? b : a));
            return { format, count: forFormat.length, topLoaned: !!top.active_loan };
        })
        .filter((x): x is { format: CollectionVolumeFormat; count: number; topLoaned: boolean } => x !== null);

    return (
        <UserLayout
            header={
                <PageHeader
                    title={series.title_romaji}
                    breadcrumbs={[
                        { label: t('index.title'), href: route('collection.index') },
                        { label: series.title_romaji },
                    ]}
                    actions={
                        <div className="flex flex-wrap gap-2">
                            <Link
                                href={route('catalog.show', series.slug)}
                                className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
                            >
                                {t('show.viewCatalog')}
                            </Link>
                            <Button variant="destructive" size="sm" onClick={() => setDeleteOpen(true)}>
                                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                                {t('show.deleteCollection')}
                            </Button>
                        </div>
                    }
                />
            }
        >
            <Head title={series.title_romaji} />
            {/* Series info & progress */}
            <div className="grid gap-6 lg:grid-cols-[auto_1fr]">
                <div className="shrink-0">
                    <AdultBlurOverlay isAdult={series.is_adult} className="h-40 w-28 overflow-hidden rounded-lg bg-muted shadow-sm">
                        {series.cover_url ? (
                            <img src={series.cover_url} alt={series.title_romaji} className="h-full w-full object-cover" />
                        ) : (
                            <div className="flex h-full w-full items-center justify-center">
                                <BookOpen className="h-8 w-8 text-muted-foreground" />
                            </div>
                        )}
                    </AdultBlurOverlay>
                </div>

                <div className="space-y-3">
                    {series.title_english && <p className="text-muted-foreground">{series.title_english}</p>}
                    <div className="flex flex-wrap gap-2">
                        <SeriesStatusBadge status={series.status} />
                        <SeriesTypeBadge type={series.type} />
                    </div>
                    {(series.genres.length > 0 || series.themes.length > 0 || series.demographics.length > 0) && (
                        <div className="flex flex-wrap gap-1.5">
                            {series.demographics.map((d) => (
                                <Badge key={d} variant="secondary">{d}</Badge>
                            ))}
                            {series.genres.map((g) => (
                                <Badge key={g} variant="outline">{g}</Badge>
                            ))}
                            {series.themes.map((theme) => (
                                <Badge key={theme} variant="outline" className="text-muted-foreground">{theme}</Badge>
                            ))}
                        </div>
                    )}
                    <div className="text-sm">
                        <p className="text-xs text-muted-foreground">{t('show.progress')}</p>
                        <p className="font-medium">
                            {ownedCount}{series.total_volumes ? `/${series.total_volumes}` : ''} {t('show.volumesOwned')}
                        </p>
                        {last_read_volume !== null && (
                            <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                                <Eye className="h-3 w-3" />
                                {t('show.lastRead', { number: last_read_volume })}
                            </p>
                        )}
                        {series.total_volumes && series.total_volumes > 0 && (
                            <div className="mt-1.5 h-2 w-48 overflow-hidden rounded-full bg-muted">
                                <div
                                    className="h-full rounded-full bg-primary transition-all [width:var(--w)]"
                                    style={{ '--w': `${Math.min(100, (ownedCount / series.total_volumes!) * 100)}%` } as React.CSSProperties}
                                />
                            </div>
                        )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="text-xs text-muted-foreground">{t('show.readProgress.label')}</span>
                        <div className="flex items-center gap-1 rounded-md border p-0.5">
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                disabled={!hasReadVolume || advancingRead !== null}
                                onClick={() => handleAdvanceRead('backward')}
                                aria-label={t('show.readProgress.decrease')}
                            >
                                <Minus className="h-3.5 w-3.5" />
                            </Button>
                            <span className="min-w-14 text-center text-xs font-medium">
                                {last_read_volume !== null
                                    ? t('show.readProgress.upTo', { number: last_read_volume })
                                    : t('show.readProgress.none')}
                            </span>
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                disabled={!hasUnreadVolume || advancingRead !== null}
                                onClick={() => handleAdvanceRead('forward')}
                                aria-label={t('show.readProgress.increase')}
                            >
                                <Plus className="h-3.5 w-3.5" />
                            </Button>
                        </div>
                    </div>

                    {formatSummaries.length > 0 && (
                        <div className="flex flex-wrap items-center gap-2 text-sm">
                            <span className="text-xs text-muted-foreground">{t('show.quickCount.label')}</span>
                            {formatSummaries.map(({ format, count, topLoaned }) => (
                                <div key={format} className="flex items-center gap-1 rounded-md border py-0.5 pl-2 pr-0.5">
                                    <span className="text-xs text-muted-foreground">{formatLabels[format]}</span>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6"
                                        disabled={topLoaned || adjustingFormat !== null}
                                        title={topLoaned ? t('show.quickCount.loanedTooltip') : undefined}
                                        onClick={() => handleQuickCount(format, 'remove')}
                                        aria-label={t('show.quickCount.decrease', { format: formatLabels[format] })}
                                    >
                                        <Minus className="h-3 w-3" />
                                    </Button>
                                    <span className="min-w-5 text-center text-xs font-semibold">{count}</span>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6"
                                        disabled={adjustingFormat !== null}
                                        onClick={() => handleQuickCount(format, 'add')}
                                        aria-label={t('show.quickCount.increase', { format: formatLabels[format] })}
                                    >
                                        <Plus className="h-3 w-3" />
                                    </Button>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="flex items-center gap-2 text-sm">
                        <span className="text-xs text-muted-foreground">{t('show.conditionOptional')}</span>
                        <Select
                            value={collection.condition}
                            onValueChange={handleConditionChange}
                            disabled={updatingCondition}
                        >
                            <SelectTrigger className="h-7 w-28 text-xs">
                                <SelectValue>
                                    {(value: CollectionCondition) => conditionLabels[value]}
                                </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                                {(Object.keys(conditionLabels) as CollectionCondition[]).map((c) => (
                                    <SelectItem key={c} value={c}>{conditionLabels[c]}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            </div>

            {/* Volume list */}
            <div className="mt-8">
                <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-1.5">
                        {!selectMode && volumes.some((v) => !v.read_at) && (
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                disabled={markingAllRead}
                                onClick={handleMarkAllRead}
                                aria-label={t('show.markAllRead')}
                                title={t('show.markAllRead')}
                            >
                                <Eye className="h-4 w-4" />
                            </Button>
                        )}
                        <h2 className="text-base font-semibold">{t('show.volumesOwnedHeading', { count: ownedCount })}</h2>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        {selectMode && selectedIds.size > 0 && (
                            <>
                                <Button size="sm" variant="outline" onClick={() => { bfReset({ format: 'physical' }); setBulkFormatOpen(true); }}>
                                    <Wand2 className="mr-1.5 h-3.5 w-3.5" />
                                    {t('show.changeFormat', { count: selectedIds.size })}
                                </Button>
                                <Button size="sm" variant="destructive" onClick={() => setBulkDeleteOpen(true)}>
                                    <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                                    {t('show.deleteCount', { count: selectedIds.size })}
                                </Button>
                            </>
                        )}
                        <Select value={formatFilter} onValueChange={(v) => setFormatFilter(v ?? 'all')}>
                            <SelectTrigger className="h-8 w-32 text-xs">
                                <SelectValue placeholder={t('show.allFormat')}>
                                    {(value: string) => formatLabels[value] ?? t('show.allFormat')}
                                </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">{t('show.allFormat')}</SelectItem>
                                <SelectItem value="physical">{t('common:badge.format.physical')}</SelectItem>
                                <SelectItem value="ebook">{t('common:badge.format.ebook')}</SelectItem>
                                <SelectItem value="online">{t('common:badge.format.online')}</SelectItem>
                                <SelectItem value="webtoon">{t('common:badge.format.webtoon')}</SelectItem>
                            </SelectContent>
                        </Select>
                        <Button
                            type="button"
                            size="sm"
                            variant={selectMode ? 'secondary' : 'outline'}
                            onClick={toggleSelectMode}
                        >
                            {selectMode ? (
                                <>
                                    <X className="mr-1.5 h-3.5 w-3.5" />
                                    {t('show.done')}
                                </>
                            ) : (
                                <>
                                    <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                                    {t('show.delete')}
                                </>
                            )}
                        </Button>
                        <div className="flex items-center gap-1 rounded-md border p-0.5">
                            <Button
                                type="button"
                                variant={volumeView === 'grid' ? 'secondary' : 'ghost'}
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => handleVolumeViewChange('grid')}
                                aria-label={t('show.gridView')}
                            >
                                <LayoutGrid className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                                type="button"
                                variant={volumeView === 'table' ? 'secondary' : 'ghost'}
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => handleVolumeViewChange('table')}
                                aria-label={t('show.tableView')}
                            >
                                <List className="h-3.5 w-3.5" />
                            </Button>
                        </div>
                        <Button size="sm" onClick={() => setAddVolumeOpen(true)}>
                            <Plus className="mr-1.5 h-3.5 w-3.5" />
                            {t('show.addVolume')}
                        </Button>
                    </div>
                </div>

                {volumes.length === 0 ? (
                    <EmptyState
                        title={t('show.empty.title')}
                        description={t('show.empty.description')}
                        icon={BookOpen}
                        action={
                            <Button size="sm" onClick={() => setAddVolumeOpen(true)}>
                                <Plus className="mr-1.5 h-4 w-4" />
                                {t('show.addVolume')}
                            </Button>
                        }
                    />
                ) : filteredVolumes.length === 0 ? (
                    <p className="py-12 text-center text-sm text-muted-foreground">
                        {t('show.noneForFormat')}
                    </p>
                ) : volumeView === 'grid' ? (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                        {filteredVolumes.map((v) => (
                            <div
                                key={v.id}
                                className={cn(
                                    'flex flex-col overflow-hidden rounded-lg border bg-card',
                                    selectedIds.has(v.id) && 'ring-2 ring-primary',
                                    v.read_at && 'opacity-50 grayscale',
                                )}
                            >
                                {/* There is no per-volume cover (removed, see CHANGELOG) — rather than leaving an
                                    empty placeholder (just a number in the middle), the center doubles as a
                                    read/unread toggle button (big eye icon), so the otherwise idle area
                                    is useful. */}
                                <div
                                    className={cn(
                                        'relative flex aspect-[2/3] items-center justify-center bg-muted',
                                        selectMode && 'cursor-pointer',
                                    )}
                                    onClick={() => selectMode && toggleVolumeSelect(v.id)}
                                >
                                    {selectMode ? (
                                        <Checkbox
                                            checked={selectedIds.has(v.id)}
                                            className="pointer-events-none absolute left-1.5 top-1.5 bg-background"
                                            aria-label={t('show.selectVolume', { number: v.volume_number })}
                                        />
                                    ) : (
                                        <button
                                            type="button"
                                            disabled={togglingReadId === v.id}
                                            onClick={() => toggleRead(v.id)}
                                            className="flex h-full w-full flex-col items-center justify-center gap-1.5 text-muted-foreground/50 transition-colors hover:text-foreground disabled:opacity-50"
                                            aria-label={v.read_at ? t('show.markUnread', { number: v.volume_number }) : t('show.markRead', { number: v.volume_number })}
                                        >
                                            {v.read_at ? <Eye className="h-8 w-8" /> : <EyeOff className="h-8 w-8" />}
                                            <span className="text-xs font-medium">{t('show.volumeShort')} {v.volume_number}</span>
                                        </button>
                                    )}
                                </div>

                                <div className="flex flex-col gap-1.5 p-2">
                                    <div className="flex items-center justify-between">
                                        <p className="text-xs font-medium">{t('show.volumeLabel', { number: v.volume_number })}</p>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            className="h-5 w-5 text-destructive/60 hover:text-destructive"
                                            onClick={() => setDeleteVolume(v)}
                                        >
                                            <Trash2 className="h-3 w-3" />
                                        </Button>
                                    </div>

                                    <VolumeFormatSwitcher collectionId={collection.id} volume={v} />

                                    {v.active_loan ? (
                                        <div className="space-y-1">
                                            <Badge
                                                variant="outline"
                                                className={cn(
                                                    'text-xs w-full justify-center',
                                                    v.active_loan.is_overdue
                                                        ? 'border-destructive text-destructive'
                                                        : 'border-yellow-500 text-yellow-600 dark:text-yellow-400',
                                                )}
                                            >
                                                {v.active_loan.is_overdue ? t('show.loanStatus.overdue') : t('show.loanStatus.onLoan')}
                                            </Badge>
                                            <p className="truncate text-xs text-muted-foreground">{v.active_loan.borrower_name}</p>
                                            <button
                                                type="button"
                                                className="flex items-center gap-1 text-xs text-primary hover:underline disabled:opacity-50"
                                                disabled={returningId === v.active_loan.id}
                                                onClick={() => markReturned(v.active_loan!.id)}
                                            >
                                                <RotateCcw className="h-3 w-3" />
                                                {returningId === v.active_loan.id ? t('show.returning') : t('show.markReturned')}
                                            </button>
                                        </div>
                                    ) : (
                                        <button
                                            type="button"
                                            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                                            onClick={() => setLoanTarget(v)}
                                        >
                                            <BookMarked className="h-3 w-3" />
                                            {t('show.lendOut')}
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="rounded-lg border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-10" />
                                    <TableHead className="w-20">{t('show.columnVolume')}</TableHead>
                                    <TableHead>{t('show.columnFormat')}</TableHead>
                                    <TableHead>{t('show.columnLoanStatus')}</TableHead>
                                    <TableHead className="w-12" />
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredVolumes.map((v) => (
                                    <TableRow
                                        key={v.id}
                                        className={cn(
                                            selectMode && 'cursor-pointer',
                                            selectedIds.has(v.id) && 'bg-muted/50',
                                            v.read_at && 'opacity-50 grayscale',
                                        )}
                                        onClick={() => selectMode && toggleVolumeSelect(v.id)}
                                    >
                                        <TableCell onClick={(e) => e.stopPropagation()}>
                                            {selectMode ? (
                                                <Checkbox
                                                    checked={selectedIds.has(v.id)}
                                                    onCheckedChange={() => toggleVolumeSelect(v.id)}
                                                    aria-label={t('show.selectVolume', { number: v.volume_number })}
                                                />
                                            ) : (
                                                <button
                                                    type="button"
                                                    disabled={togglingReadId === v.id}
                                                    onClick={() => toggleRead(v.id)}
                                                    className="text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
                                                    aria-label={v.read_at ? t('show.markUnread', { number: v.volume_number }) : t('show.markRead', { number: v.volume_number })}
                                                >
                                                    {v.read_at ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                                                </button>
                                            )}
                                        </TableCell>
                                        <TableCell className="font-medium">{t('show.volumeLabel', { number: v.volume_number })}</TableCell>
                                        <TableCell onClick={(e) => e.stopPropagation()}>
                                            <VolumeFormatSwitcher collectionId={collection.id} volume={v} />
                                        </TableCell>
                                        <TableCell onClick={(e) => e.stopPropagation()}>
                                            {v.active_loan ? (
                                                <div className="flex items-center gap-2">
                                                    <Badge
                                                        variant="outline"
                                                        className={cn(
                                                            'text-xs',
                                                            v.active_loan.is_overdue
                                                                ? 'border-destructive text-destructive'
                                                                : 'border-yellow-500 text-yellow-600 dark:text-yellow-400',
                                                        )}
                                                    >
                                                        {v.active_loan.is_overdue ? t('show.loanStatus.overdue') : t('show.loanStatus.onLoan')}
                                                    </Badge>
                                                    <span className="text-xs text-muted-foreground">{v.active_loan.borrower_name}</span>
                                                    <button
                                                        type="button"
                                                        className="flex items-center gap-1 text-xs text-primary hover:underline disabled:opacity-50"
                                                        disabled={returningId === v.active_loan.id}
                                                        onClick={() => markReturned(v.active_loan!.id)}
                                                    >
                                                        <RotateCcw className="h-3 w-3" />
                                                        {t('show.returnShort')}
                                                    </button>
                                                </div>
                                            ) : (
                                                <button
                                                    type="button"
                                                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                                                    onClick={() => setLoanTarget(v)}
                                                >
                                                    <BookMarked className="h-3 w-3" />
                                                    {t('show.lendOut')}
                                                </button>
                                            )}
                                        </TableCell>
                                        <TableCell onClick={(e) => e.stopPropagation()}>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                className="h-7 w-7 text-destructive/60 hover:text-destructive"
                                                onClick={() => setDeleteVolume(v)}
                                            >
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                )}
            </div>

            {/* Review & Rating pribadi */}
            <div className="mt-8">
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">{t('show.review.title')}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-5">
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <Label>{t('show.review.rating')}</Label>
                                <span className={cn('text-sm font-semibold', ratingLabel(rating).className)}>
                                    {rating > 0 ? `+${rating}` : rating} · {ratingLabel(rating).label}
                                </span>
                            </div>
                            <Slider
                                min={-10}
                                max={10}
                                step={1}
                                value={[rating]}
                                onValueChange={(v) => setRating(Array.isArray(v) ? v[0] : v)}
                            />
                            <div className="flex justify-between text-xs text-muted-foreground">
                                <span>-10 {t('show.review.notRecommended')}</span>
                                <span>10 {t('show.review.recommended')}</span>
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="personal_review">{t('show.review.comment')}</Label>
                            <Textarea
                                id="personal_review"
                                rows={4}
                                placeholder={t('show.review.commentPlaceholder')}
                                value={reviewText}
                                onChange={(e) => setReviewText(e.target.value)}
                            />
                        </div>
                        <Button size="sm" disabled={savingReview} onClick={handleSaveReview}>
                            <Check className="mr-1.5 h-3.5 w-3.5" />
                            {savingReview ? t('show.review.saving') : t('show.review.save')}
                        </Button>
                    </CardContent>
                </Card>
            </div>

            {/* Add Volume Dialog */}
            <Dialog open={addVolumeOpen} onOpenChange={(open) => { setAddVolumeOpen(open); if (!open) avReset({ format: 'physical' }); }}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t('show.addVolumeDialog.title')}</DialogTitle>
                        <DialogDescription>
                            {t('show.addVolumeDialog.descriptionPrefix')} <strong>1,2,3,5-9,11,12,15-18</strong>
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={avSubmit(onAddVolume)} className="space-y-4">
                        <div className="space-y-1.5">
                            <Label htmlFor="volumes">{t('show.addVolumeDialog.volumeNumber')} <span className="text-destructive">*</span></Label>
                            <Input
                                id="volumes"
                                placeholder="1,2,3,5-9,11,12"
                                {...avReg('volumes')}
                            />
                            <FieldError message={avErrors.volumes?.message} />
                        </div>
                        <div className="space-y-1.5">
                            <Label>{t('show.addVolumeDialog.format')} <span className="text-destructive">*</span></Label>
                            <Controller<AddVolumeValues, 'format'>
                                control={avCtrl}
                                name="format"
                                render={({ field }) => (
                                    <Select value={field.value} onValueChange={field.onChange}>
                                        <SelectTrigger>
                                            <SelectValue>
                                                {(value: string) => formatLabels[value] ?? value}
                                            </SelectValue>
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="physical">{t('common:badge.format.physical')}</SelectItem>
                                            <SelectItem value="ebook">{t('common:badge.format.ebook')}</SelectItem>
                                            <SelectItem value="online">{t('common:badge.format.online')}</SelectItem>
                                            <SelectItem value="webtoon">{t('common:badge.format.webtoon')}</SelectItem>
                                        </SelectContent>
                                    </Select>
                                )}
                            />
                            <FieldError message={avErrors.format?.message} />
                        </div>
                        {avFormat === 'ebook' && (
                            <div className="space-y-1.5">
                                <Label>{t('show.addVolumeDialog.ebookSource')} <span className="text-destructive">*</span></Label>
                                <Controller<AddVolumeValues, 'ebook_source'>
                                    control={avCtrl}
                                    name="ebook_source"
                                    render={({ field }) => (
                                        <Select value={field.value ?? ''} onValueChange={field.onChange}>
                                            <SelectTrigger>
                                                <SelectValue placeholder={t('show.addVolumeDialog.selectSource')}>
                                                    {(value: string) => ebookSourceLabels[value as EbookSource] ?? t('show.addVolumeDialog.selectSource')}
                                                </SelectValue>
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="bookwalker">{t('show.ebookSource.bookwalker')}</SelectItem>
                                                <SelectItem value="amazon">{t('show.ebookSource.amazon')}</SelectItem>
                                                <SelectItem value="local_epub">{t('show.ebookSource.local_epub')}</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    )}
                                />
                                <FieldError message={avErrors.ebook_source?.message} />
                            </div>
                        )}
                        <div className="space-y-1.5">
                            <Label>{t('show.addVolumeDialog.language')}</Label>
                            <Controller<AddVolumeValues, 'language'>
                                control={avCtrl}
                                name="language"
                                render={({ field }) => (
                                    <Select value={field.value ?? ''} onValueChange={field.onChange}>
                                        <SelectTrigger>
                                            <SelectValue placeholder={t('show.addVolumeDialog.selectLanguageOptional')}>
                                                {(value: string) => languageLabels[value as VolumeLanguage] ?? t('show.addVolumeDialog.selectLanguageOptional')}
                                            </SelectValue>
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="id">{t('show.language.id')}</SelectItem>
                                            <SelectItem value="en">{t('show.language.en')}</SelectItem>
                                            <SelectItem value="ja">{t('show.language.ja')}</SelectItem>
                                            <SelectItem value="other">{t('show.language.other')}</SelectItem>
                                        </SelectContent>
                                    </Select>
                                )}
                            />
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setAddVolumeOpen(false)}>{t('show.addVolumeDialog.cancel')}</Button>
                            <Button type="submit" disabled={addingVolume}>
                                {addingVolume ? t('show.addVolumeDialog.saving') : t('show.addVolumeDialog.add')}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Delete Volume Dialog */}
            <Dialog open={!!deleteVolume} onOpenChange={(open) => !open && setDeleteVolume(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t('show.deleteVolumeDialog.title', { number: deleteVolume?.volume_number })}</DialogTitle>
                    </DialogHeader>
                    <p className="text-sm text-muted-foreground">
                        {t('show.deleteVolumeDialog.confirm')}
                    </p>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDeleteVolume(null)}>{t('show.deleteVolumeDialog.cancel')}</Button>
                        <Button variant="destructive" disabled={deletingVol} onClick={handleDeleteVolume}>
                            {deletingVol ? t('show.deleteVolumeDialog.deleting') : t('show.deleteVolumeDialog.delete')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Bulk Delete Volumes Dialog */}
            <Dialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t('show.bulkDeleteDialog.title', { count: selectedIds.size })}</DialogTitle>
                    </DialogHeader>
                    <p className="text-sm text-muted-foreground">
                        {t('show.bulkDeleteDialog.confirm', { count: selectedIds.size })}
                    </p>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setBulkDeleteOpen(false)}>{t('show.bulkDeleteDialog.cancel')}</Button>
                        <Button variant="destructive" disabled={bulkDeleting} onClick={handleBulkDelete}>
                            {bulkDeleting ? t('show.bulkDeleteDialog.deleting') : t('show.bulkDeleteDialog.delete')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Bulk Format Change Dialog */}
            <Dialog open={bulkFormatOpen} onOpenChange={setBulkFormatOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t('show.bulkFormatDialog.title', { count: selectedIds.size })}</DialogTitle>
                        <DialogDescription>{t('show.bulkFormatDialog.description')}</DialogDescription>
                    </DialogHeader>
                    <form onSubmit={bfSubmit(onBulkFormatSave)} className="space-y-4">
                        <div className="space-y-1.5">
                            <Label>{t('show.addVolumeDialog.format')} <span className="text-destructive">*</span></Label>
                            <Controller<FormatUpdateValues, 'format'>
                                control={bfCtrl}
                                name="format"
                                render={({ field }) => (
                                    <Select value={field.value} onValueChange={field.onChange}>
                                        <SelectTrigger>
                                            <SelectValue>{(value: string) => formatLabels[value] ?? value}</SelectValue>
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="physical">{t('common:badge.format.physical')}</SelectItem>
                                            <SelectItem value="ebook">{t('common:badge.format.ebook')}</SelectItem>
                                            <SelectItem value="online">{t('common:badge.format.online')}</SelectItem>
                                            <SelectItem value="webtoon">{t('common:badge.format.webtoon')}</SelectItem>
                                        </SelectContent>
                                    </Select>
                                )}
                            />
                            <FieldError message={bfErrors.format?.message} />
                        </div>
                        {bfFormat === 'ebook' && (
                            <div className="space-y-1.5">
                                <Label>{t('show.addVolumeDialog.ebookSource')} <span className="text-destructive">*</span></Label>
                                <Controller<FormatUpdateValues, 'ebook_source'>
                                    control={bfCtrl}
                                    name="ebook_source"
                                    render={({ field }) => (
                                        <Select value={field.value ?? ''} onValueChange={field.onChange}>
                                            <SelectTrigger>
                                                <SelectValue placeholder={t('show.addVolumeDialog.selectSource')}>
                                                    {(value: string) => ebookSourceLabels[value as EbookSource] ?? t('show.addVolumeDialog.selectSource')}
                                                </SelectValue>
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="bookwalker">{t('show.ebookSource.bookwalker')}</SelectItem>
                                                <SelectItem value="amazon">{t('show.ebookSource.amazon')}</SelectItem>
                                                <SelectItem value="local_epub">{t('show.ebookSource.local_epub')}</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    )}
                                />
                                <FieldError message={bfErrors.ebook_source?.message} />
                            </div>
                        )}
                        <div className="space-y-1.5">
                            <Label>{t('show.addVolumeDialog.language')}</Label>
                            <Controller<FormatUpdateValues, 'language'>
                                control={bfCtrl}
                                name="language"
                                render={({ field }) => (
                                    <Select value={field.value ?? ''} onValueChange={field.onChange}>
                                        <SelectTrigger>
                                            <SelectValue placeholder={t('show.addVolumeDialog.selectLanguageOptional')}>
                                                {(value: string) => languageLabels[value as VolumeLanguage] ?? t('show.addVolumeDialog.selectLanguageOptional')}
                                            </SelectValue>
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="id">{t('show.language.id')}</SelectItem>
                                            <SelectItem value="en">{t('show.language.en')}</SelectItem>
                                            <SelectItem value="ja">{t('show.language.ja')}</SelectItem>
                                            <SelectItem value="other">{t('show.language.other')}</SelectItem>
                                        </SelectContent>
                                    </Select>
                                )}
                            />
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setBulkFormatOpen(false)}>{t('show.bulkFormatDialog.cancel')}</Button>
                            <Button type="submit" disabled={bulkFormatSaving}>
                                {bulkFormatSaving ? t('show.bulkFormatDialog.saving') : t('show.bulkFormatDialog.apply')}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Loan Dialog */}
            <Dialog open={!!loanTarget} onOpenChange={(open) => { if (!open) { setLoanTarget(null); reset({ loaned_at: today }); } }}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t('show.loanDialog.title', { number: loanTarget?.volume_number })}</DialogTitle>
                        <DialogDescription>{t('show.loanDialog.description')}</DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleSubmit(onLoanSubmit)} className="space-y-4">
                        <div className="space-y-1.5">
                            <Label htmlFor="borrower_name">{t('show.loanDialog.borrowerName')} <span className="text-destructive">*</span></Label>
                            <Input id="borrower_name" {...register('borrower_name')} />
                            <FieldError message={errors.borrower_name?.message} />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label htmlFor="loaned_at">{t('show.loanDialog.loanDate')} <span className="text-destructive">*</span></Label>
                                <Input id="loaned_at" type="date" {...register('loaned_at')} />
                                <FieldError message={errors.loaned_at?.message} />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="due_at">{t('show.loanDialog.dueDate')}</Label>
                                <Input id="due_at" type="date" {...register('due_at')} />
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="notes">{t('show.loanDialog.notes')}</Label>
                            <Textarea id="notes" rows={2} className="resize-none" {...register('notes')} />
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setLoanTarget(null)}>{t('show.loanDialog.cancel')}</Button>
                            <Button type="submit" disabled={submittingLoan}>
                                {submittingLoan ? t('show.loanDialog.saving') : t('show.loanDialog.submit')}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Delete Collection Dialog */}
            <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t('show.deleteCollectionDialog.title')}</DialogTitle>
                        <DialogDescription>
                            {t('show.deleteCollectionDialog.confirmPrefix')} <strong>{series.title_romaji}</strong> {t('show.deleteCollectionDialog.confirmSuffix')}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDeleteOpen(false)}>{t('show.deleteCollectionDialog.cancel')}</Button>
                        <Button variant="destructive" disabled={deleting} onClick={handleDelete}>
                            {deleting ? t('show.deleteCollectionDialog.deleting') : t('show.deleteCollectionDialog.delete')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </UserLayout>
    );
}
