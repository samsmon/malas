<?php

namespace Database\Seeders;

use App\Models\Menu;
use Illuminate\Database\Seeder;

class MenuSeeder extends Seeder
{
    public function run(): void
    {
        $menus = [
            // Admin menus: main (top-level, not grouped)
            [
                'key' => 'admin.dashboard',
                'label' => 'Dashboard',
                'icon' => 'layout-dashboard',
                'route_name' => 'admin.dashboard',
                'sort_order' => 1,
                'role_access' => ['admin', 'super_admin'],
            ],
            [
                'key' => 'admin.series',
                'label' => 'Series',
                'icon' => 'book-open',
                'route_name' => 'admin.series.index',
                'sort_order' => 2,
                'role_access' => ['admin', 'super_admin'],
            ],
            [
                'key' => 'admin.collections',
                'label' => 'Collections',
                'icon' => 'library',
                'route_name' => 'admin.collections.index',
                'sort_order' => 3,
                'role_access' => ['admin', 'super_admin'],
            ],
            [
                'key' => 'admin.loans',
                'label' => 'Loans',
                'icon' => 'hand-coins',
                'route_name' => 'admin.loans.index',
                'sort_order' => 4,
                'role_access' => ['admin', 'super_admin'],
            ],
            [
                'key' => 'admin.users',
                'label' => 'Users',
                'icon' => 'users',
                'route_name' => 'admin.users.index',
                'sort_order' => 5,
                'role_access' => ['admin', 'super_admin'],
            ],

            // Category: Import external metadata (AniList for manga, RanobeDB for light novels)
            [
                'key' => 'category.anilist',
                'label' => 'Import Data',
                'icon' => 'search',
                'route_name' => null,
                'sort_order' => 6,
                'role_access' => ['admin', 'super_admin'],
            ],
            [
                'key' => 'admin.search-external',
                'label' => 'Search All Sources',
                'icon' => 'search',
                'route_name' => 'admin.search-external.index',
                'parent_key' => 'category.anilist',
                'sort_order' => 1,
                'role_access' => ['admin', 'super_admin'],
            ],
            [
                'key' => 'admin.anilist',
                'label' => 'Search Manga',
                'icon' => 'search',
                'route_name' => 'admin.anilist.index',
                'parent_key' => 'category.anilist',
                'sort_order' => 2,
                'role_access' => ['admin', 'super_admin'],
            ],
            [
                'key' => 'admin.anilist.status',
                'label' => 'AniList Status',
                'icon' => 'activity',
                'route_name' => 'admin.anilist.status.page',
                'parent_key' => 'category.anilist',
                'sort_order' => 3,
                'role_access' => ['admin', 'super_admin'],
            ],
            [
                'key' => 'admin.ranobedb',
                'label' => 'Search Light Novels',
                'icon' => 'search',
                'route_name' => 'admin.ranobedb.index',
                'parent_key' => 'category.anilist',
                'sort_order' => 4,
                'role_access' => ['admin', 'super_admin'],
            ],

            // Category: Others (shared; members differ per role, filtered automatically via each role_access)
            [
                'key' => 'category.lainnya',
                'label' => 'Others',
                'icon' => 'layers',
                'route_name' => null,
                'sort_order' => 7,
                'role_access' => ['user', 'admin', 'super_admin'],
            ],
            [
                'key' => 'admin.menus',
                'label' => 'Menu',
                'icon' => 'menu',
                'route_name' => 'admin.menus.index',
                'parent_key' => 'category.lainnya',
                'sort_order' => 1,
                'role_access' => ['admin', 'super_admin'],
            ],
            [
                'key' => 'admin.menus.user-sidebar',
                'label' => 'User Sidebar',
                'icon' => 'menu',
                'route_name' => 'admin.menus.user-sidebar',
                'parent_key' => 'category.lainnya',
                'sort_order' => 2,
                'role_access' => ['admin', 'super_admin'],
            ],
            [
                'key' => 'admin.announcements',
                'label' => 'Announcements',
                'icon' => 'megaphone',
                'route_name' => 'admin.announcements.index',
                'parent_key' => 'category.lainnya',
                'sort_order' => 3,
                'role_access' => ['admin', 'super_admin'],
            ],
            [
                'key' => 'admin.tickets',
                'label' => 'Tickets',
                'icon' => 'ticket',
                'route_name' => 'admin.tickets.index',
                'parent_key' => 'category.lainnya',
                'sort_order' => 4,
                'role_access' => ['admin', 'super_admin'],
            ],
            [
                'key' => 'admin.settings',
                'label' => 'Settings',
                'icon' => 'settings',
                'route_name' => 'admin.settings.index',
                'parent_key' => 'category.lainnya',
                'sort_order' => 5,
                'role_access' => ['super_admin'],
            ],
            [
                'key' => 'admin.activity-logs',
                'label' => 'Activity Log',
                'icon' => 'activity',
                'route_name' => 'admin.activity-logs.index',
                'parent_key' => 'category.lainnya',
                'sort_order' => 6,
                'role_access' => ['admin', 'super_admin'],
            ],
            [
                'key' => 'admin.funfact-quota',
                'label' => 'Funfact Quota',
                'icon' => 'sparkles',
                'route_name' => 'admin.funfact-quota.index',
                'parent_key' => 'category.lainnya',
                'sort_order' => 7,
                'role_access' => ['admin', 'super_admin'],
            ],

            // User menus: main (top-level, not grouped)
            [
                'key' => 'user.dashboard',
                'label' => 'Dashboard',
                'icon' => 'layout-dashboard',
                'route_name' => 'dashboard',
                'sort_order' => 1,
                'role_access' => ['user'],
            ],
            [
                'key' => 'user.catalog',
                'label' => 'Catalog',
                'icon' => 'book-open',
                'route_name' => 'catalog.index',
                'sort_order' => 2,
                'role_access' => ['user'],
            ],
            [
                'key' => 'user.collection',
                'label' => 'My Collection',
                'icon' => 'library',
                'route_name' => 'collection.index',
                'sort_order' => 3,
                'role_access' => ['user'],
            ],
            [
                'key' => 'user.wishlist',
                'label' => 'Wishlist',
                'icon' => 'heart',
                'route_name' => 'wishlist.index',
                'sort_order' => 4,
                'role_access' => ['user'],
            ],
            [
                'key' => 'user.loans',
                'label' => 'My Loans',
                'icon' => 'hand-coins',
                'route_name' => 'loans.index',
                'sort_order' => 5,
                'role_access' => ['user'],
            ],
            [
                'key' => 'user.directory',
                'label' => 'Find Users',
                'icon' => 'search',
                'route_name' => 'directory.index',
                'sort_order' => 6,
                'role_access' => ['user'],
            ],
            [
                'key' => 'user.tickets',
                'label' => 'Tickets',
                'icon' => 'ticket',
                'route_name' => 'tickets.index',
                'parent_key' => 'category.lainnya',
                'sort_order' => 5,
                'role_access' => ['user'],
            ],

            // Shared: profile (all roles), goes in the "Others" category
            [
                'key' => 'settings',
                'label' => 'Profile',
                'icon' => 'user',
                'route_name' => 'settings.index',
                'parent_key' => 'category.lainnya',
                'sort_order' => 6,
                'role_access' => ['user', 'admin', 'super_admin'],
            ],
        ];

        foreach ($menus as $menu) {
            Menu::updateOrCreate(['key' => $menu['key']], $menu);
        }
    }
}
