<?php

namespace App\Jobs;

use App\Models\Series;
use App\Models\SeriesMedia;
use App\Models\StorageSetting;
use App\Services\StorageSettingsService;
use Illuminate\Contracts\Filesystem\Filesystem;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Storage;

class MigrateStorageFilesJob implements ShouldQueue
{
    use Queueable;

    /** @param array{driver: string, access_key_id: ?string, secret_access_key: ?string, bucket: ?string, endpoint: ?string, region: ?string, url: ?string} $oldConfig */
    public function __construct(private array $oldConfig) {}

    public function handle(StorageSettingsService $storage): void
    {
        $setting = StorageSetting::first();

        if (! $setting) {
            return;
        }

        $setting->update(['migration_status' => 'running', 'migration_message' => null]);

        try {
            $oldDisk = $this->buildDisk($storage, $this->oldConfig);
            $newDisk = $storage->disk();

            $paths = Series::whereNotNull('cover_path')->pluck('cover_path')
                ->merge(SeriesMedia::pluck('image_path'))
                ->unique()
                ->values();

            $migrated = 0;
            $skipped = 0;
            $failed = 0;

            foreach ($paths as $path) {
                try {
                    if (! $oldDisk->exists($path)) {
                        $skipped++;

                        continue;
                    }
                    $newDisk->put($path, $oldDisk->get($path));
                    $migrated++;
                } catch (\Throwable) {
                    $failed++;
                }
            }

            $message = "{$migrated} files migrated successfully";
            $message .= $skipped > 0 ? ", {$skipped} skipped (not found in the old location)" : '';
            $message .= $failed > 0 ? ", {$failed} failed" : '';
            $message .= '.';

            $setting->update([
                'migration_status' => $failed > 0 ? 'failed' : 'completed',
                'migration_message' => $message,
            ]);
        } catch (\Throwable $e) {
            $setting->update([
                'migration_status' => 'failed',
                'migration_message' => 'Migration failed: '.$e->getMessage(),
            ]);
        }
    }

    private function buildDisk(StorageSettingsService $storage, array $config): Filesystem
    {
        if ($config['driver'] === 's3') {
            return $storage->buildS3Disk($config);
        }

        return Storage::disk('public');
    }
}
