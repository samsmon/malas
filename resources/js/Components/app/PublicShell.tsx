import { PropsWithChildren, ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LogIn } from 'lucide-react';
import { Button } from '@/Components/ui/button';
import { LoginMethodDialog } from '@/Components/app/LoginMethodDialog';

/**
 * Minimal shell for public pages accessible without login (e.g. public profile, public
 * collection group) — just a header + login button, no sidebar/internal menu.
 */
export function PublicShell({ header, children }: PropsWithChildren<{ header?: ReactNode }>) {
    const { t } = useTranslation();
    const [loginOpen, setLoginOpen] = useState(false);

    return (
        <div className="min-h-screen bg-background">
            <header className="flex h-14 items-center justify-between border-b px-6">
                <span className="text-base font-bold tracking-tight">Malas</span>
                <Button variant="outline" size="sm" onClick={() => setLoginOpen(true)}>
                    <LogIn className="mr-1.5 h-3.5 w-3.5" />
                    {t('nav.login')}
                </Button>
            </header>
            {header && <div className="border-b bg-background px-6 py-4">{header}</div>}
            <main className="mx-auto max-w-5xl p-6">{children}</main>
            <LoginMethodDialog open={loginOpen} onOpenChange={setLoginOpen} />
        </div>
    );
}
