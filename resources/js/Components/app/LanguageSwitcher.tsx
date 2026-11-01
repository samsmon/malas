import { useState } from 'react';
import { router, usePage } from '@inertiajs/react';
import { useTranslation } from 'react-i18next';
import { Check, Languages } from 'lucide-react';
import i18n from '@/lib/i18n';
import { Button } from '@/Components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/Components/ui/popover';
import { cn } from '@/lib/utils';

const LOCALES = ['id', 'en', 'ja'] as const;

interface LanguageSwitcherProps {
    collapsed?: boolean;
    side?: 'top' | 'right' | 'bottom' | 'left' | 'inline-start' | 'inline-end';
    align?: 'start' | 'center' | 'end';
    className?: string;
    size?: 'icon' | 'icon-sm' | 'icon-xs' | 'default' | 'sm' | 'lg';
}

export function LanguageSwitcher({
    collapsed,
    side = 'right',
    align = 'start',
    className,
    size,
}: LanguageSwitcherProps) {
    const { locale: defaultLocale, auth } = usePage().props;
    const { t, i18n } = useTranslation();
    const currentLocale = i18n.language || defaultLocale;
    const [open, setOpen] = useState(false);

    function handleSelect(value: string) {
        void i18n.changeLanguage(value);
        setOpen(false);
        // Guests (e.g. Landing page) have no account to store a language preference —
        // switching language happens client-side only, without calling an endpoint that requires login.
        if (!auth?.user) return;
        router.patch(route('settings.locale.update'), { locale: value }, {
            preserveScroll: true,
            preserveState: true,
        });
    }

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger
                render={
                    collapsed ? (
                        <Button
                            variant="ghost"
                            size={size ?? 'icon'}
                            className={className ? cn('flex shrink-0', className) : 'mx-auto flex'}
                            aria-label={t('locale.label')}
                        >
                            <Languages className="h-4 w-4" />
                        </Button>
                    ) : (
                        <Button
                            variant="ghost"
                            size={size ?? 'sm'}
                            className={cn('w-full justify-start gap-3 text-muted-foreground', className)}
                        >
                            <Languages className="h-4 w-4" />
                            {t(`locale.${currentLocale}`)}
                        </Button>
                    )
                }
            />
            <PopoverContent side={side} className="w-44 p-1" align={align}>
                {LOCALES.map((l) => (
                    <button
                        key={l}
                        type="button"
                        onClick={() => handleSelect(l)}
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
                    >
                        <Check className={cn('h-3.5 w-3.5', currentLocale === l ? 'opacity-100' : 'opacity-0')} />
                        {t(`locale.${l}`)}
                    </button>
                ))}
            </PopoverContent>
        </Popover>
    );
}
