<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\Series;
use App\Services\AniListService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class AniListController extends Controller
{
    public function __construct(private AniListService $anilist) {}

    public function index(Request $request): Response
    {
        $this->authorize('create', Series::class);

        $results = [];
        $pagination = [];
        $error = null;
        $hideAdult = $request->boolean('hide_adult', true);

        $type = $request->get('type');
        $q = trim((string) $request->get('q', ''));
        $genre = $request->get('genre');
        $year = $request->get('year') ? (int) $request->get('year') : null;
        $sortByPopularity = $request->boolean('sort_popularity');

        // Browsing by genre/year alone, without typing a title, is allowed. Hence the condition is
        // "has a query OR has a genre/year filter", not just "has a query" as before.
        if ($q !== '' || $genre || $year) {
            try {
                $raw = $this->anilist->searchManga(
                    $q,
                    (int) $request->get('page', 1),
                    $hideAdult,
                    $genre ? [$genre] : [],
                    $year,
                    $sortByPopularity ? 'POPULARITY_DESC' : ($q !== '' ? 'SEARCH_MATCH' : 'POPULARITY_DESC'),
                );
                $results = $this->filterByType($this->formatResults($raw['data']), $type);
                $pagination = $raw['pagination'];
            } catch (\Exception $e) {
                $error = $e->getMessage();
            }
        }

        return Inertia::render('Admin/AniList/Index', [
            'results' => $results,
            'pagination' => $pagination,
            'filters' => [
                'q' => $request->get('q', ''),
                'hide_adult' => $hideAdult,
                'type' => $type,
                'genre' => $genre,
                'year' => $year,
                'sort_popularity' => $sortByPopularity,
            ],
            'error' => $error,
        ]);
    }

    /**
     * Post-filter by our internal type — AniList's GraphQL query can't cleanly express
     * "other" (KR/CN/TW manga inferred from countryOfOrigin, not a real format enum),
     * so filtering happens here instead of as a query variable.
     *
     * @param  array<int, array<string, mixed>>  $results
     * @return array<int, array<string, mixed>>
     */
    private function filterByType(array $results, ?string $type): array
    {
        if (! $type) {
            return $results;
        }

        return array_values(array_filter($results, fn ($r) => $r['type'] === $type));
    }

    public function searchJson(Request $request): JsonResponse
    {
        $this->authorize('create', Series::class);

        $q = trim((string) $request->get('q', ''));

        if (! $q) {
            return response()->json(['results' => [], 'error' => null]);
        }

        try {
            $raw = $this->anilist->searchManga($q, 1);

            return response()->json([
                'results' => $this->formatResults($raw['data']),
                'error' => null,
            ]);
        } catch (\Exception $e) {
            return response()->json(['results' => [], 'error' => $e->getMessage()]);
        }
    }

    public function statusPage(): Response
    {
        $this->authorize('create', Series::class);

        $recentImports = Series::whereNotNull('anilist_id')
            ->latest('updated_at')
            ->limit(20)
            ->get(['id', 'slug', 'title_romaji', 'anilist_id', 'updated_at'])
            ->map(fn ($s) => [
                'id' => $s->id,
                'slug' => $s->slug,
                'title_romaji' => $s->title_romaji,
                'anilist_id' => $s->anilist_id,
                'updated_at' => $s->updated_at->toIso8601String(),
            ]);

        return Inertia::render('Admin/AniList/Status', [
            'recentImports' => $recentImports,
        ]);
    }

    public function statusCheck(): JsonResponse
    {
        $this->authorize('create', Series::class);

        return response()->json($this->anilist->ping());
    }

    public function import(Request $request): RedirectResponse
    {
        $this->authorize('create', Series::class);

        $request->validate([
            'anilist_id' => ['required', 'integer', 'min:1'],
            'title' => ['nullable', 'string', 'max:500'],
            'title_english' => ['nullable', 'string', 'max:500'],
            'cover_url' => ['nullable', 'url'],
            'type' => ['nullable', 'string'],
            'status' => ['nullable', 'string'],
            'volumes' => ['nullable', 'integer'],
            'score' => ['nullable', 'numeric'],
            'synopsis' => ['nullable', 'string'],
            'published_from' => ['nullable', 'string'],
            'is_adult' => ['nullable', 'boolean'],
        ]);

        $anilistId = (int) $request->anilist_id;

        $coverUrl = null;
        $fromCache = false;

        try {
            $data = $this->anilist->getManga($anilistId);
            $attributes = $this->mapToSeries($data);
            $coverUrl = $data['coverImage']['large'] ?? null;
        } catch (\Exception $e) {
            if (! $request->filled('title')) {
                return redirect()->back()->with('error', $e->getMessage());
            }
            $attributes = $this->mapFromRequest($request);
            $coverUrl = $request->cover_url;
            $fromCache = true;
        }

        [$series, $wasNew] = $this->createOrUpdateSeries($anilistId, $attributes, $coverUrl);

        $message = $wasNew
            ? ($fromCache
                ? __('flash.anilist.imported_from_cache')
                : __('flash.anilist.imported'))
            : __('flash.anilist.updated');

        $generated = $this->generateVolumesIfFinished($series);
        if ($generated > 0) {
            $message .= __('flash.volumes_generated_suffix', ['count' => $generated]);
        }

        return redirect()->back()->with('success', $message);
    }

    /**
     * Import many series at once from search results: one GraphQL request (getMangaBatch)
     * instead of N separate requests per series, to avoid wasting the AniList rate-limit quota.
     */
    public function bulkImport(Request $request): RedirectResponse
    {
        $this->authorize('create', Series::class);

        $request->validate([
            'anilist_ids' => ['required', 'array', 'min:1', 'max:50'],
            'anilist_ids.*' => ['integer', 'min:1'],
        ]);

        $ids = array_map('intval', $request->anilist_ids);
        $items = $this->anilist->getMangaBatch($ids);

        $importedCount = 0;
        $updatedCount = 0;
        $failedCount = 0;

        foreach ($items as $data) {
            try {
                $attributes = $this->mapToSeries($data);
                $coverUrl = $data['coverImage']['large'] ?? null;
                [, $wasNew] = $this->createOrUpdateSeries((int) $data['id'], $attributes, $coverUrl);
                $wasNew ? $importedCount++ : $updatedCount++;
            } catch (\Throwable $e) {
                report($e);
                $failedCount++;
            }
        }

        $failedCount += count(array_diff($ids, array_column($items, 'id')));

        ActivityLog::record(
            'series.anilist_bulk_import',
            auth()->user()->name." bulk import from AniList: {$importedCount} new, {$updatedCount} updated".
                ($failedCount > 0 ? ", {$failedCount} failed" : '').'.',
        );

        $message = $failedCount > 0
            ? __('flash.anilist.bulk_result_with_failed', ['imported' => $importedCount, 'updated' => $updatedCount, 'failed' => $failedCount])
            : __('flash.anilist.bulk_result', ['imported' => $importedCount, 'updated' => $updatedCount]);

        return redirect()->back()->with($failedCount > 0 && $importedCount === 0 && $updatedCount === 0 ? 'error' : 'success', $message);
    }

    /** @return array{0: Series, 1: bool} [series, wasNew] */
    private function createOrUpdateSeries(int $anilistId, array $attributes, ?string $coverUrl): array
    {
        $existing = Series::where('anilist_id', $anilistId)->first();

        if ($existing) {
            // cover_path is deliberately absent from $attributes (see mapToSeries): the old cover
            // is kept and never overwritten automatically by re-import/sync.
            $existing->update($attributes);

            return [$existing, false];
        }

        if ($coverUrl) {
            $attributes['cover_path'] = $this->anilist->downloadCover($coverUrl, 'anilist_'.$anilistId);
        }

        return [Series::create($attributes), true];
    }

    private function mapFromRequest(Request $request): array
    {
        return [
            'anilist_id' => $request->anilist_id,
            'title_romaji' => $request->title ?? '',
            'title_english' => $request->title_english ?: null,
            'title_japanese' => null,
            'synopsis' => $request->synopsis ?: null,
            'status' => $request->status ?: 'publishing',
            'type' => $request->type ?: 'manga',
            'published_from' => $request->published_from ?: null,
            'published_to' => null,
            'total_volumes' => $request->volumes ? (int) $request->volumes : null,
            'score' => $request->score ? (float) $request->score : null,
            'is_adult' => $request->boolean('is_adult'),
        ];
    }

    private function mapToSeries(array $data): array
    {
        $tags = $data['tags'] ?? [];

        return [
            'anilist_id' => $data['id'],
            'title_romaji' => $data['title']['romaji'] ?? '',
            'title_english' => $data['title']['english'] ?: null,
            'title_japanese' => $data['title']['native'] ?: null,
            'synopsis' => $this->cleanDescription($data['description'] ?? null),
            'status' => $this->mapStatus($data['status'] ?? ''),
            'type' => $this->mapType($data['format'] ?? '', $data['countryOfOrigin'] ?? null),
            'published_from' => $this->buildDate($data['startDate'] ?? null),
            'published_to' => $this->buildDate($data['endDate'] ?? null),
            'total_volumes' => $data['volumes'] ?: null,
            'score' => isset($data['averageScore']) ? round($data['averageScore'] / 10, 2) : null,
            'genres' => $data['genres'] ?? [],
            'authors' => $this->extractAuthors($data['staff']['edges'] ?? []),
            'themes' => $this->extractTags($tags, 'Theme-', 8),
            'demographics' => $this->extractTags($tags, 'Demographic', 5),
            'tags' => $this->extractAllTagNames($tags),
            'tag_categories' => $this->extractTagCategoryMap($tags),
            'is_adult' => $data['isAdult'] ?? false,
        ];
    }

    /**
     * All non-spoiler AniList tag names, filtered to a minimum rank of 60 (AniList relevance scale
     * 0-100) so barely relevant tags do not pile up in the catalog filter. Used
     * for the tag filter (whereJsonContains), hence a flat array of name strings, the same pattern
     * as `genres`.
     */
    private function extractAllTagNames(array $tags): array
    {
        return array_values(array_unique(array_column($this->relevantTags($tags), 'name')));
    }

    /**
     * Map of tag name -> AniList category (e.g. "Isekai" -> "Theme-Reincarnation"), for the tags
     * returned by `extractAllTagNames()`. Only used to group tags into a
     * tree in the filter UI (see `SeriesController::tagOptions()`), not for queries.
     */
    private function extractTagCategoryMap(array $tags): array
    {
        $map = [];
        foreach ($this->relevantTags($tags) as $tag) {
            $map[$tag['name']] = $tag['category'] ?? 'Lainnya';
        }

        return $map;
    }

    /** @return array<int, array{name: string, category: ?string}> */
    private function relevantTags(array $tags): array
    {
        return array_values(array_filter($tags, fn ($t) => ! ($t['isMediaSpoiler'] ?? false)
            && ($t['rank'] ?? 0) >= 60
        ));
    }

    private function extractAuthors(array $staffEdges): array
    {
        $authors = [];

        foreach ($staffEdges as $edge) {
            $role = strtolower($edge['role'] ?? '');

            if (str_contains($role, 'assistant')) {
                continue;
            }

            if (str_contains($role, 'story') || str_contains($role, 'art')) {
                $name = $edge['node']['name']['full'] ?? null;
                if ($name) {
                    $authors[] = $name;
                }
            }
        }

        return array_values(array_unique($authors));
    }

    private function extractTags(array $tags, string $categoryPrefix, int $limit): array
    {
        $filtered = array_values(array_filter($tags, fn ($t) => ! ($t['isMediaSpoiler'] ?? false)
            && str_starts_with($t['category'] ?? '', $categoryPrefix)
        ));

        usort($filtered, fn ($a, $b) => ($b['rank'] ?? 0) <=> ($a['rank'] ?? 0));

        return array_slice(array_column($filtered, 'name'), 0, $limit);
    }

    private function buildDate(?array $date): ?string
    {
        if (empty($date['year'])) {
            return null;
        }

        $month = str_pad((string) ($date['month'] ?? 1), 2, '0', STR_PAD_LEFT);
        $day = str_pad((string) ($date['day'] ?? 1), 2, '0', STR_PAD_LEFT);

        return "{$date['year']}-{$month}-{$day}";
    }

    private function cleanDescription(?string $description): ?string
    {
        if (! $description) {
            return null;
        }

        $text = str_ireplace(['<br>', '<br/>', '<br />'], "\n", $description);
        $text = strip_tags($text);

        return trim($text) ?: null;
    }

    private function generateVolumesIfFinished(Series $series): int
    {
        if ($series->status !== 'finished' || ! $series->total_volumes) {
            return 0;
        }

        $existing = $series->volumes()->pluck('volume_number')->all();
        $created = 0;

        for ($i = 1; $i <= $series->total_volumes; $i++) {
            if (! in_array($i, $existing)) {
                $series->volumes()->create(['volume_number' => $i, 'type' => 'regular']);
                $created++;
            }
        }

        return $created;
    }

    private function mapStatus(string $status): string
    {
        return match ($status) {
            'RELEASING' => 'publishing',
            'FINISHED' => 'finished',
            'HIATUS' => 'on_hiatus',
            'CANCELLED' => 'discontinued',
            'NOT_YET_RELEASED' => 'not_yet_published',
            default => 'publishing',
        };
    }

    private function mapType(string $format, ?string $countryOfOrigin): string
    {
        return match (true) {
            $format === 'NOVEL' => 'novel',
            $format === 'ONE_SHOT' => 'one_shot',
            in_array($countryOfOrigin, ['KR', 'CN', 'TW'], true) => 'other',
            default => 'manga',
        };
    }

    /**
     * @param  array<int, array<string, mixed>>  $data
     *
     * Genres/authors/themes/demographics are included here (not only on full import) so that
     * the "Sync AniList" popover on the Edit Series page can fill the genre/tag fields directly from the
     * search results. Previously these fields never reached the form, so sync looked like it "added nothing"
     * for genre/tag even though AniList actually had the data.
     */
    private function formatResults(array $data): array
    {
        $anilistIds = array_column($data, 'id');
        $imported = Series::whereIn('anilist_id', $anilistIds)->get(['id', 'slug', 'anilist_id'])->keyBy('anilist_id');

        return array_map(fn ($item) => [
            'anilist_id' => $item['id'],
            'title' => $item['title']['romaji'] ?? '',
            'title_english' => $item['title']['english'] ?? null,
            'cover_url' => $item['coverImage']['large'] ?? null,
            'type' => $this->mapType($item['format'] ?? '', $item['countryOfOrigin'] ?? null),
            'status' => $this->mapStatus($item['status'] ?? ''),
            'volumes' => $item['volumes'] ?? null,
            'score' => isset($item['averageScore']) ? round($item['averageScore'] / 10, 2) : null,
            'synopsis' => $this->cleanDescription($item['description'] ?? null),
            'published_from' => $this->buildDate($item['startDate'] ?? null),
            'genres' => $item['genres'] ?? [],
            'authors' => $this->extractAuthors($item['staff']['edges'] ?? []),
            'themes' => $this->extractTags($item['tags'] ?? [], 'Theme-', 8),
            'demographics' => $this->extractTags($item['tags'] ?? [], 'Demographic', 5),
            'already_imported' => isset($imported[$item['id']]),
            'series_id' => $imported[$item['id']]->id ?? null,
            'series_slug' => $imported[$item['id']]->slug ?? null,
            'is_adult' => $item['isAdult'] ?? false,
        ], $data);
    }
}
