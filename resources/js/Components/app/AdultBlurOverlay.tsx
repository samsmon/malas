import { useState, type ReactNode, type MouseEvent } from 'react';
import { usePage } from '@inertiajs/react';
import { useTranslation } from 'react-i18next';
import { Eye } from 'lucide-react';
import { cn } from '@/lib/utils';
import { type PageProps } from '@/types';

interface AdultBlurOverlayProps {
    isAdult: boolean;
    children: ReactNode;
    className?: string;
}

/** Wrapper replacing the plain cover div — always renders the given className (e.g. aspect-[2/3]),
 * and adds a blur layer + reveal button on top when the series is marked 18+. */
export function AdultBlurOverlay({ isAdult, children, className }: AdultBlurOverlayProps) {
    const { t } = useTranslation();
    const { site_settings } = usePage<PageProps>().props;
    const [revealed, setRevealed] = useState(false);
    const shouldBlur = isAdult && site_settings.blur_adult_content && !revealed;

    function handleReveal(e: MouseEvent) {
        e.preventDefault();
        e.stopPropagation();
        setRevealed(true);
    }

    return (
        <div className={cn('relative', className)}>
            <div className={cn('h-full w-full', shouldBlur && 'scale-105 blur-md')}>
                {children}
            </div>
            {shouldBlur && (
                <button
                    type="button"
                    onClick={handleReveal}
                    className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/50 text-white transition-colors hover:bg-black/40"
                >
                    <Eye className="h-5 w-5" />
                    <span className="text-[10px] font-medium">{t('components.adultBlurOverlay.clickToView')}</span>
                </button>
            )}
        </div>
    );
}
