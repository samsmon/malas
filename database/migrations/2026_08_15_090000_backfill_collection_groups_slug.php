<?php

use App\Models\CollectionGroup;
use Illuminate\Database\Migrations\Migration;

return new class extends Migration
{
    public function up(): void
    {
        // Groups created before the slug migration (2026_08_14_110000) have a NULL slug. The column
        // was added as `nullable()` so the migration would not fail on old data, but backfilling was forgotten.
        // Same pattern as the Series slug backfill (see 2026_08_02_090000_add_slug_to_series_table.php).
        CollectionGroup::whereNull('slug')->with('user')->get()->each(function (CollectionGroup $group) {
            $group->slug = CollectionGroup::generateUniqueSlug($group->user, $group->name, $group->id);
            $group->saveQuietly();
        });
    }

    public function down(): void
    {
        // There is no previous state to restore: a NULL slug was just a data bug, not a feature.
    }
};
