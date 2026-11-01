<?php

namespace App\Services;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\RequestException;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;

class RanobeDbService
{
    private const BASE_URL = 'https://ranobedb.org/api/v0';

    // RanobeDB has no server-enforced rate limit but asks to stay under 60 req/min.
    private const RATE_LIMIT_MAX = 55;

    private const RATE_LIMIT_WINDOW = 60;

    public function __construct(private StorageSettingsService $storage) {}

    public function searchSeries(string $query, int $page = 1): array
    {
        $data = $this->request('/series', ['q' => $query, 'page' => $page, 'limit' => 24]);

        return [
            'data' => $data['series'] ?? [],
            'pagination' => [
                'currentPage' => $data['currentPage'] ?? 1,
                'totalPages' => $data['totalPages'] ?? 1,
                'count' => (int) ($data['count'] ?? 0),
            ],
        ];
    }

    public function getSeries(int $id): array
    {
        $data = $this->request("/series/{$id}");

        // Response is wrapped in a "series" envelope, same pattern as /book/{id}'s "book" wrapper.
        $series = $data['series'] ?? [];

        if (empty($series)) {
            throw new \Exception("Series with RanobeDB ID {$id} not found.");
        }

        return $series;
    }

    public function ping(): array
    {
        $start = microtime(true);

        try {
            $response = Http::timeout(10)->get(self::BASE_URL.'/tags', ['limit' => 1]);

            return [
                'online' => $response->successful(),
                'duration_ms' => (int) round((microtime(true) - $start) * 1000),
                'status' => $response->status(),
            ];
        } catch (ConnectionException|RequestException) {
            return [
                'online' => false,
                'duration_ms' => (int) round((microtime(true) - $start) * 1000),
                'status' => null,
            ];
        }
    }

    public function downloadCover(string $filename, string $localName): ?string
    {
        try {
            $response = Http::timeout(30)->get("https://images.ranobedb.org/{$filename}");

            if (! $response->successful()) {
                return null;
            }

            $extension = pathinfo($filename, PATHINFO_EXTENSION) ?: 'jpg';

            return $this->storage->storeContents('covers', $localName.'.'.$extension, $response->body());
        } catch (ConnectionException) {
            return null;
        }
    }

    private function request(string $path, array $query = []): array
    {
        $this->throttle();

        try {
            $response = Http::timeout(15)->retry(2, 1000)->get(self::BASE_URL.$path, $query);
        } catch (ConnectionException) {
            throw new \Exception('Unable to connect to the RanobeDB API. Check your internet connection.');
        } catch (RequestException $e) {
            throw new \Exception($this->friendlyError($e->response->status()));
        }

        if (! $response->successful()) {
            throw new \Exception($this->friendlyError($response->status()));
        }

        return $response->json() ?? [];
    }

    /**
     * Self-enforced courtesy throttle — RanobeDB asks for under 60 req/min but
     * doesn't enforce it server-side, so nothing stops us from exceeding it otherwise.
     */
    private function throttle(): void
    {
        $windowKey = 'ranobedb_rl_'.intdiv(time(), self::RATE_LIMIT_WINDOW);
        $count = Cache::get($windowKey, 0);

        if ($count >= self::RATE_LIMIT_MAX) {
            sleep(1);
            $this->throttle();

            return;
        }

        Cache::put($windowKey, $count + 1, self::RATE_LIMIT_WINDOW);
    }

    private function friendlyError(int $status): string
    {
        return match (true) {
            $status === 404 => 'Data not found on RanobeDB.',
            $status === 429 => 'Too many requests to the RanobeDB API. Wait a few seconds and try again.',
            $status >= 500 => 'RanobeDB is having problems or is unreachable. Try again shortly.',
            default => "RanobeDB API mengembalikan error HTTP {$status}.",
        };
    }
}
