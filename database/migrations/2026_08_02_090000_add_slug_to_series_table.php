<?php

use App\Models\Series;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('series', function (Blueprint $table) {
            $table->string('slug')->nullable()->after('title_romaji');
        });

        // Backfill slugs for existing series. Triggers the model event
        // (Series::booted) so the uniqueness logic stays consistent with new creates/updates.
        Series::withTrashed()->whereNull('slug')->each(function (Series $series) {
            $series->slug = Series::generateUniqueSlug($series->title_romaji, $series->id);
            $series->saveQuietly();
        });

        Schema::table('series', function (Blueprint $table) {
            $table->unique('slug');
        });
    }

    public function down(): void
    {
        Schema::table('series', function (Blueprint $table) {
            $table->dropUnique(['slug']);
            $table->dropColumn('slug');
        });
    }
};
