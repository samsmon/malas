<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('series', function (Blueprint $table) {
            // `tags`: flat array of AniList tag names (e.g. "Isekai", "Anti-Hero"), used for
            // filtering (whereJsonContains), exactly the same pattern as the existing `genres` column.
            $table->json('tags')->nullable()->after('demographics');
            // `tag_categories`: map of tag name -> AniList category (e.g. "Isekai" -> "Theme-Reincarnation")
            // - only used to group tags into a tree in the filter UI, NEVER queried
            // directly in a WHERE clause (so it does not need to be driver-aware like `tags`/`genres`).
            $table->json('tag_categories')->nullable()->after('tags');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('series', function (Blueprint $table) {
            $table->dropColumn(['tags', 'tag_categories']);
        });
    }
};
