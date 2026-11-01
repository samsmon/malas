<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The per-volume cover feature is removed entirely. The app's core concept is only to track reading
 * progress and ownership (physical/digital), not a per-volume image gallery. The series cover (column
 * `series.cover_path`) STAYS; only the Volume level is removed. Physical files already
 * uploaded through this feature (manual/AniList/SerpApi) are left idle in storage. They are not
 * deleted automatically here because StorageSettingsService (S3/local) is not reliable to call
 * from a migration; if storage needs cleaning, do it manually and separately.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('volumes', function (Blueprint $table) {
            $table->dropColumn('cover_path');
        });
    }

    public function down(): void
    {
        Schema::table('volumes', function (Blueprint $table) {
            $table->string('cover_path')->nullable()->after('volume_number');
        });
    }
};
