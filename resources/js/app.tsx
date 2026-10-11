import '../css/app.css';
import './bootstrap';
import i18n from '@/lib/i18n';

import { createInertiaApp } from '@inertiajs/react';
import { resolvePageComponent } from 'laravel-vite-plugin/inertia-helpers';
import { createRoot } from 'react-dom/client';
import { Toaster } from '@/Components/ui/sonner';
import { type PageProps } from '@/types';

const appName = import.meta.env.VITE_APP_NAME || 'MALAS';

// Satu chunk per halaman (lazy). Kunjungan pertama ke sebuah menu butuh dua jeda jaringan berurutan:
// data halaman, lalu chunk-nya. Memuat chunk menu utama saat browser idle menghilangkan jeda kedua.
const pages = import.meta.glob('./Pages/**/*.tsx');

const PRELOAD_USER = [
    'User/Dashboard', 'User/Catalog/Index', 'User/Collection/Index', 'User/Wishlist/Index',
    'User/Loans/Index', 'User/Tickets/Index', 'User/CollectionGroups/Index',
];
const PRELOAD_ADMIN = [
    'Admin/Dashboard', 'Admin/Series/Index', 'Admin/Collections/Index', 'Admin/Users/Index',
    'Admin/Loans/Index', 'Admin/Tickets/Index', 'Admin/ActivityLog/Index', 'Admin/Announcements/Index',
];

function preloadMainPages(current: string) {
    const conn = (navigator as unknown as { connection?: { saveData?: boolean } }).connection;
    if (conn?.saveData) return;
    const list = current.startsWith('Admin/') ? PRELOAD_ADMIN : current.startsWith('User/') ? PRELOAD_USER : [];
    const run = () => {
        list.forEach((name) => {
            const load = pages[`./Pages/${name}.tsx`];
            if (load && name !== current) void load().catch(() => {});
        });
    };
    if ('requestIdleCallback' in window) {
        window.requestIdleCallback(run, { timeout: 5000 });
    } else {
        setTimeout(run, 2500);
    }
}

createInertiaApp({
    title: (title) => title ? `${title} - ${appName}` : appName,
    resolve: (name) => {
        return resolvePageComponent(`./Pages/${name}.tsx`, pages).catch((e: any) => {
            if (e.message?.includes('dynamically imported module') || e.name === 'TypeError') {
                window.location.reload();
            }
            throw e;
        });
    },
    setup({ el, App, props }) {
        const initialLocale = (props.initialPage.props as unknown as PageProps).locale;
        if (initialLocale) void i18n.changeLanguage(initialLocale);

        const root = createRoot(el);
        preloadMainPages(props.initialPage.component);

        root.render(
            <>
                <App {...props} />
                <Toaster richColors position="top-right" closeButton />
            </>,
        );
    },
    progress: {
        color: '#4B5563',
        delay: 100,
    },
});
