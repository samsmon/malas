import { useState } from 'react';
import { Link, router, usePage } from '@inertiajs/react';
import { useTranslation } from 'react-i18next';
import {
    LogOut, Loader2, Plus, User as UserIcon,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/Components/ui/avatar';
import { Button } from '@/Components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/Components/ui/popover';
import { LoginMethodDialog } from '@/Components/app/LoginMethodDialog';
import { cn } from '@/lib/utils';
import { type LinkedAccount } from '@/types';

/**
 * Avatar/identity in the sidebar footer, now a Popover that combines: view profile, switch
 * to another account already linked in this session ("Add Account"), and logout (this account only, or
 * all accounts at once). Multi-account switching is session-based (see AccountLinkService)
 * and available to all users, not just admins.
 */
export function AccountSwitcher({ collapsed }: { collapsed?: boolean }) {
    const { auth, linked_accounts: linkedAccounts } = usePage().props;
    const user = auth.user!;
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);
    const [linkDialogOpen, setLinkDialogOpen] = useState(false);
    const [busy, setBusy] = useState<string | null>(null);

    function initials(name: string) {
        return name.slice(0, 2).toUpperCase();
    }

    function handleSwitch(account: LinkedAccount) {
        setBusy(`switch:${account.id}`);
        router.post(route('accounts.switch'), { user_id: account.id }, {
            onFinish: () => setBusy(null),
        });
    }

    function handleLogoutCurrent() {
        setBusy('logout-current');
        router.post(route('accounts.logoutCurrent'), {}, {
            onFinish: () => setBusy(null),
        });
    }

    function handleLogoutAll() {
        setBusy('logout-all');
        router.post(route('logout'), {}, {
            onFinish: () => setBusy(null),
        });
    }

    const trigger = collapsed ? (
        <Button variant="ghost" size="icon" className="mx-auto flex" aria-label={user.name}>
            <Avatar className="h-8 w-8 shrink-0">
                <AvatarImage src={user.avatar || undefined} alt={user.name} />
                <AvatarFallback className="text-xs">{initials(user.name)}</AvatarFallback>
            </Avatar>
        </Button>
    ) : (
        <button
            type="button"
            className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left transition-colors hover:bg-muted"
        >
            <Avatar className="h-8 w-8 shrink-0">
                <AvatarImage src={user.avatar || undefined} alt={user.name} />
                <AvatarFallback className="text-xs">{initials(user.name)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
                <p className="truncate text-sm font-medium">{user.name}</p>
                <p className="text-xs text-muted-foreground">{t(`common:settings.roles.${user.role}`)}</p>
            </div>
        </button>
    );

    return (
        <>
            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger render={trigger} />
                <PopoverContent side="right" align="end" className="w-64 p-1.5">
                    <Link
                        href={route('profile.show', user.username ?? user.id)}
                        className="flex items-center gap-2.5 rounded-md px-2 py-2 hover:bg-accent"
                        onClick={() => setOpen(false)}
                    >
                        <Avatar className="h-9 w-9 shrink-0">
                            <AvatarImage src={user.avatar || undefined} alt={user.name} />
                            <AvatarFallback className="text-xs">{initials(user.name)}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{user.name}</p>
                            <p className="truncate text-xs text-muted-foreground">{t('accountSwitcher.viewProfile')}</p>
                        </div>
                    </Link>

                    {linkedAccounts.length > 0 && (
                        <>
                            <div className="my-1 h-px bg-border" />
                            <p className="px-2 py-1 text-xs font-medium text-muted-foreground">{t('accountSwitcher.otherAccounts')}</p>
                            {linkedAccounts.map((account) => (
                                <button
                                    key={account.id}
                                    type="button"
                                    disabled={busy !== null}
                                    onClick={() => handleSwitch(account)}
                                    className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left hover:bg-accent disabled:opacity-50"
                                >
                                    <Avatar className="h-8 w-8 shrink-0">
                                        <AvatarImage src={account.avatar || undefined} alt={account.name} />
                                        <AvatarFallback className="text-xs">{initials(account.name)}</AvatarFallback>
                                    </Avatar>
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm">{account.name}</p>
                                        <p className="truncate text-xs text-muted-foreground">{t(`common:settings.roles.${account.role}`)}</p>
                                    </div>
                                    {busy === `switch:${account.id}` && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />}
                                </button>
                            ))}
                        </>
                    )}

                    <div className="my-1 h-px bg-border" />
                    <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() => { setOpen(false); setLinkDialogOpen(true); }}
                        className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left text-sm hover:bg-accent disabled:opacity-50"
                    >
                        <Plus className="h-4 w-4 text-muted-foreground" />
                        {t('accountSwitcher.addAccount')}
                    </button>

                    <div className="my-1 h-px bg-border" />
                    <button
                        type="button"
                        disabled={busy !== null}
                        onClick={handleLogoutCurrent}
                        className={cn(
                            'flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left text-sm text-muted-foreground hover:bg-accent hover:text-destructive disabled:opacity-50',
                        )}
                    >
                        {busy === 'logout-current' ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
                        {busy === 'logout-current' ? t('accountSwitcher.loggingOut') : t('accountSwitcher.logoutCurrent')}
                    </button>
                    {linkedAccounts.length > 0 && (
                        <button
                            type="button"
                            disabled={busy !== null}
                            onClick={handleLogoutAll}
                            className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left text-sm text-muted-foreground hover:bg-accent hover:text-destructive disabled:opacity-50"
                        >
                            {busy === 'logout-all' ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserIcon className="h-4 w-4" />}
                            {busy === 'logout-all' ? t('accountSwitcher.loggingOut') : t('accountSwitcher.logoutAll')}
                        </button>
                    )}
                </PopoverContent>
            </Popover>

            <LoginMethodDialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen} mode="link" />
        </>
    );
}
