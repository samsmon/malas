import { useState } from 'react';
import { Head, Link, router } from '@inertiajs/react';
import { useTranslation } from 'react-i18next';
import { BookOpen, Globe, Layers, Loader2, Lock, Plus } from 'lucide-react';
import UserLayout from '@/Layouts/UserLayout';
import PageHeader from '@/Components/app/PageHeader';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from '@/Components/ui/empty';
import { Badge } from '@/Components/ui/badge';
import { Button } from '@/Components/ui/button';
import { Input } from '@/Components/ui/input';
import { Label } from '@/Components/ui/label';
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/Components/ui/dialog';
import { PageProps } from '@/types';

interface GroupRow {
    id: string;
    slug: string;
    name: string;
    is_public: boolean;
    items_count: number;
    cover_urls: string[];
}

interface Props extends PageProps {
    groups: GroupRow[];
}

/**
 * Custom collection groups, MangaDex MDList style — named lists that can hold any manga from the user's
 * collection (many-to-many, one manga can be in several groups). This page only lists groups; the contents
 * of each group are managed in CollectionGroups/Show.tsx.
 */
export default function CollectionGroupsIndex({ groups }: Props) {
    const { t } = useTranslation('collection');
    const [createOpen, setCreateOpen] = useState(false);
    const [name, setName] = useState('');
    const [creating, setCreating] = useState(false);

    function handleCreate(e: React.FormEvent) {
        e.preventDefault();
        setCreating(true);
        router.post(route('collection.groups.store'), { name }, {
            onSuccess: () => { setCreateOpen(false); setName(''); },
            onFinish: () => setCreating(false),
        });
    }

    return (
        <UserLayout
            header={
                <PageHeader
                    title={t('groups.index.title')}
                    description={t('groups.index.count', { count: groups.length })}
                    actions={
                        <Button size="sm" onClick={() => setCreateOpen(true)}>
                            <Plus className="mr-1.5 h-3.5 w-3.5" />
                            {t('groups.index.create')}
                        </Button>
                    }
                />
            }
        >
            <Head title={t('groups.index.title')} />

            {groups.length === 0 ? (
                <Empty>
                    <EmptyHeader>
                        <EmptyMedia variant="icon">
                            <Layers />
                        </EmptyMedia>
                        <EmptyTitle>{t('groups.index.empty.title')}</EmptyTitle>
                        <EmptyDescription>{t('groups.index.empty.description')}</EmptyDescription>
                    </EmptyHeader>
                    <EmptyContent>
                        <Button onClick={() => setCreateOpen(true)}>
                            <Plus className="mr-1.5 h-4 w-4" />
                            {t('groups.index.create')}
                        </Button>
                    </EmptyContent>
                </Empty>
            ) : (
                <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(200px,1fr))]">
                    {groups.map((g) => (
                        <Link
                            key={g.id}
                            href={route('collection.groups.show', g.slug)}
                            className="group relative flex flex-col overflow-hidden rounded-lg border bg-card transition-shadow hover:shadow-md"
                        >
                            <Badge
                                variant={g.is_public ? 'default' : 'secondary'}
                                className="absolute right-1.5 top-1.5 z-10 gap-1"
                            >
                                {g.is_public ? <Globe className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
                                {g.is_public ? t('groups.visibility.public') : t('groups.visibility.private')}
                            </Badge>
                            <div className="grid aspect-[2/1] grid-cols-2 grid-rows-2 gap-0.5 overflow-hidden bg-muted">
                                {g.cover_urls.length > 0 ? (
                                    g.cover_urls.map((url, i) => (
                                        <img
                                            key={i}
                                            src={url}
                                            alt=""
                                            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                                        />
                                    ))
                                ) : (
                                    <div className="col-span-2 row-span-2 flex items-center justify-center">
                                        <BookOpen className="h-8 w-8 text-muted-foreground/40" />
                                    </div>
                                )}
                            </div>
                            <div className="p-3">
                                <p className="line-clamp-1 text-sm font-medium">{g.name}</p>
                                <p className="text-xs text-muted-foreground">{t('groups.index.itemCount', { count: g.items_count })}</p>
                            </div>
                        </Link>
                    ))}
                </div>
            )}

            <Dialog open={createOpen} onOpenChange={(open) => { setCreateOpen(open); if (!open) setName(''); }}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t('groups.createDialog.title')}</DialogTitle>
                        <DialogDescription>{t('groups.createDialog.description')}</DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleCreate} className="space-y-4">
                        <div className="space-y-1.5">
                            <Label htmlFor="group-name">{t('groups.nameLabel')}</Label>
                            <Input
                                id="group-name"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder={t('groups.namePlaceholder')}
                                autoFocus
                                required
                                maxLength={100}
                            />
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                                {t('groups.createDialog.cancel')}
                            </Button>
                            <Button type="submit" disabled={creating || !name.trim()}>
                                {creating && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                                {creating ? t('groups.createDialog.creating') : t('groups.createDialog.create')}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </UserLayout>
    );
}
