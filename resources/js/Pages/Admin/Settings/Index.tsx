import { useRef, useState } from 'react';
import { Head, router, usePage } from '@inertiajs/react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import {
    AlertTriangle, Bot, CheckCircle2, Database, Download, Eye, EyeOff, HardDrive, Loader2, Mail, Save, Shield, Upload, XCircle, Zap,
} from 'lucide-react';
import AdminLayout from '@/Layouts/AdminLayout';
import PageHeader from '@/Components/app/PageHeader';
import { Button } from '@/Components/ui/button';
import { Input } from '@/Components/ui/input';
import { Label } from '@/Components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/Components/ui/card';
import { Switch } from '@/Components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/Components/ui/tabs';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/Components/ui/select';
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/Components/ui/dialog';
import { PageProps } from '@/types';

interface StorageSettingData {
    driver: 'local' | 's3';
    access_key_id: string | null;
    bucket: string | null;
    endpoint: string | null;
    region: string | null;
    url: string | null;
    secret_access_key: string | null;
    has_secret: boolean;
    migration_status: 'idle' | 'running' | 'completed' | 'failed';
    migration_message: string | null;
}

interface AiSettingData {
    provider: 'gemini' | 'openai' | 'claude';
    api_key: string | null;
    has_key: boolean;
}

interface MailSettingData {
    provider: 'resend';
    from_address: string | null;
    from_name: string | null;
    api_key: string | null;
    has_key: boolean;
}

/** Password input with an eye icon button to toggle show/hide — used for three secrets (AI, Mail, Storage). */
function SecretInput({ id, value, onChange, placeholder }: {
    id: string;
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
}) {
    const [visible, setVisible] = useState(false);
    return (
        <div className="relative">
            <Input
                id={id}
                type={visible ? 'text' : 'password'}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                className="pr-9"
            />
            <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-0 top-0 h-9 w-9 text-muted-foreground"
                onClick={() => setVisible((v) => !v)}
                tabIndex={-1}
            >
                {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
        </div>
    );
}

interface Props extends PageProps {
    setting: StorageSettingData;
    aiSetting: AiSettingData;
    mailSetting: MailSettingData;
}

const storageSchema = z.object({
    driver:             z.enum(['local', 's3']),
    access_key_id:      z.string().optional(),
    secret_access_key:  z.string().optional(),
    bucket:             z.string().optional(),
    endpoint:           z.string().optional(),
    region:             z.string().optional(),
    url:                z.string().optional(),
});
type StorageFormValues = z.infer<typeof storageSchema>;

const aiSchema = z.object({
    provider: z.enum(['gemini', 'openai', 'claude']),
    api_key: z.string().optional(),
});
type AiFormValues = z.infer<typeof aiSchema>;

const mailSchema = z.object({
    provider: z.enum(['resend']),
    api_key: z.string().optional(),
    from_address: z.string().optional(),
    from_name: z.string().optional(),
});
type MailFormValues = z.infer<typeof mailSchema>;

function FieldError({ message }: { message?: string }) {
    if (!message) return null;
    return <p className="text-xs text-destructive">{message}</p>;
}

function AiTab({ aiSetting }: { aiSetting: AiSettingData }) {
    const { t } = useTranslation('admin');
    const [submitting, setSubmitting] = useState(false);

    const AI_PROVIDER_LABELS: Record<AiFormValues['provider'], string> = {
        gemini: t('settings.ai.providers.gemini'),
        openai: t('settings.ai.providers.openai'),
        claude: t('settings.ai.providers.claude'),
    };

    const {
        control, handleSubmit, setError,
        formState: { errors },
    } = useForm<AiFormValues>({
        resolver: zodResolver(aiSchema),
        defaultValues: {
            provider: aiSetting.provider,
            api_key: aiSetting.api_key ?? '',
        },
    });

    function onSubmit(values: AiFormValues) {
        setSubmitting(true);
        router.put(route('admin.settings.ai.update'), values, {
            onError: (errs) => {
                Object.entries(errs).forEach(([k, msg]) => {
                    setError(k as keyof AiFormValues, { message: msg as string });
                });
            },
            onFinish: () => setSubmitting(false),
        });
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                    <Bot className="h-4 w-4" />
                    {t('settings.ai.cardTitle')}
                </CardTitle>
                <CardDescription>
                    {t('settings.ai.cardDescription')}
                </CardDescription>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                    <div className="space-y-1.5">
                        <Label>{t('settings.ai.provider')}</Label>
                        <Controller<AiFormValues, 'provider'>
                            control={control}
                            name="provider"
                            render={({ field }) => (
                                <Select value={field.value} onValueChange={field.onChange}>
                                    <SelectTrigger>
                                        <SelectValue>
                                            {(value: string) => AI_PROVIDER_LABELS[value as AiFormValues['provider']] ?? value}
                                        </SelectValue>
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="gemini">{AI_PROVIDER_LABELS.gemini}</SelectItem>
                                        <SelectItem value="openai">{AI_PROVIDER_LABELS.openai}</SelectItem>
                                        <SelectItem value="claude">{AI_PROVIDER_LABELS.claude}</SelectItem>
                                    </SelectContent>
                                </Select>
                            )}
                        />
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="api_key">
                            {t('settings.ai.apiKey')} {!aiSetting.has_key && <span className="text-destructive">*</span>}
                        </Label>
                        <Controller<AiFormValues, 'api_key'>
                            control={control}
                            name="api_key"
                            render={({ field }) => (
                                <SecretInput id="api_key" value={field.value ?? ''} onChange={field.onChange} />
                            )}
                        />
                        <FieldError message={errors.api_key?.message} />
                    </div>

                    <Button type="submit" disabled={submitting}>
                        <Save className="mr-1.5 h-3.5 w-3.5" />
                        {submitting ? t('common:common.saving') : t('common:common.save')}
                    </Button>
                </form>
            </CardContent>
        </Card>
    );
}

function MailTab({ mailSetting }: { mailSetting: MailSettingData }) {
    const { t } = useTranslation('admin');
    const [submitting, setSubmitting] = useState(false);

    const {
        register, control, handleSubmit, setError,
        formState: { errors },
    } = useForm<MailFormValues>({
        resolver: zodResolver(mailSchema),
        defaultValues: {
            provider: 'resend',
            api_key: mailSetting.api_key ?? '',
            from_address: mailSetting.from_address ?? '',
            from_name: mailSetting.from_name ?? '',
        },
    });

    function onSubmit(values: MailFormValues) {
        setSubmitting(true);
        router.put(route('admin.settings.mail.update'), values, {
            onError: (errs) => {
                Object.entries(errs).forEach(([k, msg]) => {
                    setError(k as keyof MailFormValues, { message: msg as string });
                });
            },
            onFinish: () => setSubmitting(false),
        });
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                    <Mail className="h-4 w-4" />
                    {t('settings.mail.cardTitle')}
                </CardTitle>
                <CardDescription>
                    {t('settings.mail.cardDescription')}
                </CardDescription>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                    <div className="space-y-1.5">
                        <Label htmlFor="mail_api_key">
                            {t('settings.mail.apiKey')} {!mailSetting.has_key && <span className="text-destructive">*</span>}
                        </Label>
                        <Controller<MailFormValues, 'api_key'>
                            control={control}
                            name="api_key"
                            render={({ field }) => (
                                <SecretInput
                                    id="mail_api_key"
                                    value={field.value ?? ''}
                                    onChange={field.onChange}
                                    placeholder={mailSetting.has_key ? undefined : 're_xxxxxxxx'}
                                />
                            )}
                        />
                        <FieldError message={errors.api_key?.message} />
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="from_address">{t('settings.mail.fromAddress')}</Label>
                        <Input
                            id="from_address"
                            type="email"
                            placeholder="noreply@domainmu.com"
                            {...register('from_address')}
                        />
                        <FieldError message={errors.from_address?.message} />
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="from_name">{t('settings.mail.fromName')}</Label>
                        <Input
                            id="from_name"
                            placeholder="Malas"
                            {...register('from_name')}
                        />
                        <FieldError message={errors.from_name?.message} />
                    </div>

                    <p className="text-xs text-muted-foreground">{t('settings.mail.hint')}</p>

                    <Button type="submit" disabled={submitting}>
                        <Save className="mr-1.5 h-3.5 w-3.5" />
                        {submitting ? t('common:common.saving') : t('common:common.save')}
                    </Button>
                </form>
            </CardContent>
        </Card>
    );
}

function StorageTab({ setting }: { setting: StorageSettingData }) {
    const { t } = useTranslation('admin');
    const [submitting, setSubmitting] = useState(false);
    const [testing, setTesting]       = useState(false);
    const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

    const {
        register, control, handleSubmit, setError, watch,
        formState: { errors },
    } = useForm<StorageFormValues>({
        resolver: zodResolver(storageSchema),
        defaultValues: {
            driver:            setting.driver,
            access_key_id:     setting.access_key_id ?? '',
            secret_access_key: setting.secret_access_key ?? '',
            bucket:            setting.bucket ?? '',
            endpoint:          setting.endpoint ?? '',
            region:            setting.region ?? '',
            url:               setting.url ?? '',
        },
    });

    const driver = watch('driver');

    function onSubmit(values: StorageFormValues) {
        setSubmitting(true);
        router.put(route('admin.settings.storage.update'), values, {
            onError: (errs) => {
                Object.entries(errs).forEach(([k, msg]) => {
                    setError(k as keyof StorageFormValues, { message: msg as string });
                });
            },
            onFinish: () => setSubmitting(false),
        });
    }

    async function testConnection() {
        setTesting(true);
        setTestResult(null);
        const values = watch();
        try {
            const res = await window.axios.post<{ success: boolean; message: string }>(
                route('admin.settings.storage.test'),
                {
                    access_key_id:     values.access_key_id,
                    secret_access_key: values.secret_access_key,
                    bucket:            values.bucket,
                    endpoint:          values.endpoint,
                    region:            values.region,
                    url:               values.url,
                },
            );
            setTestResult(res.data);
        } catch {
            setTestResult({ success: false, message: t('common:common.generalError') });
        } finally {
            setTesting(false);
        }
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                    <HardDrive className="h-4 w-4" />
                    {t('settings.storage.cardTitle')}
                </CardTitle>
                <CardDescription>
                    {t('settings.storage.cardDescription')}
                </CardDescription>
            </CardHeader>
            <CardContent>
                {setting.migration_status !== 'idle' && (
                    <div
                        className={`mb-4 flex items-start gap-2 rounded-md p-3 text-sm ${
                            setting.migration_status === 'running'
                                ? 'bg-muted text-muted-foreground'
                                : setting.migration_status === 'completed'
                                    ? 'bg-green-500/10 text-green-700 dark:text-green-400'
                                    : 'bg-destructive/10 text-destructive'
                        }`}
                    >
                        {setting.migration_status === 'running' && <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" />}
                        {setting.migration_status === 'completed' && <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />}
                        {setting.migration_status === 'failed' && <XCircle className="mt-0.5 h-4 w-4 shrink-0" />}
                        <span>
                            {setting.migration_status === 'running'
                                ? t('settings.storage.migrationRunning')
                                : setting.migration_message}
                        </span>
                    </div>
                )}
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                    <div className="space-y-1.5">
                        <Label>{t('settings.storage.driver')}</Label>
                        <Controller<StorageFormValues, 'driver'>
                            control={control}
                            name="driver"
                            render={({ field }) => (
                                <Select value={field.value} onValueChange={field.onChange}>
                                    <SelectTrigger>
                                        <SelectValue>
                                            {(value: string) => (value === 's3' ? t('settings.storage.driverS3') : t('settings.storage.driverLocal'))}
                                        </SelectValue>
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="local">{t('settings.storage.driverLocal')}</SelectItem>
                                        <SelectItem value="s3">{t('settings.storage.driverS3')}</SelectItem>
                                    </SelectContent>
                                </Select>
                            )}
                        />
                    </div>

                    {driver === 's3' && (
                        <div className="space-y-4 rounded-lg border p-4">
                            <div className="space-y-1.5">
                                <Label htmlFor="access_key_id">{t('settings.storage.accessKeyId')} <span className="text-destructive">*</span></Label>
                                <Input id="access_key_id" {...register('access_key_id')} />
                                <FieldError message={errors.access_key_id?.message} />
                            </div>

                            <div className="space-y-1.5">
                                <Label htmlFor="secret_access_key">
                                    {t('settings.storage.secretAccessKey')} {!setting.has_secret && <span className="text-destructive">*</span>}
                                </Label>
                                <Controller<StorageFormValues, 'secret_access_key'>
                                    control={control}
                                    name="secret_access_key"
                                    render={({ field }) => (
                                        <SecretInput id="secret_access_key" value={field.value ?? ''} onChange={field.onChange} />
                                    )}
                                />
                                <FieldError message={errors.secret_access_key?.message} />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <Label htmlFor="bucket">{t('settings.storage.bucket')} <span className="text-destructive">*</span></Label>
                                    <Input id="bucket" {...register('bucket')} />
                                    <FieldError message={errors.bucket?.message} />
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="region">{t('settings.storage.region')}</Label>
                                    <Input id="region" placeholder="auto" {...register('region')} />
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <Label htmlFor="endpoint">{t('settings.storage.endpoint')} <span className="text-destructive">*</span></Label>
                                <Input id="endpoint" placeholder="https://xxxx.r2.cloudflarestorage.com" {...register('endpoint')} />
                                <FieldError message={errors.endpoint?.message} />
                            </div>

                            <div className="space-y-1.5">
                                <Label htmlFor="url">{t('settings.storage.publicUrl')} <span className="text-destructive">*</span></Label>
                                <Input id="url" placeholder="https://pub-xxxx.r2.dev" {...register('url')} />
                                <FieldError message={errors.url?.message} />
                            </div>

                            {testResult && (
                                <div className={`flex items-start gap-2 rounded-md p-3 text-sm ${testResult.success ? 'bg-green-500/10 text-green-700 dark:text-green-400' : 'bg-destructive/10 text-destructive'}`}>
                                    {testResult.success ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0" />}
                                    <span>{testResult.message}</span>
                                </div>
                            )}

                            <Button type="button" variant="outline" size="sm" disabled={testing} onClick={testConnection}>
                                <Zap className="mr-1.5 h-3.5 w-3.5" />
                                {testing ? t('settings.storage.testing') : t('settings.storage.testConnection')}
                            </Button>
                        </div>
                    )}

                    <Button type="submit" disabled={submitting}>
                        <Save className="mr-1.5 h-3.5 w-3.5" />
                        {submitting ? t('common:common.saving') : t('common:common.save')}
                    </Button>
                </form>
            </CardContent>
        </Card>
    );
}

function DatabaseTab() {
    const { t } = useTranslation('admin');
    const warningItems = t('settings.database.warningItems', { returnObjects: true }) as string[];
    const fileRef                         = useRef<HTMLInputElement>(null);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [confirmOpen, setConfirmOpen]   = useState(false);
    const [importing, setImporting]       = useState(false);

    function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0] ?? null;
        setSelectedFile(file);
    }

    function handleImport() {
        if (!selectedFile) return;
        setImporting(true);
        const form = new FormData();
        form.append('backup_file', selectedFile);
        router.post(route('admin.settings.db.import'), form, {
            forceFormData: true,
            onFinish: () => {
                setImporting(false);
                setConfirmOpen(false);
                setSelectedFile(null);
                if (fileRef.current) fileRef.current.value = '';
            },
        });
    }

    return (
        <div className="space-y-6">
            {/* Download */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                        <Download className="h-4 w-4" />
                        {t('settings.database.downloadTitle')}
                    </CardTitle>
                    <CardDescription>
                        {t('settings.database.downloadDescription')}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <a
                        href={route('admin.settings.db.download')}
                        className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90"
                    >
                        <Database className="h-4 w-4" />
                        {t('settings.database.downloadNow')}
                    </a>
                    <p className="mt-2 text-xs text-muted-foreground">
                        {t('settings.database.downloadFilenameHint')}
                    </p>
                </CardContent>
            </Card>

            {/* Import */}
            <Card className="border-destructive/30">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                        <Upload className="h-4 w-4" />
                        {t('settings.database.importTitle')}
                    </CardTitle>
                    <CardDescription>
                        {t('settings.database.importDescriptionPrefix')}
                        <strong className="text-destructive"> {t('settings.database.importDescriptionSuffix')}</strong>
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-start gap-3 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                        <div>
                            <p className="font-medium">{t('settings.database.warningTitle')}</p>
                            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs">
                                {warningItems.map((item) => (
                                    <li key={item}>{item}</li>
                                ))}
                            </ul>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium">{t('settings.database.backupFileLabel')}</label>
                        <input
                            ref={fileRef}
                            type="file"
                            accept=".sql,.txt"
                            onChange={handleFileChange}
                            className="block w-full text-sm text-muted-foreground file:mr-3 file:cursor-pointer file:rounded file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-muted/80"
                        />
                    </div>

                    <Button
                        variant="destructive"
                        disabled={!selectedFile || importing}
                        onClick={() => setConfirmOpen(true)}
                    >
                        <Upload className="mr-1.5 h-3.5 w-3.5" />
                        {importing ? t('settings.database.importing') : t('settings.database.import')}
                        {selectedFile && !importing ? ` — ${selectedFile.name}` : ''}
                    </Button>
                </CardContent>
            </Card>

            {/* Konfirmasi import */}
            <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t('settings.database.confirmTitle')}</DialogTitle>
                        <DialogDescription>
                            {t('settings.database.confirmDescriptionPrefix')} <strong>{selectedFile?.name}</strong>.
                            {' '}{t('settings.database.confirmDescriptionSuffix')}
                        </DialogDescription>
                    </DialogHeader>
                    <p className="text-sm text-muted-foreground">
                        {t('settings.database.confirmQuestion')}
                    </p>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setConfirmOpen(false)}>
                            {t('common:common.cancel')}
                        </Button>
                        <Button variant="destructive" disabled={importing} onClick={handleImport}>
                            {importing ? t('settings.database.importing') : t('settings.database.confirmImportNow')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

function ContentTab() {
    const { t } = useTranslation('admin');
    const { site_settings } = usePage<PageProps>().props;
    const [blurAdult, setBlurAdult] = useState(site_settings.blur_adult_content);
    const [saving, setSaving] = useState(false);

    function handleToggle(checked: boolean) {
        setBlurAdult(checked);
        setSaving(true);
        router.put(route('admin.settings.content.update'), { blur_adult_content: checked }, {
            preserveScroll: true,
            onError: () => setBlurAdult(!checked),
            onFinish: () => setSaving(false),
        });
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                    <Shield className="h-4 w-4" />
                    {t('settings.content.cardTitle')}
                </CardTitle>
                <CardDescription>
                    {t('settings.content.cardDescription')}
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div className="flex items-center justify-between rounded-lg border p-4">
                    <div className="flex items-start gap-3">
                        <Eye className="mt-0.5 h-4 w-4 text-muted-foreground" />
                        <div>
                            <p className="text-sm font-medium">{t('settings.content.blurTitle')}</p>
                            <p className="text-xs text-muted-foreground">
                                {t('settings.content.blurDescription')}
                            </p>
                        </div>
                    </div>
                    <Switch checked={blurAdult} onCheckedChange={handleToggle} disabled={saving} />
                </div>
            </CardContent>
        </Card>
    );
}

export default function SettingsIndex({ setting, aiSetting, mailSetting }: Props) {
    const { t } = useTranslation('admin');
    return (
        <AdminLayout
            header={
                <PageHeader
                    title={t('settings.title')}
                    description={t('settings.description')}
                />
            }
        >
            <Head title={t('settings.title')} />

            <div className="max-w-2xl">
                <Tabs defaultValue="storage">
                    <TabsList className="mb-4">
                        <TabsTrigger value="storage">{t('settings.tabs.storage')}</TabsTrigger>
                        <TabsTrigger value="database">{t('settings.tabs.database')}</TabsTrigger>
                        <TabsTrigger value="content">{t('settings.tabs.content')}</TabsTrigger>
                        <TabsTrigger value="ai">{t('settings.tabs.ai')}</TabsTrigger>
                        <TabsTrigger value="mail">{t('settings.tabs.mail')}</TabsTrigger>
                    </TabsList>
                    <TabsContent value="storage">
                        <StorageTab setting={setting} />
                    </TabsContent>
                    <TabsContent value="database">
                        <DatabaseTab />
                    </TabsContent>
                    <TabsContent value="content">
                        <ContentTab />
                    </TabsContent>
                    <TabsContent value="ai">
                        <AiTab aiSetting={aiSetting} />
                    </TabsContent>
                    <TabsContent value="mail">
                        <MailTab mailSetting={mailSetting} />
                    </TabsContent>
                </Tabs>
            </div>
        </AdminLayout>
    );
}
