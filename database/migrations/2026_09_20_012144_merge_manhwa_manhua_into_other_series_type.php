<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Manhwa/manhua are merged into the "other" type. This app only tracks physical/digital
     * collections (bookwalker/amazon), not the country of origin of a comic. The `type` column
     * is downgraded from enum() to a plain string because ALTER enum works differently per driver
     * (MySQL MODIFY vs Postgres CHECK constraint vs SQLite table rebuild). Validation of the
     * allowed values is still kept in StoreSeriesRequest/UpdateSeriesRequest (Rule::in), not in the DB.
     */
    public function up(): void
    {
        DB::table('series')->whereIn('type', ['manhwa', 'manhua'])->update(['type' => 'other']);

        Schema::table('series', function (Blueprint $table) {
            $table->string('type', 20)->default('manga')->change();
        });
    }

    public function down(): void
    {
        Schema::table('series', function (Blueprint $table) {
            $table->enum('type', ['manga', 'manhwa', 'manhua', 'novel', 'one_shot', 'doujinshi'])->default('manga')->change();
        });
    }
};
