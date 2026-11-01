<?php

namespace App\Http\Controllers\User;

use App\Http\Controllers\Controller;
use App\Models\Collection;
use App\Models\Series;
use App\Services\StorageSettingsService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class SeriesController extends Controller
{
    // "Manga group" covers all comic types; light novels stand alone because
    // their genre vocabulary (from RanobeDB) tends to differ from manga (from AniList).
    private const MANGA_TYPES = ['manga', 'one_shot', 'doujinshi', 'other'];

    public function __construct(private StorageSettingsService $storage) {}

    public function index(): Response
    {
        // Check which series are already in the user's collection
        $collectionSeriesIds = auth()->user()
            ->collections()
            ->pluck('series_id')
            ->toArray();

        $series = Series::query()
            ->when(request('search'), fn ($q, $s) => $q->searchTitle($s))
            ->when(request('status'), fn ($q, $s) => $q->where('status', $s))
            ->when(request('type'), fn ($q, $t) => $q->where('type', $t))
            // Multi-select genre: OR-match. A series passes if it has any one of the selected genres,
            // not all of them (so the result does not end up empty when the user picks several genres).
            ->when(array_filter((array) request('genre', [])), fn ($q, $genres) => $q->where(function ($sub) use ($genres) {
                foreach ($genres as $genre) {
                    $sub->orWhereJsonContains('genres', $genre);
                }
            }))
            // Tag filter: exactly the same pattern as the genre above (OR-match), but a separate column
            // (`tags`, not `genres`) because the source differs: AniList genres (flat, ~20 fixed values)
            // vs AniList tags (~470 values, with categories, see AniListController::extractAllTagNames()).
            ->when(array_filter((array) request('tag', [])), fn ($q, $tags) => $q->where(function ($sub) use ($tags) {
                foreach ($tags as $tag) {
                    $sub->orWhereJsonContains('tags', $tag);
                }
            }))
            ->when(request('ownership') === 'owned', fn ($q) => $q->whereIn('id', $collectionSeriesIds))
            ->when(request('ownership') === 'not_owned', fn ($q) => $q->whereNotIn('id', $collectionSeriesIds))
            ->withCount('volumes')
            ->orderBy('title_romaji')
            ->paginate(24)
            ->withQueryString()
            ->through(fn ($s) => [
                'id' => $s->id,
                'slug' => $s->slug,
                'title_romaji' => $s->title_romaji,
                'title_english' => $s->title_english,
                'cover_url' => $this->storage->url($s->cover_path),
                'status' => $s->status,
                'type' => $s->type,
                'total_volumes' => $s->total_volumes,
                'volumes_count' => $s->volumes_count,
                'score' => $s->score,
                'is_adult' => $s->is_adult,
            ]);

        return Inertia::render('User/Catalog/Index', [
            'series' => $series,
            'collectionSeriesIds' => $collectionSeriesIds,
            'genreOptions' => $this->genreOptions(),
            'tagOptions' => $this->tagOptions(),
            'filters' => [
                ...request()->only(['search', 'status', 'type', 'ownership']),
                'genre' => array_values(array_filter((array) request('genre', []))),
                'tag' => array_values(array_filter((array) request('tag', []))),
            ],
        ]);
    }

    /** @return array{manga: array<int, string>, novel: array<int, string>} */
    private function genreOptions(): array
    {
        $flatten = fn ($type) => Series::query()
            ->when($type === 'novel', fn ($q) => $q->where('type', 'novel'))
            ->when($type === 'manga', fn ($q) => $q->whereIn('type', self::MANGA_TYPES))
            ->whereNotNull('genres')
            ->pluck('genres')
            ->flatten()
            ->filter()
            ->unique()
            ->sort()
            ->values();

        return [
            'manga' => $flatten('manga'),
            'novel' => $flatten('novel'),
        ];
    }

    /**
     * Group the tags actually used in the catalog by AniList category (e.g. "Theme"),
     * for the tag filter tree in Catalog/Index.tsx. The raw AniList category (e.g. "Theme-Reincarnation")
     * is simplified to the part before the first hyphen ("Theme") so the tree is not too
     * deep. The sub-category detail is still readable from the tag name itself.
     *
     * @return array<string, array<int, string>> category => list of tag names, sorted
     */
    private function tagOptions(): array
    {
        $grouped = [];

        Series::query()
            ->whereNotNull('tag_categories')
            ->pluck('tag_categories')
            ->each(function (array $map) use (&$grouped) {
                foreach ($map as $tagName => $category) {
                    $bucket = explode('-', (string) $category, 2)[0] ?: 'Lainnya';
                    $grouped[$bucket][$tagName] = true;
                }
            });

        ksort($grouped);

        return array_map(
            fn ($tags) => collect(array_keys($tags))->sort()->values()->all(),
            $grouped,
        );
    }

    public function search(Request $request): JsonResponse
    {
        $q = trim((string) $request->get('q', ''));

        $series = Series::when($q, fn ($query) => $query->searchTitle($q))
            ->latest()
            ->limit(24)
            ->get(['id', 'slug', 'title_romaji', 'title_english', 'cover_path', 'type', 'status', 'is_adult'])
            ->map(fn ($s) => [
                'id' => $s->id,
                'slug' => $s->slug,
                'title_romaji' => $s->title_romaji,
                'title_english' => $s->title_english,
                'cover_url' => $this->storage->url($s->cover_path),
                'type' => $s->type,
                'status' => $s->status,
                'is_adult' => $s->is_adult,
            ]);

        $collectionSeriesIds = auth()->user()->collections()->pluck('series_id')->toArray();

        return response()->json([
            'results' => $series->toArray(),
            'collection_series_ids' => $collectionSeriesIds,
        ]);
    }

    public function show(Series $series): Response
    {
        // "Similar Series" recommendations, replacing the removed volume list section (this app
        // only tracks reading progress & ownership, it is not a per-volume gallery). Priority:
        // OR-match on shared genres (so it does not end up empty when genres are many/specific),
        // fall back to the same type only if this series has no genres at all.
        $similarSeries = Series::query()
            ->where('id', '!=', $series->id)
            ->where(function ($q) use ($series) {
                if (! empty($series->genres)) {
                    foreach ($series->genres as $genre) {
                        $q->orWhereJsonContains('genres', $genre);
                    }
                } else {
                    $q->where('type', $series->type);
                }
            })
            ->inRandomOrder()
            ->limit(12)
            ->get(['id', 'slug', 'title_romaji', 'title_english', 'cover_path', 'type', 'status', 'total_volumes', 'score', 'is_adult'])
            ->map(fn ($s) => [
                'id' => $s->id,
                'slug' => $s->slug,
                'title_romaji' => $s->title_romaji,
                'title_english' => $s->title_english,
                'cover_url' => $this->storage->url($s->cover_path),
                'type' => $s->type,
                'status' => $s->status,
                'total_volumes' => $s->total_volumes,
                'score' => $s->score,
                'is_adult' => $s->is_adult,
            ]);

        $collection = auth()->user()
            ->collections()
            ->where('series_id', $series->id)
            ->first();

        $wishlistItem = auth()->user()
            ->wishlistItems()
            ->where('series_id', $series->id)
            ->first();

        $collectorsCount = Collection::where('series_id', $series->id)->count();
        $collectors = Collection::where('series_id', $series->id)
            ->with('user:id,username,avatar')
            ->limit(8)
            ->get()
            ->pluck('user')
            ->filter()
            ->map(fn ($u) => ['id' => $u->id, 'username' => $u->username, 'avatar' => $u->avatar])
            ->values();

        return Inertia::render('User/Catalog/Show', [
            'series' => [
                ...$series->only([
                    'id', 'slug', 'anilist_id', 'title_romaji', 'title_english', 'title_japanese',
                    'synopsis', 'status', 'type', 'total_volumes', 'score', 'rank',
                    'genres', 'authors', 'themes', 'demographics', 'is_adult',
                ]),
                'published_from' => $series->published_from?->toDateString(),
                'published_to' => $series->published_to?->toDateString(),
                'cover_url' => $this->storage->url($series->cover_path),
            ],
            'similar_series' => $similarSeries,
            'media' => $series->media->map(fn ($m) => [
                'id' => $m->id,
                'image_url' => $this->storage->url($m->image_path),
                'caption' => $m->caption,
            ]),
            'collection' => $collection ? ['id' => $collection->id] : null,
            'wishlist_item' => $wishlistItem ? ['id' => $wishlistItem->id] : null,
            'collectors' => [
                'avatars' => $collectors,
                'count' => $collectorsCount,
            ],
        ]);
    }
}
