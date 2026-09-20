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
        // Catatan: `seasonYear` di skema AniList itu konsep musim tayang anime, tidak berlaku
        // buat manga (selalu balikin kosong). Filter tahun untuk manga harus lewat rentang
        // `startDate_greater`/`startDate_lesser` (fuzzy date int YYYYMMDD) — diverifikasi langsung
        // ke API sebelum dipakai di sini.
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
     * Ambil banyak manga sekaligus dalam satu request GraphQL (bukan N request terpisah) —
     * dipakai buat batch import supaya nggak boros kuota rate-limit AniList (~90 req/menit).
     * AniList membatasi perPage maksimal 50, jadi caller yang minta lebih banyak harus chunk sendiri.
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
            throw new \Exception("Manga dengan AniList ID {$anilistId} tidak ditemukan.");
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
     * Retry koneksi (timeout/DNS) pakai backoff singkat, tapi khusus HTTP 429 nunggu sesuai
     * header `Retry-After` dari AniList (bukan skip/gagal) — biar batch import besar tetap
     * tuntas semua tanpa ada item yang ke-skip gara-gara rate limit sementara.
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
                    throw new \Exception('Tidak dapat terhubung ke AniList API. Periksa koneksi internet.');
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

        throw new \Exception('Gagal mengambil data dari AniList setelah beberapa kali percobaan.');
    }

    private function friendlyError(int $status): string
    {
        return match (true) {
            $status === 404 => 'Data tidak ditemukan di AniList.',
            $status === 429 => 'Terlalu banyak request ke AniList API. Tunggu beberapa detik lalu coba lagi.',
            $status >= 500 => 'AniList sedang bermasalah atau tidak dapat diakses. Coba lagi beberapa saat.',
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
