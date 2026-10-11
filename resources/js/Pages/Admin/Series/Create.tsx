import { useMemo, useRef, useState } from 'react';
import { Head, Link, router } from '@inertiajs/react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import AdminLayout from '@/Layouts/AdminLayout';
import PageHeader from '@/Components/app/PageHeader';
import { Button, buttonVariants } from '@/Components/ui/button';
import { Input } from '@/Components/ui/input';
import { Textarea } from '@/Components/ui/textarea';
import { Label } from '@/Components/ui/label';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/Components/ui/select';
import { cn } from '@/lib/utils';

const baseSchema = z.object({
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

type FormValues = z.infer<typeof baseSchema>;

function FieldError({ message }: { message?: string }) {
    if (!message) return null;
    return <p className="text-sm text-destructive">{message}</p>;
}

export default function SeriesCreate() {
    const { t } = useTranslation('admin');
    const [coverFile, setCoverFile] = useState<File | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);

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

    const schema = useMemo(() => baseSchema.refine(
        (data) => !data.published_from || !data.published_to || data.published_to >= data.published_from,
        { message: t('series.create.endDateBeforeStart'), path: ['published_to'] },
    ), [t]);

    const [serverErrors, setServerErrors] = useState<string[]>([]);

    const {
        register,
        control,
        handleSubmit,
        setError,
        formState: { errors },
    } = useForm<FormValues>({
        resolver: zodResolver(schema),
        defaultValues: { status: 'publishing', type: 'manga' },
    });

    function onInvalid(errs: Record<string, { message?: string } | undefined>) {
        setServerErrors(Object.entries(errs).map(([k, v]) => v?.message || `${k}: tidak valid`));
    }

    function onSubmit(values: FormValues) {
        setSubmitting(true);
        setServerErrors([]);
        const fd = new FormData();
        Object.entries(values).forEach(([k, v]) => {
            if (v !== undefined && v !== '') fd.append(k, v);
        });
        if (coverFile) fd.append('cover', coverFile);

        router.post(route('admin.series.store'), fd, {
            forceFormData: true,
            onError: (errs) => {
                Object.entries(errs).forEach(([k, msg]) => {
                    setError(k as keyof FormValues, { message: msg });
                });
                setServerErrors(Object.values(errs));
                setSubmitting(false);
            },
            onFinish: () => setSubmitting(false),
        });
    }

    return (
        <AdminLayout
            header={
                <PageHeader
                    title={t('series.create.title')}
                    breadcrumbs={[
                        { label: t('series.breadcrumb'), href: route('admin.series.index') },
                        { label: t('series.create.breadcrumbAdd') },
                    ]}
                />
            }
        >
            <Head title={t('series.create.title')} />
            <form onSubmit={handleSubmit(onSubmit, onInvalid)} className="max-w-2xl space-y-5">
                {serverErrors.length > 0 && (
                <div role="alert" className="mb-4 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                    <p className="mb-1 font-medium">Gagal menyimpan:</p>
                    <ul className="list-disc space-y-0.5 pl-5">
                        {serverErrors.map((m, i) => <li key={i}>{m}</li>)}
                    </ul>
                </div>
            )}
                <div className="space-y-1.5">
                    <Label htmlFor="title_romaji">{t('series.create.titleRomajiLabel')} <span className="text-destructive">*</span></Label>
                    <Input id="title_romaji" {...register('title_romaji')} />
                    <FieldError message={errors.title_romaji ? t('common:common.required') : undefined} />
                </div>

                <div className="space-y-1.5">
                    <Label htmlFor="title_english">{t('series.create.titleEnglishLabel')}</Label>
                    <Input id="title_english" {...register('title_english')} />
                </div>

                <div className="space-y-1.5">
                    <Label htmlFor="title_japanese">{t('series.create.titleJapaneseLabel')}</Label>
                    <Input id="title_japanese" {...register('title_japanese')} />
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                        <Label>{t('common:common.status')} <span className="text-destructive">*</span></Label>
                        <Controller<FormValues, 'status'>
                            control={control}
                            name="status"
                            render={({ field }) => (
                                <Select value={field.value} onValueChange={field.onChange}>
                                    <SelectTrigger><SelectValue>{(value: string) => STATUS_LABELS[value] ?? value}</SelectValue></SelectTrigger>
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
                        <FieldError message={errors.status?.message} />
                    </div>

                    <div className="space-y-1.5">
                        <Label>{t('common:common.type')} <span className="text-destructive">*</span></Label>
                        <Controller<FormValues, 'type'>
                            control={control}
                            name="type"
                            render={({ field }) => (
                                <Select value={field.value} onValueChange={field.onChange}>
                                    <SelectTrigger><SelectValue>{(value: string) => TYPE_LABELS[value] ?? value}</SelectValue></SelectTrigger>
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
                        <FieldError message={errors.type?.message} />
                    </div>
                </div>

                <div className="space-y-1.5">
                    <Label htmlFor="synopsis">{t('series.create.synopsisLabel')}</Label>
                    <Textarea id="synopsis" rows={4} className="resize-none" {...register('synopsis')} />
                </div>

                <div className="space-y-1.5">
                    <Label>{t('series.coverLabel')}</Label>
                    <Input
                        ref={fileRef}
                        type="file"
                        accept="image/*"
                        className="cursor-pointer"
                        onChange={(e) => setCoverFile(e.target.files?.[0] ?? null)}
                    />
                    {coverFile && <p className="text-xs text-muted-foreground">{coverFile.name}</p>}
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                        <Label htmlFor="published_from">{t('series.create.publishedFrom')}</Label>
                        <Input id="published_from" type="date" {...register('published_from')} />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="published_to">{t('series.create.publishedTo')}</Label>
                        <Input id="published_to" type="date" {...register('published_to')} />
                    </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-1.5">
                        <Label htmlFor="total_volumes">{t('series.totalVolumes')}</Label>
                        <Input id="total_volumes" type="number" min={1} {...register('total_volumes')} />
                        <FieldError message={errors.total_volumes?.message} />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="score">{t('series.score')}</Label>
                        <Input id="score" type="number" step="0.01" min={0} max={10} {...register('score')} />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="rank">{t('series.rank')}</Label>
                        <Input id="rank" type="number" min={1} {...register('rank')} />
                    </div>
                </div>

                <div className="flex gap-3 pt-2">
                    <Button type="submit" disabled={submitting}>
                        {submitting ? t('common:common.saving') : t('common:common.save')}
                    </Button>
                    <Link
                        href={route('admin.series.index')}
                        className={cn(buttonVariants({ variant: 'outline' }))}
                    >
                        {t('common:common.cancel')}
                    </Link>
                </div>
            </form>
        </AdminLayout>
    );
}
