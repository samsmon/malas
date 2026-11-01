<?php

namespace App\Services;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\RequestException;
use Illuminate\Support\Facades\Http;

class AniListService
{
    private const BASE_URL = 'https://graphql.anilist.co';

    private const MEDIA_FIELDS = <<<'GRAPHQL'
        id
        title { romaji english native }
        format
        status
        countryOfOrigin
        volumes
        averageScore
        description(asHtml: false)
        genres
        isAdult
        coverImage { large }
        startDate { year month day }
        endDate { year month day }
        staff(perPage: 10) {
            edges { role node { name { full } } }
        }
        tags {
            name
            category
            rank
            isMediaSpoiler
        }
    GRAPHQL;

    public function __construct(private StorageSettingsService $storage) {}

    /**
     * @param  array<int, string>  $genres
     */
    public function searchManga(
        string $query,
        int $page = 1,
        bool $excludeAdult = false,
        array $genres = [],
        ?int $year = null,
        string $sort = 'SEARCH_MATCH',
    ): array {
        // Note: `seasonYear` in the AniList schema is an anime airing-season concept and does not apply
        // to manga (it always returns empty). A year filter for manga must use the range
        // `startDate_greater`/`startDate_lesser` (fuzzy date int YYYYMMDD), verified directly
        // against the API before use here.
        $gql = <<<GRAPHQL
            query (\$search: String, \$page: Int, \$isAdult: Boolean, \$genres: [String], \$dateGt: FuzzyDateInt, \$dateLt: FuzzyDateInt, \$sort: [MediaSort]) {
                Page(page: \$page, perPage: 24) {
                    pageInfo { currentPage hasNextPage lastPage }
                    media(search: \$search, type: MANGA, sort: \$sort, isAdult: \$isAdult, genre_in: \$genres, startDate_greater: \$dateGt, startDate_lesser: \$dateLt) {
                        {$this->mediaFields()}
                    }
                }
            }
        GRAPHQL;

        $variables = ['page' => $page, 'sort' => [$sort]];
        if ($query !== '') {
            $variables['search'] = $query;
        }
        if ($excludeAdult) {
            $variables['isAdult'] = false;
        }
        if (! empty($genres)) {
            $variables['genres'] = $genres;
        }
        if ($year) {
            $variables['dateGt'] = $year.'0000';
            $variables['dateLt'] = ($year + 1).'0000';
        }

        $data = $this->request($gql, $variables);

        return [
            'data' => $data['Page']['media'] ?? [],
            'pagination' => $data['Page']['pageInfo'] ?? [],
        ];
    }

    /**
     * Fetch many manga at once in a single GraphQL request (instead of N separate requests).
     * Used for batch import so we do not burn AniList's rate-limit quota (~90 req/min).
     * AniList caps perPage at 50, so callers that ask for more must chunk it themselves.
     *
     * @param  array<int, int>  $anilistIds
     */
    public function getMangaBatch(array $anilistIds): array
    {
        if (empty($anilistIds)) {
            return [];
        }

        $gql = <<<GRAPHQL
            query (\$ids: [Int]) {
                Page(perPage: 50) {
                    media(id_in: \$ids, type: MANGA) {
                        {$this->mediaFields()}
                    }
                }
            }
        GRAPHQL;

        $data = $this->request($gql, ['ids' => array_values($anilistIds)]);

        return $data['Page']['media'] ?? [];
    }

    public function getManga(int $anilistId): array
    {
        $gql = <<<GRAPHQL
            query (\$id: Int) {
                Media(id: \$id, type: MANGA) {
                    {$this->mediaFields()}
                }
            }
        GRAPHQL;

        $data = $this->request($gql, ['id' => $anilistId]);

        if (empty($data['Media'])) {
            throw new \Exception("Manga with AniList ID {$anilistId} not found.");
        }

        return $data['Media'];
    }

    public function ping(): array
    {
        $start = microtime(true);

        try {
            $response = Http::timeout(10)->post(self::BASE_URL, [
                'query' => 'query { Media(id: 1, type: MANGA) { id } }',
            ]);

            return [
                'online' => $response->successful(),
                'duration_ms' => (int) round((microtime(true) - $start) * 1000),
                'status' => $response->status(),
            ];
        } catch (ConnectionException|RequestException $e) {
            return [
                'online' => false,
                'duration_ms' => (int) round((microtime(true) - $start) * 1000),
                'status' => null,
            ];
        }
    }

    private function mediaFields(): string
    {
        return self::MEDIA_FIELDS;
    }

    /**
     * Retry connection errors (timeout/DNS) with a short backoff, but for HTTP 429 specifically wait per the
     * AniList `Retry-After` header (instead of skipping/failing) so large batch imports still
     * finish completely, with no items skipped due to a temporary rate limit.
     */
    private function request(string $query, array $variables = []): array
    {
        $maxAttempts = 6;

        for ($attempt = 1; $attempt <= $maxAttempts; $attempt++) {
            try {
                $response = Http::timeout(15)->post(self::BASE_URL, [
                    'query' => $query,
                    'variables' => $variables,
                ]);
            } catch (ConnectionException) {
                if ($attempt === $maxAttempts) {
                    throw new \Exception('Unable to connect to the AniList API. Check your internet connection.');
                }
                sleep(2);
                continue;
            }

            if ($response->status() === 429) {
                if ($attempt === $maxAttempts) {
                    throw new \Exception('Masih kena rate limit AniList setelah beberapa kali percobaan.');
                }
                $retryAfter = (int) ($response->header('Retry-After') ?: 5);
                sleep(max($retryAfter, 1));
                continue;
            }

            if (! $response->successful()) {
                throw new \Exception($this->friendlyError($response->status()));
            }

            $json = $response->json();

            if (! empty($json['errors'])) {
                $message = $json['errors'][0]['message'] ?? 'Unknown error';
                throw new \Exception("AniList API error: {$message}");
            }

            return $json['data'] ?? [];
        }

        throw new \Exception('Failed to fetch data from AniList after several attempts.');
    }

    private function friendlyError(int $status): string
    {
        return match (true) {
            $status === 404 => 'Data not found on AniList.',
            $status === 429 => 'Too many requests to the AniList API. Wait a few seconds and try again.',
            $status >= 500 => 'AniList is having problems or is unreachable. Try again shortly.',
            default => "AniList API mengembalikan error HTTP {$status}.",
        };
    }

    public function downloadCover(string $url, string $filename): ?string
    {
        try {
            $response = Http::timeout(30)->get($url);

            if (! $response->successful()) {
                return null;
            }

            $extension = pathinfo(parse_url($url, PHP_URL_PATH), PATHINFO_EXTENSION) ?: 'jpg';

            return $this->storage->storeContents('covers', $filename.'.'.$extension, $response->body());
        } catch (ConnectionException) {
            return null;
        }
    }
}
