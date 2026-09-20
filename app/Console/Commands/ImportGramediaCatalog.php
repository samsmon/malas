<?php

namespace App\Console\Commands;

use App\Models\ActivityLog;
use App\Models\Series;
use App\Models\User;
use App\Services\AniListService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;

class ImportGramediaCatalog extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'malas:import-gramedia
        {--dry-run : Jalankan simulasi tanpa menyimpan perubahan ke database atau mendownload cover}
        {--limit= : Batasi jumlah judul yang diproses (opsional, cocok buat testing 3-8 item)}
        {--skip-existing : Lewati jika series dengan anilist_id sudah ada di DB (default: true)}
        {--force-update : Timpa/perbarui metadata jika series sudah ada di DB}
        {--file= : Path ke file katalog JSON (default: database/data/gramedia_catalog.json)}';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Import katalog manga & light novel Gramedia ke database Malas via AniList API secara aman.';

    public function __construct(private AniListService $anilist)
    {
        parent::__construct();
    }

    public function handle(): int
    {
        $dryRun = (bool) $this->option('dry-run');
        $limit = $this->option('limit') ? (int) $this->option('limit') : null;
        $forceUpdate = (bool) $this->option('force-update');
        $catalogPath = (string) ($this->option('file') ?: database_path('data/gramedia_catalog.json'));

        if (! File::exists($catalogPath)) {
            $this->error("File katalog tidak ditemukan di: {$catalogPath}");

            return self::FAILURE;
        }

        $rawJson = File::get($catalogPath);
        $catalog = json_decode($rawJson, true);

        if (! is_array($catalog)) {
            $this->error('File JSON katalog tidak valid atau kosong.');

            return self::FAILURE;
        }

        // Ambil hanya item yang punya AniList ID valid
        $itemsWithAnilist = array_values(array_filter($catalog, fn ($i) => ! empty($i['anilist_id'])));

        if ($limit && $limit > 0) {
            $itemsWithAnilist = array_slice($itemsWithAnilist, 0, $limit);
        }

        $totalItems = count($itemsWithAnilist);

        $this->info('=====================================================');
        $this->info('  MALAS: Import Katalog Gramedia ke Database');
        $this->info('=====================================================');
        $this->line("Mode       : " . ($dryRun ? '<fg=yellow;options=bold>DRY-RUN (Simulasi - Database Aman Tanpa Write)</>' : '<fg=green;options=bold>LIVE (Tulis ke Database)</>'));
        $this->line("Target     : {$totalItems} judul");
        $this->line("Source     : {$catalogPath}");
        $this->newLine();

        if ($totalItems === 0) {
            $this->warn('Tidak ada judul dengan AniList ID yang siap diproses.');

            return self::SUCCESS;
        }

        $importedCount = 0;
        $updatedCount = 0;
        $skippedCount = 0;
        $failedCount = 0;

        $bar = $this->output->createProgressBar($totalItems);
        $bar->start();

        // Batch processing 25 item per chunk agar tidak boros request GraphQL
        $chunks = array_chunk($itemsWithAnilist, 25);

        foreach ($chunks as $chunk) {
            $anilistIds = array_map(fn ($c) => (int) $c['anilist_id'], $chunk);

            // Cek existing di database
            $existingMap = Series::whereIn('anilist_id', $anilistIds)->get()->keyBy('anilist_id');

            // Ambil metadata dari AniList
            $mediaBatch = [];
            try {
                $mediaBatch = $this->anilist->getMangaBatch($anilistIds);
            } catch (\Throwable $e) {
                $this->newLine();
                $this->error("Gagal mengambil batch metadata AniList: {$e->getMessage()}");
            }

            $mediaMap = collect($mediaBatch)->keyBy('id');

            foreach ($chunk as $item) {
                $anilistId = (int) $item['anilist_id'];
                $gramediaTitle = $item['pretty_title'] ?? 'Unknown';
                $existing = $existingMap->get($anilistId);

                // Jika sudah ada dan tidak diforce update, skip
                if ($existing && ! $forceUpdate) {
                    $skippedCount++;
                    $bar->advance();
                    continue;
                }

                $anilistData = $mediaMap->get($anilistId);

                if (! $anilistData) {
                    $failedCount++;
                    $bar->advance();
                    continue;
                }

                $attributes = $this->mapToSeries($anilistData);
                $coverUrl = $anilistData['coverImage']['large'] ?? null;

                if ($dryRun) {
                    // Hanya simulasi
                    if ($existing) {
                        $updatedCount++;
                    } else {
                        $importedCount++;
                    }
                } else {
                    try {
                        DB::transaction(function () use ($existing, $attributes, $coverUrl, $anilistId, &$importedCount, &$updatedCount) {
                            if ($existing) {
                                $existing->update($attributes);
                                $updatedCount++;
                            } else {
                                if ($coverUrl) {
                                    $attributes['cover_path'] = $this->anilist->downloadCover($coverUrl, 'anilist_'.$anilistId);
                                }
                                Series::create($attributes);
                                $importedCount++;
                            }
                        });
                    } catch (\Throwable $e) {
                        report($e);
                        $failedCount++;
                    }
                }

                $bar->advance();
            }

            // Delay 1 detik antar chunk batch agar tidak terkena rate limit
            usleep(1000000);
        }

        $bar->finish();
        $this->newLine(2);

        // Summary Table
        $this->table(
            ['Metrik', 'Jumlah'],
            [
                ['Total Target Diproses', $totalItems],
                ['Baru Ditambahkan', $importedCount],
                ['Diperbarui (Force Update)', $updatedCount],
                ['Dilewati (Sudah Ada di Database)', $skippedCount],
                ['Gagal / Tidak Ditemukan', $failedCount],
            ]
        );

        if (! $dryRun && ($importedCount > 0 || $updatedCount > 0)) {
            $adminUser = auth()->user() ?? User::where('role', 'superadmin')->orWhere('role', 'admin')->first() ?? User::first();
            if ($adminUser) {
                ActivityLog::record(
                    'series.gramedia_import',
                    "Import katalog Gramedia: {$importedCount} baru, {$updatedCount} diperbarui.",
                    $adminUser
                );
            }
            $this->info("Import berhasil disimpan ke database!");
        } elseif ($dryRun) {
            $this->comment("Simulasi selesai. Tidak ada data yang diubah di database.");
        }

        return self::SUCCESS;
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

    private function extractAllTagNames(array $tags): array
    {
        return array_values(array_unique(array_column($this->relevantTags($tags), 'name')));
    }

    private function extractTagCategoryMap(array $tags): array
    {
        $map = [];
        foreach ($this->relevantTags($tags) as $tag) {
            $map[$tag['name']] = $tag['category'] ?? 'Lainnya';
        }

        return $map;
    }

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
}
