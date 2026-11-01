<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\TestStorageConnectionRequest;
use App\Http\Requests\Admin\UpdateStorageSettingRequest;
use App\Jobs\MigrateStorageFilesJob;
use App\Models\ActivityLog;
use App\Models\AiSetting;
use App\Models\MailSetting;
use App\Models\StorageSetting;
use App\Services\StorageSettingsService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Inertia\Inertia;
use Inertia\Response;

class StorageSettingController extends Controller
{
    public function __construct(private StorageSettingsService $storage) {}

    public function edit(): Response
    {
        $setting = StorageSetting::first() ?? new StorageSetting(['driver' => 'local']);

        $this->authorize('view', $setting);

        $aiSetting = AiSetting::first() ?? new AiSetting(['provider' => 'gemini']);
        $mailSetting = MailSetting::first() ?? new MailSetting(['provider' => 'resend']);

        return Inertia::render('Admin/Settings/Index', [
            'setting' => [
                'driver' => $setting->driver,
                'access_key_id' => $setting->access_key_id,
                'bucket' => $setting->bucket,
                'endpoint' => $setting->endpoint,
                'region' => $setting->region,
                'url' => $setting->url,
                // The secret is now sent to the frontend (it used to be fully hidden). This page
                // is already super_admin-only via StorageSettingPolicy, so it adds no exposure
                // to a new audience. The UI shows it behind a show/hide toggle (eye icon).
                'secret_access_key' => $setting->secret_access_key,
                'has_secret' => filled($setting->secret_access_key),
                'migration_status' => $setting->migration_status,
                'migration_message' => $setting->migration_message,
            ],
            'aiSetting' => [
                'provider' => $aiSetting->provider,
                'api_key' => $aiSetting->api_key,
                'has_key' => filled($aiSetting->api_key),
            ],
            'mailSetting' => [
                'provider' => $mailSetting->provider,
                'from_address' => $mailSetting->from_address,
                'from_name' => $mailSetting->from_name,
                'api_key' => $mailSetting->api_key,
                'has_key' => filled($mailSetting->api_key),
            ],
        ]);
    }

    public function update(UpdateStorageSettingRequest $request): RedirectResponse
    {
        $setting = StorageSetting::first() ?? new StorageSetting(['driver' => 'local']);

        $this->authorize('update', $setting);

        $oldConfig = $setting->only(['driver', 'access_key_id', 'secret_access_key', 'bucket', 'endpoint', 'region', 'url']);
        $data = $request->validated();

        // Keep the existing encrypted secret if the admin left it blank
        // (e.g. only changing the bucket name without re-entering the key).
        if (blank($data['secret_access_key'] ?? null)) {
            unset($data['secret_access_key']);
        }

        $setting->fill($data)->save();

        $this->storage->forgetCache();

        ActivityLog::record('storage_settings.update', "Updated storage settings (driver: {$oldConfig['driver']} → {$setting->driver}).");

        // The effective file location changed: migrate automatically in the background so old files do not "disappear" from the UI.
        $locationChanged = $oldConfig['driver'] !== $setting->driver
            || $oldConfig['access_key_id'] !== $setting->access_key_id
            || $oldConfig['bucket'] !== $setting->bucket
            || $oldConfig['endpoint'] !== $setting->endpoint
            || $oldConfig['region'] !== $setting->region;

        if ($locationChanged) {
            MigrateStorageFilesJob::dispatch($oldConfig);

            return redirect()->back()->with('success', __('flash.storage_settings.saved_migrating'));
        }

        return redirect()->back()->with('success', __('flash.storage_settings.saved'));
    }

    public function testConnection(TestStorageConnectionRequest $request): JsonResponse
    {
        $this->authorize('update', StorageSetting::first() ?? new StorageSetting(['driver' => 'local']));

        try {
            $disk = $this->storage->buildS3Disk($request->validated());
            $testPath = 'storage-test/'.uniqid('', true).'.txt';
            $disk->put($testPath, 'Malas storage connection test');
            $disk->delete($testPath);

            return response()->json([
                'success' => true,
                'message' => __('flash.storage_settings.connection_ok'),
            ]);
        } catch (\Throwable $e) {
            return response()->json([
                'success' => false,
                'message' => $e->getMessage(),
            ]);
        }
    }
}
