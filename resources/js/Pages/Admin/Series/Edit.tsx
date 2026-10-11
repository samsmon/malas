import { useEffect, useRef, useState } from 'react';
import { Head, Link, router } from '@inertiajs/react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { BookOpen, Save, X, Plus, Pencil, Trash2, ImageIcon, RefreshCw, Loader2, Search, Wand2 } from 'lucide-react';
import AdminLayout from '@/Layouts/AdminLayout';
import PageHeader from '@/Components/app/PageHeader';
import EmptyState from '@/Components/app/EmptyState';
import { SeriesTypeBadge, VolumeTypeBadge } from '@/Components/app/StatusBadge';
import { SeriesMediaGallery, type SeriesMediaItem } from '@/Components/app/SeriesMediaGallery';
import { TagListInput } from '@/Components/app/TagListInput';
import { Button, buttonVariants } from '@/Components/ui/button';
import { Input } from '@/Components/ui/input';
import { Textarea } from '@/Components/ui/textarea';
import { Label } from '@/Components/ui/label';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/Components/ui/select';
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/Components/ui/dialog';
import {
    Popover, PopoverContent, PopoverHeader, PopoverTitle, PopoverTrigger,
} from '@/Components/ui/popover';
import {
    Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter,
} from '@/Components/ui/sheet';
import { ScrollArea } from '@/Components/ui/scroll-area';
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/Components/ui/table';
import { cn } from '@/lib/utils';
import { PageProps } from '@/types';
import { type SeriesStatus, type SeriesType, type VolumeType } from '@/lib/types';

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
    genres: string[];
    authors: string[];
    themes: string[];
    demographics: string[];
    already_imported: boolean;
}

interface RanobeDbResult {
    ranobedb_id: number;
    title: string;
    title_display: string | null;
    cover_url: string | null;
    volumes: number | null;
    published_from: string | null;
    published_to: string | null;
    already_imported: boolean;
}

interface RanobeDbDetail {
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
    cover_url: string | null;
    genres: string[];
    themes: string[];
    demographics: string[];
    authors: string[];
    illustrators: string[];
}

interface VolumeRow {
    id: string;
    volume_number: number;
    type: VolumeType;
    isbn: string | null;
    published_at: string | null;
}

interface SeriesData {
    id: string;
    slug: string;
    mal_id: number | null;
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
    genres: string[];
    authors: string[];
    illustrators: string[];
    themes: string[];
    demographics: string[];
}

interface Props extends PageProps {
    series: SeriesData;
    volumes: VolumeRow[];
    media: SeriesMediaItem[];
}

const seriesSchema = z.object({
    title_romaji:   z.string().min(1),
    title_english:  z.string().optional(),
    title_japanese: z.string().optional(),
    synopsis:       z.string().optional(),
    status:         z.enum(['publishing', 'finished', 'on_hiatus', 'discontinued', 'not_yet_published']),
    type:           z.enum(['manga', 'novel', 'one_shot', 'doujinshi', 'other']),
    published_from: z.string().optional(),
    published_to:   z.string().optional(),
    total_volumes:  z.string().optional(),
    score:          z.string().optional(),
    rank:           z.string().optional(),
});

const volumeSchema = z.object({
    volume_number: z.string().min(1),
    type:          z.enum(['regular', 'digital', 'bind_up']),
    isbn:          z.string().optional(),
    published_at:  z.string().optional(),
});

type SeriesFormValues = z.infer<typeof seriesSchema>;
type VolumeFormValues = z.infer<typeof volumeSchema>;

function FieldError({ message }: { message?: string }) {
    if (!message) return null;
    return <p className="text-xs text-destructive">{message}</p>;
}

// FormData butuh key ber-index (genres[0], genres[1], ...) supaya Laravel parse-nya jadi array,
// bukan string tunggal — array kosong sengaja TETAP dikirim (genres[] tanpa isi) supaya "hapus
// semua tag" beneran ke-submit, bukan cuma di-skip diam-diam kayak field kosong lainnya.
function appendTagList(fd: FormData, key: string, values: string[]) {
    if (values.length === 0) {
        fd.append(`${key}[]`, '');
        return;
    }
    values.forEach((v, i) => fd.append(`${key}[${i}]`, v));
}

export default function SeriesEdit({ series, volumes, media }: Props) {
    const { t } = useTranslation('admin');

    const STATUS_LABELS: Record<string, string> = {
        publishing: t('common:badge.status.publishing'),
        finished: t('common:badge.status.finished'),
        on_hiatus: t('common:badge.status.on_hiatus'),
        discontinued: t('common:badge.status.discontinued'),
        not_yet_published: t('common:badge.status.not_yet_published'),
    };

    const TYPE_LABELS: Record<string, string> = {
        manga: t('common:badge.type.manga'),
        novel: t('common:badge.type.novel'),
        one_shot: t('common:badge.type.one_shot'),
        doujinshi: t('common:badge.type.doujinshi'),
        other: t('common:badge.type.other'),
    };

    const VOLUME_TYPE_LABELS: Record<string, string> = {
        regular: t('common:badge.volumeType.regular'),
        digital: t('common:badge.volumeType.digital'),
        bind_up: t('common:badge.volumeType.bind_up'),
    };

    // Series form state
    const [coverMode, setCoverMode]         = useState<'local' | 'url'>('local');
    const [coverFile, setCoverFile]         = useState<File | null>(null);
    const [coverPreview, setCoverPreview]   = useState<string | null>(null);
    const [coverUrlInput, setCoverUrlInput] = useState('');
    const [submitting, setSubmitting]       = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);

    // Genre & tags — bebas (bukan enum tetap), diedit lewat TagListInput, dikirim terpisah dari
    // seriesSchema (react-hook-form) karena bentuknya array, bukan field skalar.
    const [genres, setGenres]             = useState<string[]>(series.genres ?? []);
    const [authors, setAuthors]           = useState<string[]>(series.authors ?? []);
    const [illustrators, setIllustrators] = useState<string[]>(series.illustrators ?? []);
    const [themes, setThemes]             = useState<string[]>(series.themes ?? []);
    const [demographics, setDemographics] = useState<string[]>(series.demographics ?? []);

    // Cover image search dialog state
    const [coverSearchOpen, setCoverSearchOpen]       = useState(false);
    const [coverSearchQuery, setCoverSearchQuery]     = useState('');
    const [coverSearchResults, setCoverSearchResults] = useState<Array<{ thumbnail: string | null; image: string | null; title: string }>>([]);
    const [coverSearchLoading, setCoverSearchLoading] = useState(false);
    const [coverSearchError, setCoverSearchError]     = useState<string | null>(null);

    // AniList sync dialog state
    const [syncOpen, setSyncOpen]           = useState(false);
    const [syncQuery, setSyncQuery]         = useState('');
    const [syncResults, setSyncResults]     = useState<AniListResult[]>([]);
    const [syncLoading, setSyncLoading]     = useState(false);
    const [syncError, setSyncError]         = useState<string | null>(null);

    // RanobeDB sync dialog state
    const [rdSyncOpen, setRdSyncOpen]       = useState(false);
    const [rdSyncQuery, setRdSyncQuery]     = useState('');
    const [rdSyncResults, setRdSyncResults] = useState<RanobeDbResult[]>([]);
    const [rdSyncLoading, setRdSyncLoading] = useState(false);
    const [rdSyncError, setRdSyncError]     = useState<string | null>(null);
    const [rdApplying, setRdApplying]       = useState(false);

    // Volume — add dialog
    const [addVolumeOpen, setAddVolumeOpen] = useState(false);
    const [addingVolume, setAddingVolume]   = useState(false);

    // Volume — edit sheet
    const [editVolume, setEditVolume]         = useState<VolumeRow | null>(null);
    const [updatingVolume, setUpdatingVolume] = useState(false);

    // Volume — delete dialog
    const [deleteVolume, setDeleteVolume] = useState<VolumeRow | null>(null);
    const [deletingVol, setDeletingVol]   = useState(false);

    // Volume — generate dialog
    const [generateOpen, setGenerateOpen]       = useState(false);
    const [generatingVolumes, setGeneratingVolumes] = useState(false);

    const [serverErrors, setServerErrors] = useState<string[]>([]);

    // Series form
    const {
        register, control, handleSubmit, setError, watch, setValue,
        formState: { errors },
    } = useForm<SeriesFormValues>({
        resolver: zodResolver(seriesSchema),
        defaultValues: {
            title_romaji:   series.title_romaji,
            title_english:  series.title_english  ?? '',
            title_japanese: series.title_japanese ?? '',
            synopsis:       series.synopsis       ?? '',
            status:         series.status,
            type:           series.type,
            published_from: series.published_from ?? '',
            published_to:   series.published_to   ?? '',
            total_volumes:  series.total_volumes  !== null ? String(series.total_volumes) : '',
            score:          series.score          !== null ? String(series.score) : '',
            rank:           series.rank           !== null ? String(series.rank) : '',
        },
    });

    // Volume — add form
    const {
        register: vReg, control: vCtrl, handleSubmit: vSubmit,
        setError: vSetError, reset: vReset,
        formState: { errors: vErrors },
    } = useForm<VolumeFormValues>({
        resolver: zodResolver(volumeSchema),
        defaultValues: { type: 'regular' },
    });

    // Volume — edit form
    const {
        register: evReg, control: evCtrl, handleSubmit: evSubmit,
        setError: evSetError, reset: evReset,
        formState: { errors: evErrors },
    } = useForm<VolumeFormValues>({
        resolver: zodResolver(volumeSchema),
        defaultValues: { type: 'regular' },
    });

    // Reset edit volume form when sheet opens
    useEffect(() => {
        if (editVolume) {
            evReset({
                volume_number: String(editVolume.volume_number),
                type:          editVolume.type,
                isbn:          editVolume.isbn          ?? '',
                published_at:  editVolume.published_at  ?? '',
            });
        }
    }, [editVolume]);

    // Cover preview: local blob or pasted URL
    const displayCover = coverMode === 'local'
        ? (coverPreview ?? series.cover_url)
        : (coverUrlInput.trim() || series.cover_url);

    function handleCoverChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0] ?? null;
        setCoverFile(file);
        setCoverPreview(file ? URL.createObjectURL(file) : null);
    }

    function onInvalid(errs: Record<string, { message?: string } | undefined>) {
        setServerErrors(Object.entries(errs).map(([k, v]) => v?.message || `${k}: tidak valid`));
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function onSubmit(values: SeriesFormValues) {
        setSubmitting(true);
        setServerErrors([]);
        const fd = new FormData();
        fd.append('_method', 'PUT');
        Object.entries(values).forEach(([k, v]) => {
            if (v !== undefined && v !== '') fd.append(k, v);
        });
        if (coverMode === 'local' && coverFile) {
            fd.append('cover', coverFile);
        } else if (coverMode === 'url' && coverUrlInput.trim()) {
            fd.append('cover_url', coverUrlInput.trim());
        }
        appendTagList(fd, 'genres', genres);
        appendTagList(fd, 'authors', authors);
        appendTagList(fd, 'illustrators', illustrators);
        appendTagList(fd, 'themes', themes);
        appendTagList(fd, 'demographics', demographics);

        router.post(route('admin.series.update', series.id), fd, {
            forceFormData: true,
            onError: (errs) => {
                Object.entries(errs).forEach(([k, msg]) => {
                    setError(k as keyof SeriesFormValues, { message: msg });
                });
                setServerErrors(Object.values(errs));
                window.scrollTo({ top: 0, behavior: 'smooth' });
                setSubmitting(false);
            },
            onFinish: () => setSubmitting(false),
        });
    }

    function onAddVolume(values: VolumeFormValues) {
        setAddingVolume(true);
        const fd = new FormData();
        Object.entries(values).forEach(([k, v]) => {
            if (v !== undefined && v !== '') fd.append(k, v);
        });

        router.post(route('admin.series.volumes.store', series.id), fd, {
            forceFormData: true,
            onSuccess: () => {
                vReset({ type: 'regular' });
                setAddVolumeOpen(false);
            },
            onError: (errs) => {
                Object.entries(errs).forEach(([k, msg]) => {
                    vSetError(k as keyof VolumeFormValues, { message: msg });
                });
            },
            onFinish: () => setAddingVolume(false),
        });
    }

    function handleDeleteVolume() {
        if (!deleteVolume) return;
        setDeletingVol(true);
        router.delete(route('admin.volumes.destroy', deleteVolume.id), {
            onFinish: () => { setDeletingVol(false); setDeleteVolume(null); },
        });
    }

    function handleGenerateVolumes() {
        setGeneratingVolumes(true);
        router.post(route('admin.series.volumes.generate', series.id), {}, {
            onFinish: () => { setGeneratingVolumes(false); setGenerateOpen(false); },
        });
    }

    const titleRomaji = watch('title_romaji');

    // Cover image search — debounced fetch
    useEffect(() => {
        if (!coverSearchOpen || !coverSearchQuery.trim()) {
            setCoverSearchResults([]);
            return;
        }
        setCoverSearchLoading(true);
        const timer = setTimeout(async () => {
            try {
                const url = new URL(route('admin.images.search'), window.location.origin);
                url.searchParams.set('q', coverSearchQuery.trim());
                const res  = await fetch(url.toString(), { credentials: 'same-origin' });
                const data: { results: typeof coverSearchResults; error: string | null } = await res.json();
                setCoverSearchResults(data.results);
                setCoverSearchError(data.error);
            } catch {
                setCoverSearchError(t('common:common.generalError'));
                setCoverSearchResults([]);
            } finally {
                setCoverSearchLoading(false);
            }
        }, 450);
        return () => clearTimeout(timer);
    }, [coverSearchQuery, coverSearchOpen]);

    function openCoverSearch() {
        setCoverSearchQuery(`manga cover ${titleRomaji}`);
        setCoverSearchResults([]);
        setCoverSearchError(null);
        setCoverSearchOpen(true);
    }

    function applyCoverImage(imageUrl: string) {
        setCoverMode('url');
        setCoverUrlInput(imageUrl);
        setCoverSearchOpen(false);
    }

    function onUpdateVolume(values: VolumeFormValues) {
        if (!editVolume) return;
        setUpdatingVolume(true);
        const fd = new FormData();
        fd.append('_method', 'PUT');
        Object.entries(values).forEach(([k, v]) => {
            if (v !== undefined && v !== '') fd.append(k, v);
        });

        router.post(route('admin.volumes.update', editVolume.id), fd, {
            forceFormData: true,
            onSuccess: () => setEditVolume(null),
            onError: (errs) => {
                Object.entries(errs).forEach(([k, msg]) => {
                    evSetError(k as keyof VolumeFormValues, { message: msg });
                });
            },
            onFinish: () => setUpdatingVolume(false),
        });
    }

    // Open sync dialog pre-filled with current title
    function openSync() {
        setSyncQuery(titleRomaji);
        setSyncResults([]);
        setSyncError(null);
        setSyncOpen(true);
    }

    // Debounced AniList search via JSON endpoint
    useEffect(() => {
        if (!syncOpen || !syncQuery.trim()) {
            setSyncResults([]);
            return;
        }
        setSyncLoading(true);
        const timer = setTimeout(async () => {
            try {
                const url = new URL(route('admin.anilist.search'), window.location.origin);
                url.searchParams.set('q', syncQuery.trim());
                const res = await fetch(url.toString(), { credentials: 'same-origin' });
                const data: { results: AniListResult[]; error: string | null } = await res.json();
                setSyncResults(data.results);
                setSyncError(data.error);
            } catch {
                setSyncError(t('common:common.generalError'));
                setSyncResults([]);
            } finally {
                setSyncLoading(false);
            }
        }, 450);
        return () => clearTimeout(timer);
    }, [syncQuery, syncOpen]);

    // Apply AniList result to form
    function applySync(item: AniListResult) {
        setValue('title_romaji',   item.title);
        setValue('title_english',  item.title_english  ?? '');
        setValue('status',         item.status);
        setValue('type',           item.type);
        setValue('total_volumes',  item.volumes ? String(item.volumes) : '');
        setValue('score',          item.score   ? String(item.score)   : '');
        setValue('synopsis',       item.synopsis       ?? '');
        setValue('published_from', item.published_from ?? '');
        setGenres(item.genres ?? []);
        setAuthors(item.authors ?? []);
        setThemes(item.themes ?? []);
        setDemographics(item.demographics ?? []);
        if (item.cover_url) {
            setCoverMode('url');
            setCoverUrlInput(item.cover_url);
        }
        setSyncOpen(false);
    }

    // Open RanobeDB sync popover pre-filled with current title
    function openRdSync() {
        setRdSyncQuery(titleRomaji);
        setRdSyncResults([]);
        setRdSyncError(null);
        setRdSyncOpen(true);
    }

    // Debounced RanobeDB search via JSON endpoint
    useEffect(() => {
        if (!rdSyncOpen || !rdSyncQuery.trim()) {
            setRdSyncResults([]);
            return;
        }
        setRdSyncLoading(true);
        const timer = setTimeout(async () => {
            try {
                const url = new URL(route('admin.ranobedb.search'), window.location.origin);
                url.searchParams.set('q', rdSyncQuery.trim());
                const res = await fetch(url.toString(), { credentials: 'same-origin' });
                const data: { results: RanobeDbResult[]; error: string | null } = await res.json();
                setRdSyncResults(data.results);
                setRdSyncError(data.error);
            } catch {
                setRdSyncError(t('common:common.generalError'));
                setRdSyncResults([]);
            } finally {
                setRdSyncLoading(false);
            }
        }, 450);
        return () => clearTimeout(timer);
    }, [rdSyncQuery, rdSyncOpen]);

    // Fetch full detail for a RanobeDB result and apply it to the form
    async function applyRdSync(item: RanobeDbResult) {
        setRdApplying(true);
        try {
            const url = new URL(route('admin.ranobedb.detail'), window.location.origin);
            url.searchParams.set('ranobedb_id', String(item.ranobedb_id));
            const res = await fetch(url.toString(), { credentials: 'same-origin' });
            const data: { data: RanobeDbDetail | null; error: string | null } = await res.json();
            if (data.data) {
                const d = data.data;
                setValue('title_romaji',   d.title_romaji);
                setValue('title_english',  d.title_english  ?? '');
                setValue('title_japanese', d.title_japanese ?? '');
                setValue('status',         d.status);
                setValue('type',           d.type);
                setValue('total_volumes',  d.total_volumes ? String(d.total_volumes) : '');
                setValue('score',          d.score ? String(d.score) : '');
                setValue('synopsis',       d.synopsis ?? '');
                setValue('published_from', d.published_from ?? '');
                setValue('published_to',   d.published_to   ?? '');
                setGenres(d.genres ?? []);
                setAuthors(d.authors ?? []);
                setIllustrators(d.illustrators ?? []);
                setThemes(d.themes ?? []);
                setDemographics(d.demographics ?? []);
                if (d.cover_url) {
                    setCoverMode('url');
                    setCoverUrlInput(d.cover_url);
                }
                setRdSyncOpen(false);
            } else {
                setRdSyncError(data.error);
            }
        } catch {
            setRdSyncError(t('common:common.generalError'));
        } finally {
            setRdApplying(false);
        }
    }

    return (
        <AdminLayout
            header={
                <PageHeader
                    title={series.title_romaji}
                    breadcrumbs={[
                        { label: t('series.breadcrumb'), href: route('admin.series.index') },
                        { label: series.title_romaji, href: route('admin.series.show', series.slug) },
                        { label: t('series.breadcrumbEdit') },
                    ]}
                    actions={
                        <div className="flex gap-2">
                            <Popover
                                open={syncOpen}
                                onOpenChange={(open) => {
                                    if (open) {
                                        openSync();
                                    } else {
                                        setSyncOpen(false);
                                        setSyncQuery('');
                                        setSyncResults([]);
                                    }
                                }}
                            >
                                <PopoverTrigger
                                    render={<Button type="button" variant="outline" size="sm" />}
                                >
                                    <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                                    {t('series.syncAnilist')}
                                </PopoverTrigger>

                                <PopoverContent className="w-[420px]" align="end">
                                    <PopoverHeader>
                                        <PopoverTitle>{t('series.syncAnilistTitle')}</PopoverTitle>
                                    </PopoverHeader>

                                    {/* Search input */}
                                    <div className="relative">
                                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                        <Input
                                            className="pl-9"
                                            placeholder={t('series.searchMangaPlaceholder')}
                                            value={syncQuery}
                                            onChange={(e) => setSyncQuery(e.target.value)}
                                            autoFocus
                                        />
                                    </div>

                                    {/* States */}
                                    <div className="max-h-80 overflow-y-auto">
                                        {syncLoading && (
                                            <div className="flex items-center justify-center py-10 text-muted-foreground">
                                                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                                                {t('common:common.searching')}
                                            </div>
                                        )}

                                        {!syncLoading && syncError && (
                                            <p className="py-6 text-center text-sm text-destructive">{syncError}</p>
                                        )}

                                        {!syncLoading && !syncError && syncQuery.trim() && syncResults.length === 0 && (
                                            <p className="py-6 text-center text-sm text-muted-foreground">{t('common:common.noResults')}</p>
                                        )}

                                        {!syncLoading && !syncError && syncResults.length > 0 && (
                                            <div className="grid grid-cols-3 gap-2 pb-1">
                                                {syncResults.map((item) => (
                                                    <button
                                                        key={item.anilist_id}
                                                        type="button"
                                                        onClick={() => applySync(item)}
                                                        className="group flex flex-col overflow-hidden rounded-lg border bg-card text-left transition-shadow hover:shadow-md focus:outline-none focus:ring-2 focus:ring-ring"
                                                    >
                                                        <div className="relative aspect-[2/3] overflow-hidden bg-muted">
                                                            {item.cover_url ? (
                                                                <img
                                                                    src={item.cover_url}
                                                                    alt={item.title}
                                                                    className="h-full w-full object-cover transition-transform duration-150 group-hover:scale-105"
                                                                />
                                                            ) : (
                                                                <div className="flex h-full items-center justify-center">
                                                                    <BookOpen className="h-6 w-6 text-muted-foreground/30" />
                                                                </div>
                                                            )}
                                                            {item.score && (
                                                                <div className="absolute right-1.5 top-1.5 rounded bg-black/60 px-1 py-0.5 text-xs font-medium text-white">
                                                                    ★ {item.score}
                                                                </div>
                                                            )}
                                                        </div>
                                                        <div className="p-1.5 text-xs">
                                                            <p className="line-clamp-2 font-medium leading-tight">{item.title}</p>
                                                            <div className="mt-1">
                                                                <SeriesTypeBadge type={item.type} />
                                                            </div>
                                                        </div>
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    <p className="text-xs text-muted-foreground">
                                        {t('series.syncAnilistHint')}
                                    </p>
                                </PopoverContent>
                            </Popover>
                            <Popover
                                open={rdSyncOpen}
                                onOpenChange={(open) => {
                                    if (open) {
                                        openRdSync();
                                    } else {
                                        setRdSyncOpen(false);
                                        setRdSyncQuery('');
                                        setRdSyncResults([]);
                                    }
                                }}
                            >
                                <PopoverTrigger
                                    render={<Button type="button" variant="outline" size="sm" />}
                                >
                                    <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                                    {t('series.syncRanobedb')}
                                </PopoverTrigger>

                                <PopoverContent className="w-[420px]" align="end">
                                    <PopoverHeader>
                                        <PopoverTitle>{t('series.syncRanobedbTitle')}</PopoverTitle>
                                    </PopoverHeader>

                                    {/* Search input */}
                                    <div className="relative">
                                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                        <Input
                                            className="pl-9"
                                            placeholder={t('series.searchNovelPlaceholder')}
                                            value={rdSyncQuery}
                                            onChange={(e) => setRdSyncQuery(e.target.value)}
                                            autoFocus
                                        />
                                    </div>

                                    {/* States */}
                                    <div className="max-h-80 overflow-y-auto">
                                        {(rdSyncLoading || rdApplying) && (
                                            <div className="flex items-center justify-center py-10 text-muted-foreground">
                                                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                                                {rdApplying ? t('series.fetchingDetail') : t('common:common.searching')}
                                            </div>
                                        )}

                                        {!rdSyncLoading && !rdApplying && rdSyncError && (
                                            <p className="py-6 text-center text-sm text-destructive">{rdSyncError}</p>
                                        )}

                                        {!rdSyncLoading && !rdApplying && !rdSyncError && rdSyncQuery.trim() && rdSyncResults.length === 0 && (
                                            <p className="py-6 text-center text-sm text-muted-foreground">{t('common:common.noResults')}</p>
                                        )}

                                        {!rdSyncLoading && !rdApplying && !rdSyncError && rdSyncResults.length > 0 && (
                                            <div className="grid grid-cols-3 gap-2 pb-1">
                                                {rdSyncResults.map((item) => (
                                                    <button
                                                        key={item.ranobedb_id}
                                                        type="button"
                                                        onClick={() => applyRdSync(item)}
                                                        className="group flex flex-col overflow-hidden rounded-lg border bg-card text-left transition-shadow hover:shadow-md focus:outline-none focus:ring-2 focus:ring-ring"
                                                    >
                                                        <div className="relative aspect-[2/3] overflow-hidden bg-muted">
                                                            {item.cover_url ? (
                                                                <img
                                                                    src={item.cover_url}
                                                                    alt={item.title}
                                                                    className="h-full w-full object-cover transition-transform duration-150 group-hover:scale-105"
                                                                />
                                                            ) : (
                                                                <div className="flex h-full items-center justify-center">
                                                                    <BookOpen className="h-6 w-6 text-muted-foreground/30" />
                                                                </div>
                                                            )}
                                                        </div>
                                                        <div className="p-1.5 text-xs">
                                                            <p className="line-clamp-2 font-medium leading-tight">{item.title}</p>
                                                            {item.volumes && (
                                                                <p className="mt-1 text-muted-foreground">{t('series.volumeCount', { count: item.volumes })}</p>
                                                            )}
                                                        </div>
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    <p className="text-xs text-muted-foreground">
                                        {t('series.syncRanobedbHint')}
                                    </p>
                                </PopoverContent>
                            </Popover>
                            <Button
                                form="series-edit-form"
                                type="submit"
                                size="sm"
                                disabled={submitting}
                            >
                                <Save className="mr-1.5 h-3.5 w-3.5" />
                                {submitting ? t('common:common.saving') : t('common:common.save')}
                            </Button>
                            <Link
                                href={route('admin.series.show', series.slug)}
                                className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
                            >
                                <X className="mr-1.5 h-3.5 w-3.5" />
                                {t('common:common.cancel')}
                            </Link>
                        </div>
                    }
                />
            }
        >
            <Head title={series.title_romaji} />
            <form id="series-edit-form" onSubmit={handleSubmit(onSubmit, onInvalid)}>
            {serverErrors.length > 0 && (
                <div role="alert" className="mb-4 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                    <p className="mb-1 font-medium">Gagal menyimpan:</p>
                    <ul className="list-disc space-y-0.5 pl-5">
                        {serverErrors.map((m, i) => <li key={i}>{m}</li>)}
                    </ul>
                </div>
            )}
                {/* Same grid layout as Show */}
                <div className="grid gap-6 lg:grid-cols-[auto_1fr]">

                    {/* Left — cover */}
                    <div className="shrink-0 space-y-2">
                        {/* Preview */}
                        {displayCover ? (
                            <img
                                key={displayCover}
                                src={displayCover}
                                alt={series.title_romaji}
                                className="w-32 rounded-lg object-cover shadow-sm"
                                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                            />
                        ) : (
                            <div className="flex h-44 w-32 items-center justify-center rounded-lg bg-muted">
                                <BookOpen className="h-8 w-8 text-muted-foreground" />
                            </div>
                        )}

                        {/* Mode tabs */}
                        <div className="flex w-32 overflow-hidden rounded-md border text-xs">
                            <button
                                type="button"
                                onClick={() => setCoverMode('local')}
                                className={cn(
                                    'flex-1 py-1 transition-colors',
                                    coverMode === 'local'
                                        ? 'bg-primary text-primary-foreground'
                                        : 'hover:bg-muted',
                                )}
                            >
                                {t('series.local')}
                            </button>
                            <button
                                type="button"
                                onClick={() => setCoverMode('url')}
                                className={cn(
                                    'flex-1 py-1 transition-colors',
                                    coverMode === 'url'
                                        ? 'bg-primary text-primary-foreground'
                                        : 'hover:bg-muted',
                                )}
                            >
                                {t('series.url')}
                            </button>
                        </div>

                        {/* Local mode */}
                        {coverMode === 'local' && (
                            <>
                                <input
                                    ref={fileRef}
                                    type="file"
                                    accept="image/jpeg,image/png,image/webp"
                                    className="hidden"
                                    onChange={handleCoverChange}
                                />
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="w-32 text-xs"
                                    onClick={() => fileRef.current?.click()}
                                >
                                    {t('common:common.chooseFile')}
                                </Button>
                                {coverFile && (
                                    <p className="w-32 truncate text-xs text-muted-foreground">{coverFile.name}</p>
                                )}
                            </>
                        )}

                        {/* URL mode */}
                        {coverMode === 'url' && (
                            <div className="w-32 space-y-1.5">
                                <Input
                                    className="h-7 text-xs"
                                    placeholder={t('series.pasteImageUrl')}
                                    value={coverUrlInput}
                                    onChange={(e) => setCoverUrlInput(e.target.value)}
                                />
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="w-full text-xs"
                                    onClick={openCoverSearch}
                                >
                                    <ImageIcon className="mr-1 h-3 w-3" />
                                    {t('series.searchImage')}
                                </Button>
                            </div>
                        )}
                    </div>

                    {/* Right — fields (same positions as Show) */}
                    <div className="space-y-3">
                        <div>
                            <Input
                                className="h-8 text-base font-semibold"
                                placeholder={t('series.titleRomajiPlaceholder')}
                                {...register('title_romaji')}
                            />
                            <FieldError message={errors.title_romaji ? t('common:common.required') : undefined} />
                        </div>
                        <Input
                            className="text-sm text-muted-foreground"
                            placeholder={t('series.titleEnglishPlaceholder')}
                            {...register('title_english')}
                        />
                        <Input
                            className="text-sm text-muted-foreground"
                            placeholder={t('series.titleJapanesePlaceholder')}
                            {...register('title_japanese')}
                        />

                        {/* Status + Type — same position as badges in Show */}
                        <div className="flex flex-wrap gap-2">
                            <Controller<SeriesFormValues, 'status'>
                                control={control}
                                name="status"
                                render={({ field }) => (
                                    <Select value={field.value} onValueChange={field.onChange}>
                                        <SelectTrigger className="h-7 w-44 text-xs">
                                            <SelectValue placeholder={t('common:common.status')}>
                                                {(value: string) => STATUS_LABELS[value] ?? t('common:common.status')}
                                            </SelectValue>
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="publishing">{STATUS_LABELS.publishing}</SelectItem>
                                            <SelectItem value="finished">{STATUS_LABELS.finished}</SelectItem>
                                            <SelectItem value="on_hiatus">{STATUS_LABELS.on_hiatus}</SelectItem>
                                            <SelectItem value="discontinued">{STATUS_LABELS.discontinued}</SelectItem>
                                            <SelectItem value="not_yet_published">{STATUS_LABELS.not_yet_published}</SelectItem>
                                        </SelectContent>
                                    </Select>
                                )}
                            />
                            <Controller<SeriesFormValues, 'type'>
                                control={control}
                                name="type"
                                render={({ field }) => (
                                    <Select value={field.value} onValueChange={field.onChange}>
                                        <SelectTrigger className="h-7 w-36 text-xs">
                                            <SelectValue placeholder={t('common:common.type')}>
                                                {(value: string) => TYPE_LABELS[value] ?? t('common:common.type')}
                                            </SelectValue>
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="manga">{TYPE_LABELS.manga}</SelectItem>
                                            <SelectItem value="novel">{TYPE_LABELS.novel}</SelectItem>
                                            <SelectItem value="one_shot">{TYPE_LABELS.one_shot}</SelectItem>
                                            <SelectItem value="doujinshi">{TYPE_LABELS.doujinshi}</SelectItem>
                                            <SelectItem value="other">{TYPE_LABELS.other}</SelectItem>
                                        </SelectContent>
                                    </Select>
                                )}
                            />
                        </div>

                        {/* Stats grid — same 4-column layout as Show */}
                        <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm sm:grid-cols-4">
                            <div className="space-y-1">
                                <p className="text-xs text-muted-foreground">{t('series.totalVolumes')}</p>
                                <Input type="number" min={1} className="h-7 text-sm" {...register('total_volumes')} />
                            </div>
                            <div className="space-y-1">
                                <p className="text-xs text-muted-foreground">{t('series.score')}</p>
                                <Input type="number" step="0.01" min={0} max={10} className="h-7 text-sm" {...register('score')} />
                            </div>
                            <div className="space-y-1">
                                <p className="text-xs text-muted-foreground">{t('series.rank')}</p>
                                <Input type="number" min={1} className="h-7 text-sm" {...register('rank')} />
                            </div>
                            <div className="space-y-1">
                                <p className="text-xs text-muted-foreground">{t('series.published')}</p>
                                <div className="space-y-1">
                                    <Input type="date" className="h-7 text-xs" {...register('published_from')} />
                                    <Input type="date" className="h-7 text-xs" {...register('published_to')} />
                                </div>
                            </div>
                        </div>

                        {/* Synopsis */}
                        <Textarea
                            rows={4}
                            placeholder={t('series.synopsisPlaceholder')}
                            className="resize-none text-sm text-muted-foreground leading-relaxed"
                            {...register('synopsis')}
                        />

                        {/* Genre & Tags — bebas, diketik manual atau keisi dari Sync AniList/RanobeDB */}
                        <div className="grid gap-3 sm:grid-cols-2">
                            <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">{t('series.genres')}</Label>
                                <TagListInput value={genres} onChange={setGenres} placeholder={t('series.genresPlaceholder')} />
                            </div>
                            <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">{t('series.themes')}</Label>
                                <TagListInput value={themes} onChange={setThemes} placeholder={t('series.themesPlaceholder')} />
                            </div>
                            <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">{t('series.demographics')}</Label>
                                <TagListInput value={demographics} onChange={setDemographics} placeholder={t('series.demographicsPlaceholder')} />
                            </div>
                            <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">{t('series.authors')}</Label>
                                <TagListInput value={authors} onChange={setAuthors} placeholder={t('series.authorsPlaceholder')} />
                            </div>
                            <div className="space-y-1 sm:col-span-2">
                                <Label className="text-xs text-muted-foreground">{t('series.illustrators')}</Label>
                                <TagListInput value={illustrators} onChange={setIllustrators} placeholder={t('series.illustratorsPlaceholder')} />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Galeri media tambahan */}
                <SeriesMediaGallery seriesId={series.id} media={media} />

                {/* Volumes — full management */}
                <div className="mt-8">
                    <div className="mb-3 flex items-center justify-between">
                        <h2 className="text-base font-semibold">{t('series.volumeSection', { count: volumes.length })}</h2>
                        <div className="flex gap-2">
                            {series.status === 'finished' && series.total_volumes && (() => {
                                const existing = new Set(volumes.map((v) => v.volume_number));
                                const missing  = Array.from({ length: series.total_volumes }, (_, i) => i + 1)
                                    .filter((n) => !existing.has(n)).length;
                                return missing > 0 ? (
                                    <Button size="sm" type="button" variant="outline" onClick={() => setGenerateOpen(true)}>
                                        <Wand2 className="mr-1.5 h-3.5 w-3.5" />
                                        {t('series.generateCount', { count: missing })}
                                    </Button>
                                ) : null;
                            })()}
                            <Button size="sm" type="button" onClick={() => setAddVolumeOpen(true)}>
                                <Plus className="mr-1.5 h-4 w-4" />
                                {t('series.addVolume')}
                            </Button>
                        </div>
                    </div>

                    {volumes.length === 0 ? (
                        <EmptyState
                            title={t('series.emptyVolumesTitle')}
                            description={t('series.emptyVolumesDescription')}
                            icon={BookOpen}
                            action={
                                <Button size="sm" type="button" onClick={() => setAddVolumeOpen(true)}>
                                    {t('series.addVolume')}
                                </Button>
                            }
                        />
                    ) : (
                        <div className="rounded-lg border">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-24">{t('series.table.volume')}</TableHead>
                                        <TableHead className="w-28">{t('series.table.type')}</TableHead>
                                        <TableHead>{t('series.table.isbn')}</TableHead>
                                        <TableHead className="w-32">{t('series.table.published')}</TableHead>
                                        <TableHead className="w-20" />
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {volumes.map((v) => (
                                        <TableRow key={v.id}>
                                            <TableCell className="font-medium">#{v.volume_number}</TableCell>
                                            <TableCell><VolumeTypeBadge type={v.type} /></TableCell>
                                            <TableCell className="text-sm text-muted-foreground">{v.isbn ?? '—'}</TableCell>
                                            <TableCell className="text-sm text-muted-foreground">{v.published_at ?? '—'}</TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-1">
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8"
                                                        onClick={() => setEditVolume(v)}
                                                    >
                                                        <Pencil className="h-3.5 w-3.5" />
                                                    </Button>
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8 text-destructive hover:text-destructive"
                                                        onClick={() => setDeleteVolume(v)}
                                                    >
                                                        <Trash2 className="h-3.5 w-3.5" />
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </div>
            </form>

            {/* Add Volume Dialog */}
            <Dialog open={addVolumeOpen} onOpenChange={(open) => { setAddVolumeOpen(open); if (!open) vReset({ type: 'regular' }); }}>
                <DialogContent>
                    <DialogHeader><DialogTitle>{t('series.addVolume')}</DialogTitle></DialogHeader>
                    <form onSubmit={vSubmit(onAddVolume)} className="space-y-4">
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label htmlFor="volume_number">{t('series.volumeNumberLabel')} <span className="text-destructive">*</span></Label>
                                <Input id="volume_number" type="number" min={1} {...vReg('volume_number')} />
                                <FieldError message={vErrors.volume_number ? t('common:common.required') : undefined} />
                            </div>
                            <div className="space-y-1.5">
                                <Label>{t('series.typeLabel')} <span className="text-destructive">*</span></Label>
                                <Controller<VolumeFormValues, 'type'>
                                    control={vCtrl}
                                    name="type"
                                    render={({ field }) => (
                                        <Select value={field.value} onValueChange={field.onChange}>
                                            <SelectTrigger><SelectValue>{(value: string) => VOLUME_TYPE_LABELS[value] ?? value}</SelectValue></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="regular">{VOLUME_TYPE_LABELS.regular}</SelectItem>
                                                <SelectItem value="digital">{VOLUME_TYPE_LABELS.digital}</SelectItem>
                                                <SelectItem value="bind_up">{VOLUME_TYPE_LABELS.bind_up}</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    )}
                                />
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="isbn">{t('series.isbnLabel')}</Label>
                            <Input id="isbn" {...vReg('isbn')} />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="published_at">{t('series.publishedAtLabel')}</Label>
                            <Input id="published_at" type="date" {...vReg('published_at')} />
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setAddVolumeOpen(false)}>{t('common:common.cancel')}</Button>
                            <Button type="submit" disabled={addingVolume}>
                                {addingVolume ? t('common:common.saving') : t('common:common.save')}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Cover Image Search Dialog */}
            <Dialog open={coverSearchOpen} onOpenChange={(open) => { setCoverSearchOpen(open); if (!open) { setCoverSearchResults([]); } }}>
                <DialogContent className="sm:max-w-3xl">
                    <DialogHeader>
                        <DialogTitle>{t('series.searchCoverTitle')}</DialogTitle>
                    </DialogHeader>

                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            className="pl-9"
                            placeholder={t('series.searchImagePlaceholder')}
                            value={coverSearchQuery}
                            onChange={(e) => setCoverSearchQuery(e.target.value)}
                            autoFocus
                        />
                    </div>

                    <div className="max-h-[420px] overflow-y-auto">
                        {coverSearchLoading && (
                            <div className="flex items-center justify-center py-12 text-muted-foreground">
                                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                                {t('series.searchingImage')}
                            </div>
                        )}

                        {!coverSearchLoading && coverSearchError && (
                            <p className="py-8 text-center text-sm text-destructive">{coverSearchError}</p>
                        )}

                        {!coverSearchLoading && !coverSearchError && coverSearchQuery.trim() && coverSearchResults.length === 0 && (
                            <p className="py-8 text-center text-sm text-muted-foreground">{t('common:common.noResults')}</p>
                        )}

                        {!coverSearchLoading && coverSearchResults.length > 0 && (
                            <div className="grid grid-cols-4 gap-2 pb-1 sm:grid-cols-6">
                                {coverSearchResults.map((img, i) => (
                                    img.thumbnail && (
                                        <button
                                            key={i}
                                            type="button"
                                            title={img.title}
                                            onClick={() => img.image && applyCoverImage(img.image)}
                                            className="group relative aspect-[2/3] overflow-hidden rounded-md border bg-muted transition-all hover:ring-2 hover:ring-primary focus:outline-none focus:ring-2 focus:ring-ring"
                                        >
                                            <img
                                                src={img.thumbnail}
                                                alt={img.title}
                                                className="h-full w-full object-cover transition-transform duration-150 group-hover:scale-105"
                                                loading="lazy"
                                            />
                                        </button>
                                    )
                                ))}
                            </div>
                        )}
                    </div>

                    <p className="text-xs text-muted-foreground">
                        {t('series.searchImageHint')}
                    </p>
                </DialogContent>
            </Dialog>

            {/* Edit Volume Sheet */}
            <Sheet open={!!editVolume} onOpenChange={(open) => !open && setEditVolume(null)}>
                <SheetContent className="flex flex-col gap-0 p-0 sm:max-w-md">
                    <SheetHeader className="border-b px-6 py-4">
                        <SheetTitle>{t('series.editVolumeTitle', { number: editVolume?.volume_number })}</SheetTitle>
                    </SheetHeader>

                    <ScrollArea className="flex-1">
                        <form id="ev-form" onSubmit={evSubmit(onUpdateVolume)} className="space-y-3 px-6 py-5">
                            <div>
                                <Label htmlFor="ev-volume_number">{t('series.volumeNumberLabel')} <span className="text-destructive">*</span></Label>
                                <Input id="ev-volume_number" type="number" min={1} className="mt-1" {...evReg('volume_number')} />
                                <FieldError message={evErrors.volume_number ? t('common:common.required') : undefined} />
                            </div>
                            <div>
                                <Label>{t('series.typeLabel')} <span className="text-destructive">*</span></Label>
                                <Controller<VolumeFormValues, 'type'>
                                    control={evCtrl}
                                    name="type"
                                    render={({ field }) => (
                                        <Select value={field.value} onValueChange={field.onChange}>
                                            <SelectTrigger className="mt-1"><SelectValue>{(value: string) => VOLUME_TYPE_LABELS[value] ?? value}</SelectValue></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="regular">{VOLUME_TYPE_LABELS.regular}</SelectItem>
                                                <SelectItem value="digital">{VOLUME_TYPE_LABELS.digital}</SelectItem>
                                                <SelectItem value="bind_up">{VOLUME_TYPE_LABELS.bind_up}</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    )}
                                />
                            </div>
                            <div>
                                <Label htmlFor="ev-isbn">{t('series.isbnLabel')}</Label>
                                <Input id="ev-isbn" className="mt-1" {...evReg('isbn')} />
                            </div>
                            <div>
                                <Label htmlFor="ev-published_at">{t('series.publishedAtLabel')}</Label>
                                <Input id="ev-published_at" type="date" className="mt-1" {...evReg('published_at')} />
                            </div>
                        </form>
                    </ScrollArea>

                    <SheetFooter className="border-t px-6 py-4">
                        <Button type="button" variant="outline" onClick={() => setEditVolume(null)}>{t('common:common.cancel')}</Button>
                        <Button form="ev-form" type="submit" disabled={updatingVolume}>
                            <Save className="mr-1.5 h-3.5 w-3.5" />
                            {updatingVolume ? t('common:common.saving') : t('common:common.save')}
                        </Button>
                    </SheetFooter>
                </SheetContent>
            </Sheet>

            {/* Delete Volume Dialog */}
            <Dialog open={!!deleteVolume} onOpenChange={(open) => !open && setDeleteVolume(null)}>
                <DialogContent>
                    <DialogHeader><DialogTitle>{t('series.deleteVolumeTitle', { number: deleteVolume?.volume_number })}</DialogTitle></DialogHeader>
                    <p className="text-sm text-muted-foreground">
                        {t('series.deleteVolumeConfirm')}
                    </p>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDeleteVolume(null)}>{t('common:common.cancel')}</Button>
                        <Button variant="destructive" disabled={deletingVol} onClick={handleDeleteVolume}>
                            {deletingVol ? t('common:common.deleting') : t('common:common.delete')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Generate Volumes Dialog */}
            <Dialog open={generateOpen} onOpenChange={setGenerateOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t('series.generateVolumesTitle')}</DialogTitle>
                    </DialogHeader>
                    <p className="text-sm text-muted-foreground">
                        {t('series.generateVolumesDescriptionPrefix')}{' '}
                        <strong>Vol. 1</strong> {t('series.generateVolumesDescriptionMiddle')}{' '}
                        <strong>Vol. {series.total_volumes}</strong>.
                        {' '}{t('series.generateVolumesDescriptionSuffix')}
                    </p>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setGenerateOpen(false)}>{t('common:common.cancel')}</Button>
                        <Button disabled={generatingVolumes} onClick={handleGenerateVolumes}>
                            <Wand2 className="mr-1.5 h-3.5 w-3.5" />
                            {generatingVolumes ? t('common:common.creating') : t('common:common.generate')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </AdminLayout>
    );
}
