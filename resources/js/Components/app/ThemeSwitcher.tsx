import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Monitor, Moon, Sun, type LucideIcon } from 'lucide-react';
import { useTheme, type Theme } from '@/hooks/useTheme';
import { Button } from '@/Components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/Components/ui/popover';
import { cn } from '@/lib/utils';

const THEMES: readonly Theme[] = ['light', 'dark', 'system'];

const THEME_ICONS: Record<Theme, LucideIcon> = {
    light: Sun,
    dark: Moon,
    system: Monitor,
};

interface ThemeSwitcherProps {
    collapsed?: boolean;
    side?: 'top' | 'right' | 'bottom' | 'left' | 'inline-start' | 'inline-end';
    align?: 'start' | 'center' | 'end';
    className?: string;
    size?: 'icon' | 'icon-sm' | 'icon-xs' | 'default' | 'sm' | 'lg';
}

export function ThemeSwitcher({
    collapsed,
    side = 'right',
    align = 'start',
    className,
    size,
}: ThemeSwitcherProps) {
    const { theme, resolvedTheme, setTheme } = useTheme();
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);

    // The trigger icon (collapsed mode) follows the APPLIED theme (light/dark), not the raw
    // 'system' choice — so the icon is always representative even when following the OS preference.
    const TriggerIcon = collapsed ? THEME_ICONS[resolvedTheme] : THEME_ICONS[theme];

    function handleSelect(value: Theme) {
        setTheme(value);
        setOpen(false);
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
                            aria-label={t('theme.label')}
                        >
                            <TriggerIcon className="h-4 w-4" />
                        </Button>
                    ) : (
                        <Button
                            variant="ghost"
                            size={size ?? 'sm'}
                            className={cn('w-full justify-start gap-3 text-muted-foreground', className)}
                        >
                            <TriggerIcon className="h-4 w-4" />
                            {t(`theme.${theme}`)}
                        </Button>
                    )
                }
            />
            <PopoverContent side={side} className="w-44 p-1" align={align}>
                {THEMES.map((option) => {
                    const OptionIcon = THEME_ICONS[option];
                    return (
                        <button
                            key={option}
                            type="button"
                            onClick={() => handleSelect(option)}
                            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
                        >
                            <Check className={cn('h-3.5 w-3.5', theme === option ? 'opacity-100' : 'opacity-0')} />
                            <OptionIcon className="h-3.5 w-3.5" />
                            {t(`theme.${option}`)}
                        </button>
                    );
                })}
            </PopoverContent>
        </Popover>
    );
}
