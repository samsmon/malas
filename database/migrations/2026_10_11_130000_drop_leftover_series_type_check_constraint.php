<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Migrasi 2026_09_20_012144 mengubah kolom `type` dari enum() jadi string, tapi di Postgres
     * CHECK constraint bawaan enum (`series_type_check`: manga, manhwa, manhua, novel, one_shot,
     * doujinshi) TIDAK ikut hilang. Akibatnya tipe "other" ditolak database: simpan series bertipe
     * Lainnya error, impor manhwa/manhua dari AniList gagal, dan filter "Lainnya" selalu kosong.
     * Nilai yang valid tetap dijaga Rule::in di Store/UpdateSeriesRequest.
     */
    public function up(): void
    {
        if (DB::getDriverName() === 'pgsql') {
            DB::statement('ALTER TABLE series DROP CONSTRAINT IF EXISTS series_type_check');
        }
    }

    /** Sengaja kosong: constraint itu sisa enum lama yang salah, tidak dipasang ulang. */
    public function down(): void
    {
    }
};
