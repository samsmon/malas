import { useEffect, useRef, useState } from 'react';
import { router, usePage } from '@inertiajs/react';

export type Theme = 'light' | 'dark' | 'system';
type ResolvedTheme = 'light' | 'dark';

function resolveSystemTheme(): ResolvedTheme {
    if (typeof window === 'undefined') return 'light';
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function resolve(theme: Theme): ResolvedTheme {
    return theme === 'system' ? resolveSystemTheme() : theme;
}

function applyTheme(theme: Theme) {
    document.documentElement.classList.toggle('dark', resolve(theme) === 'dark');
}

function getInitialTheme(userTheme?: Theme): Theme {
    if (userTheme) return userTheme;
    if (typeof window === 'undefined') return 'system';
    return (localStorage.getItem('theme') as Theme | null) ?? 'system';
}

/**
 * Theme is stored per user (users.theme), same pattern as locale — synced to the server when logged in,
 * localStorage-only for guests (Landing/PublicShell). 'system' follows the OS prefers-color-scheme
 * and live-updates if the OS preference changes while the app is open.
 */
export function useTheme() {
    const { auth } = usePage().props;
    const userTheme = auth.user?.theme;
    const [theme, setThemeState] = useState<Theme>(() => getInitialTheme(userTheme));
    const lastSyncedProp = useRef(userTheme);

    // Apply + persist whenever `theme` changes (whether from a user click or a sync from the server).
    useEffect(() => {
        applyTheme(theme);
        localStorage.setItem('theme', theme);
    }, [theme]);

    // If the shared prop from the server changes (e.g. changed from another device/tab, refreshed on
    // Inertia navigation) and differs from local state, follow the server value.
    useEffect(() => {
        if (userTheme && userTheme !== lastSyncedProp.current) {
            lastSyncedProp.current = userTheme;
            setThemeState(userTheme);
        }
    }, [userTheme]);

    // Live-update when in 'system' mode and the OS preference changes while the app is open.
    useEffect(() => {
        if (theme !== 'system') return;
        const mql = window.matchMedia('(prefers-color-scheme: dark)');
        const handleChange = () => applyTheme('system');
        mql.addEventListener('change', handleChange);
        return () => mql.removeEventListener('change', handleChange);
    }, [theme]);

    function setTheme(value: Theme) {
        setThemeState(value);
        lastSyncedProp.current = value;
        if (!auth.user) return;
        router.patch(route('settings.theme.update'), { theme: value }, {
            preserveScroll: true,
            preserveState: true,
        });
    }

    return { theme, resolvedTheme: resolve(theme), setTheme };
}
