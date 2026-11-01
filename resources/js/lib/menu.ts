import { type MenuItem } from '@/types';

/**
 * Built-in system menus (seeded via MenuSeeder) are mapped to the `menu.*`
 * translation keys in common.json — so sidebar labels follow the language. Menu keys
 * not in this map (e.g. manually renamed by an admin) fall back to the DB label as-is.
 */
const MENU_KEY_TRANSLATIONS: Record<string, string> = {
    'admin.dashboard': 'menu.dashboard',
    'admin.series': 'menu.series',
    'admin.collections': 'menu.collections',
    'admin.loans': 'menu.loans',
    'admin.users': 'menu.users',
    'category.anilist': 'menu.importData',
    'admin.search-external': 'menu.searchAllSources',
    'admin.anilist': 'menu.searchManga',
    'admin.anilist.status': 'menu.anilistStatus',
    'admin.ranobedb': 'menu.searchLightNovel',
    'category.lainnya': 'menu.others',
    'admin.menus': 'menu.menuManagement',
    'admin.menus.user-sidebar': 'menu.userSidebar',
    'admin.announcements': 'menu.announcements',
    'admin.tickets': 'menu.tickets',
    'admin.settings': 'menu.settings',
    'admin.activity-logs': 'menu.activityLog',
    'admin.funfact-quota': 'menu.funfactQuota',
    'user.dashboard': 'menu.dashboard',
    'user.catalog': 'menu.catalog',
    'user.collection': 'menu.myCollection',
    'user.wishlist': 'menu.wishlist',
    'user.loans': 'menu.myLoans',
    'user.directory': 'menu.findUsers',
    'user.tickets': 'menu.tickets',
    'settings': 'menu.profile',
};

export function menuTranslationKey(key: string): string | null {
    return MENU_KEY_TRANSLATIONS[key] ?? null;
}

/**
 * Flatten the menu (top-level + children) into a single list of navigable items
 * (those with a route_name), in exactly the same order SidebarNav renders:
 * top-level items without children are included directly, top-level items that have children
 * are replaced by their children (the category itself usually has no route_name).
 * Used to keep the sidebar order consistent with the Command Palette / Global Search (Ctrl+K).
 */
export function flattenMenuItems(menus: MenuItem[]): MenuItem[] {
    const topLevel = menus.filter((m) => !m.parent_key);
    const childrenByParent = new Map<string, MenuItem[]>();
    menus.filter((m) => m.parent_key).forEach((m) => {
        const arr = childrenByParent.get(m.parent_key!) ?? [];
        arr.push(m);
        childrenByParent.set(m.parent_key!, arr);
    });

    const result: MenuItem[] = [];
    topLevel.forEach((item) => {
        const children = childrenByParent.get(item.key);
        if (children && children.length > 0) {
            result.push(...children);
        } else if (item.route_name) {
            result.push(item);
        }
    });

    return result.filter((item) => !!item.route_name);
}
