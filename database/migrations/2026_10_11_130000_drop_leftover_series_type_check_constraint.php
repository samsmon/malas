<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Migration 2026_09_20_012144 changed the `type` column from enum() to string, but on Postgres the
     * enum's built-in CHECK constraint (`series_type_check`: manga, manhwa, manhua, novel, one_shot,
     * doujinshi) did NOT go away. As a result the "other" type was rejected by the database: saving a series of type
     * Other failed, importing manhwa/manhua from AniList failed, and the "Other" filter was always empty.
     * Valid values are still guarded by Rule::in in Store/UpdateSeriesRequest.
     */
    public function up(): void
    {
        if (DB::getDriverName() === 'pgsql') {
            DB::statement('ALTER TABLE series DROP CONSTRAINT IF EXISTS series_type_check');
        }
    }

    /** Deliberately empty: that constraint is a wrong leftover from the old enum and is not reinstated. */
    public function down(): void
    {
    }
};
