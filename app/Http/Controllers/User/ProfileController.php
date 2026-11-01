<?php

namespace App\Http\Controllers\User;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\Collection;
use App\Models\CollectionGroup;
use App\Models\Follow;
use App\Models\Series;
use App\Models\User;
use App\Services\StorageSettingsService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;

class ProfileController extends Controller
{
    public function __construct(private StorageSettingsService $storage) {}

    public function show(Request $request, User $user): Response
    {
        $viewer = $request->user();
        $isOwner = $viewer?->id === $user->id;

        abort_unless($user->is_profile_public || $isOwner, 403, 'This profile is private.');

        $collections = Collection::where('user_id', $user->id)
            ->with('series')
            ->latest()
            ->limit(500)
            ->get()
            ->map(fn ($c) => [
                'series_id' => $c->series_id,
                'series_slug' => $c->series->slug,
                'title_romaji' => $c->series->title_romaji,
                'cover_url' => $this->storage->url($c->series->cover_path),
                'type' => $c->series->type,
                'is_adult' => $c->series->is_adult,
            ]);

        return Inertia::render('User/Profile/Show', [
            'profile_user' => [
                'id' => $user->id,
                'name' => $user->name,
                'username' => $user->username,
                'avatar' => $user->avatar,
            ],
            'is_owner' => $isOwner,
            'is_guest' => $viewer === null,
            'is_following' => ($viewer && ! $isOwner) ? $viewer->isFollowing($user->id) : false,
            'followers_count' => $user->followers()->count(),
            'following_count' => $user->following()->count(),
            'collections_count' => Collection::where('user_id', $user->id)->count(),
            'collections' => $collections->values(),
            'genre_distribution' => $this->genreDistribution($user),
            'format_breakdown' => $this->formatBreakdown($user),
            'public_groups' => $this->publicGroups($user),
        ]);
    }

    /** @return array<int, array{id: string, slug: string, name: string, items_count: int, cover_urls: array<int, string>}> */
    private function publicGroups(User $user): array
    {
        return CollectionGroup::where('user_id', $user->id)
            ->where('is_public', true)
            ->withCount('collections')
            ->with(['collections.series' => fn ($q) => $q->select('id', 'title_romaji', 'cover_path')])
            ->latest()
            ->get()
            ->map(fn ($g) => [
                'id' => $g->id,
                'slug' => $g->slug,
                'name' => $g->name,
                'items_count' => $g->collections_count,
                'cover_urls' => $g->collections
                    ->take(4)
                    ->map(fn ($c) => $this->storage->url($c->series->cover_path))
                    ->filter()
                    ->values(),
            ])
            ->values()
            ->all();
    }

    public function directory(Request $request): Response
    {
        $q = trim((string) $request->get('q', ''));
        $viewer = $request->user();

        $users = collect();

        if ($q) {
            $users = User::query()
                ->where('id', '!=', $viewer->id)
                ->where('is_banned', false)
                ->where('role', 'user')
                ->where(fn ($sub) => $sub->where('username', 'like', "%{$q}%")
                    ->orWhere('name', 'like', "%{$q}%")
                )
                ->limit(20)
                ->get(['id', 'name', 'username', 'avatar', 'is_profile_public'])
                ->map(fn ($u) => [
                    'id' => $u->id,
                    'name' => $u->name,
                    'username' => $u->username,
                    'avatar' => $u->avatar,
                    'is_profile_public' => $u->is_profile_public,
                ]);
        }

        return Inertia::render('User/Directory/Index', [
            'users' => $users->values(),
            'filters' => ['q' => $q],
        ]);
    }

    public function follow(Request $request, User $user): RedirectResponse
    {
        $viewer = $request->user();

        abort_if($viewer->id === $user->id, 403);
        abort_unless($user->is_profile_public, 403);

        Follow::firstOrCreate([
            'follower_id' => $viewer->id,
            'following_id' => $user->id,
        ]);

        ActivityLog::record('profile.follow', "{$viewer->name} followed {$user->name}.", $viewer);

        return redirect()->back()->with('success', __('flash.profile.followed', ['name' => $user->name]));
    }

    public function unfollow(Request $request, User $user): RedirectResponse
    {
        $viewer = $request->user();

        Follow::where('follower_id', $viewer->id)
            ->where('following_id', $user->id)
            ->delete();

        ActivityLog::record('profile.unfollow', "{$viewer->name} unfollowed {$user->name}.", $viewer);

        return redirect()->back()->with('success', __('flash.profile.unfollowed', ['name' => $user->name]));
    }

    /** @return array<string, int> */
    private function formatBreakdown(User $user): array
    {
        return DB::table('collection_volumes')
            ->join('collections', 'collections.id', '=', 'collection_volumes.collection_id')
            ->where('collections.user_id', $user->id)
            ->selectRaw('collection_volumes.format as format, count(*) as total')
            ->groupBy('collection_volumes.format')
            ->pluck('total', 'format')
            ->toArray();
    }

    /** @return array<int, array{genre: string, count: int, percent: float}> */
    private function genreDistribution(User $user): array
    {
        $ownedSeriesIds = Collection::where('user_id', $user->id)->pluck('series_id');

        $counts = Series::whereIn('id', $ownedSeriesIds)
            ->pluck('genres')
            ->flatten()
            ->filter()
            ->countBy();

        $total = $counts->sum();

        if ($total === 0) {
            return [];
        }

        return $counts->sortDesc()->take(20)
            ->map(fn ($count, $genre) => [
                'genre' => $genre,
                'count' => $count,
                'percent' => round($count / $total * 100, 1),
            ])
            ->values()
            ->all();
    }
}
