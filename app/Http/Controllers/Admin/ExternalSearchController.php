<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Series;
use App\Services\AniListService;
use App\Services\RanobeDbService;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class ExternalSearchController extends Controller
{
    // Same as AniListController::mapType(), duplicated (not extracted into a shared
    // helper) so the existing AniList/RanobeDB source controllers do not need to change.
    private const MANGA_FORMAT_MAP = [
        'NOVEL' => 'novel',
        'ONE_SHOT' => 'one_shot',
    ];

    public function __construct(
        private AniListService $anilist,
        private RanobeDbService $ranobedb,
    ) {}

    public function index(Request $request): Response
    {
        $this->authorize('create', Series::class);

        $results = [];
        $errors = [];
        $q = trim((string) $request->get('q', ''));
        $hideAdult = $request->boolean('hide_adult', true);
        $type = $request->get('type');

        if ($q) {
            try {
                $raw = $this->anilist->searchManga($q, 1, $hideAdult);
                $results = array_merge($results, $this->formatAniListResults($raw['data']));
            } catch (\Exception $e) {
                $errors['anilist'] = $e->getMessage();
            }

            try {
                $raw = $this->ranobedb->searchSeries($q, 1);
                $results = array_merge($results, $this->formatRanobeDbResults($raw['data']));
            } catch (\Exception $e) {
                $errors['ranobedb'] = $e->getMessage();
            }

            if ($type) {
                $results = array_values(array_filter($results, fn ($r) => $r['type'] === $type));
            }
        }

        return Inertia::render('Admin/Search/Index', [
            'results' => $results,
            'filters' => ['q' => $q, 'hide_adult' => $hideAdult, 'type' => $type],
            'errors' => $errors,
        ]);
    }

    /** @param array<int, array<string, mixed>> $data */
    private function formatAniListResults(array $data): array
    {
        $anilistIds = array_column($data, 'id');
        $imported = Series::whereIn('anilist_id', $anilistIds)->get(['id', 'slug', 'anilist_id'])->keyBy('anilist_id');

        return array_map(fn ($item) => [
            'source' => 'anilist',
            'source_label' => 'AniList',
            'external_id' => $item['id'],
            'title' => $item['title']['romaji'] ?? '',
            'title_secondary' => $item['title']['english'] ?? null,
            'cover_url' => $item['coverImage']['large'] ?? null,
            'type' => $this->mapAniListType($item['format'] ?? '', $item['countryOfOrigin'] ?? null),
            'volumes' => $item['volumes'] ?? null,
            'score' => isset($item['averageScore']) ? round($item['averageScore'] / 10, 2) : null,
            'synopsis' => $this->cleanDescription($item['description'] ?? null),
            'published_from' => $this->buildAniListDate($item['startDate'] ?? null),
            'is_adult' => $item['isAdult'] ?? false,
            'already_imported' => isset($imported[$item['id']]),
            'series_id' => $imported[$item['id']]->id ?? null,
            'series_slug' => $imported[$item['id']]->slug ?? null,
        ], $data);
    }

    /** @param array<int, array<string, mixed>> $data */
    private function formatRanobeDbResults(array $data): array
    {
        $ranobedbIds = array_column($data, 'id');
        $imported = Series::whereIn('ranobedb_id', $ranobedbIds)->get(['id', 'slug', 'ranobedb_id'])->keyBy('ranobedb_id');

        return array_map(fn ($item) => [
            'source' => 'ranobedb',
            'source_label' => 'RanobeDB',
            'external_id' => $item['id'],
            'title' => $this->pickRanobeDbTitle($item),
            'title_secondary' => $item['title'] ?? null,
            'cover_url' => isset($item['book']['image']['filename'])
                ? "https://images.ranobedb.org/{$item['book']['image']['filename']}"
                : null,
            'type' => 'novel',
            'volumes' => $item['c_num_books'] ?? null,
            'score' => null,
            'synopsis' => null,
            'published_from' => null,
            'is_adult' => false,
            'already_imported' => isset($imported[$item['id']]),
            'series_id' => $imported[$item['id']]->id ?? null,
            'series_slug' => $imported[$item['id']]->slug ?? null,
        ], $data);
    }

    private function pickRanobeDbTitle(array $item): string
    {
        foreach (['romaji_orig', 'romaji', 'title_orig', 'title'] as $key) {
            if (! empty($item[$key])) {
                return $item[$key];
            }
        }

        return '';
    }

    private function mapAniListType(string $format, ?string $countryOfOrigin): string
    {
        return match (true) {
            isset(self::MANGA_FORMAT_MAP[$format]) => self::MANGA_FORMAT_MAP[$format],
            in_array($countryOfOrigin, ['KR', 'CN', 'TW'], true) => 'other',
            default => 'manga',
        };
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

    private function buildAniListDate(?array $date): ?string
    {
        if (empty($date['year'])) {
            return null;
        }

        $month = str_pad((string) ($date['month'] ?? 1), 2, '0', STR_PAD_LEFT);
        $day = str_pad((string) ($date['day'] ?? 1), 2, '0', STR_PAD_LEFT);

        return "{$date['year']}-{$month}-{$day}";
    }
}
