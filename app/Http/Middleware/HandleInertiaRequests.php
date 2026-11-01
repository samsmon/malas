<?php

namespace App\Http\Middleware;

use App\Models\Announcement;
use App\Models\Menu;
use App\Models\SiteSetting;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\App;
use Illuminate\Support\Facades\Cache;
use Inertia\Middleware;

class HandleInertiaRequests extends Middleware
{
    protected $rootView = 'app';

    public function version(Request $request): ?string
    {
        return parent::version($request);
    }

    public function share(Request $request): array
    {
        $user = $request->user();
        $menus = [];
        $blurAdultContent = true;
        $linkedAccounts = [];

        if ($user) {
            $menus = Menu::where('is_visible', true)
                ->whereJsonContains('role_access', $user->role)
                ->orderBy('sort_order')
                ->get(['key', 'label', 'icon', 'route_name', 'parent_key', 'sort_order', 'is_maintenance'])
                ->toArray();

            $blurAdultContent = Cache::rememberForever(
                'site_settings.blur_adult_content',
                fn () => SiteSetting::first()?->blur_adult_content ?? true,
            );

            // Multi-account switching: the list of other accounts already linked in this session
            // (not permanent in the DB, see AccountLinkService). Fetched fresh from the DB on every
            // request so the displayed name/avatar is always up to date.
            $linkedIds = collect(session('linked_account_ids', []))
                ->reject(fn ($id) => $id === $user->id)
                ->values();

            if ($linkedIds->isNotEmpty()) {
                $linkedAccounts = User::whereIn('id', $linkedIds)
                    ->get(['id', 'name', 'username', 'avatar', 'role'])
                    ->toArray();
            }
        }

        return [
            ...parent::share($request),
            'flash' => [
                'success' => session('success'),
                'error' => session('error'),
                'info' => session('info'),
                'undo_url' => session('undo_url'),
                'undo_payload' => session('undo_payload'),
            ],
            'auth' => [
                'user' => $user ? [
                    'id' => $user->id,
                    'name' => $user->name,
                    'username' => $user->username,
                    'email' => $user->email,
                    'avatar' => $user->avatar,
                    'role' => $user->role,
                    'is_banned' => $user->is_banned,
                    'ban_reason' => $user->ban_reason,
                    'is_profile_public' => $user->is_profile_public,
                    'theme' => $user->theme,
                ] : null,
            ],
            'menus' => $menus,
            'linked_accounts' => $linkedAccounts,
            'locale' => App::getLocale(),
            'site_settings' => [
                'blur_adult_content' => $blurAdultContent,
            ],
            'announcements' => $user
                ? Announcement::active()
                    ->whereDoesntHave('dismissedByUsers', fn ($q) => $q->where('users.id', $user->id))
                    ->orderBy('created_at', 'desc')
                    ->get(['id', 'title', 'body', 'type'])
                    ->toArray()
                : [],
        ];
    }
}
