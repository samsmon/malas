<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class MigrateDatabaseData extends Command
{
    /**
     * Used once at cutover to a new DB engine (e.g. existing SQLite/MySQL dev to Postgres
     * in Docker). It does not use a SQL text dump (`DatabaseBackupController`) because SQL dialects
     * differ between SQLite/MySQL/Postgres (backtick vs double-quote, etc.). Here the data is copied
     * row by row through the query builder, so it is driver-agnostic and ignores SQL syntax entirely.
     */
    protected $signature = 'malas:migrate-data
        {--from=sqlite : Nama connection sumber, sesuai key di config/database.php (mis. sqlite, mysql)}
        {--to=pgsql : Nama connection tujuan, sesuai key di config/database.php (mis. pgsql)}
        {--truncate : Kosongkan dulu tabel tujuan sebelum menyalin (aman dipakai berkali-kali/re-run)}
        {--chunk=500 : Jumlah baris per batch insert}';

    protected $description = 'Copy all data from one database connection to another (e.g. old SQLite/MySQL to new Postgres), used once at DB engine cutover.';

    public function handle(): int
    {
        $from = (string) $this->option('from');
        $to = (string) $this->option('to');
        $chunk = max(1, (int) $this->option('chunk'));

        if ($from === $to) {
            $this->error('--from and --to must not be the same.');

            return self::FAILURE;
        }

        $sourceConnection = DB::connection($from);
        $targetConnection = DB::connection($to);

        try {
            $sourceConnection->getPdo();
            $targetConnection->getPdo();
        } catch (\Throwable $e) {
            $this->error("Failed to connect to one of the connections: {$e->getMessage()}");

            return self::FAILURE;
        }

        $tables = $this->listTables($sourceConnection);

        if ($tables === []) {
            $this->warn("No tables found in connection '{$from}'.");

            return self::SUCCESS;
        }

        $this->info("Copying ".count($tables)." tables from '{$from}' ke '{$to}'...");

        if (! $this->option('no-interaction') && ! $this->confirm("Continue? This will ".($this->option('truncate') ? 'EMPTY and then ' : '')."fill the tables in connection '{$to}'.", true)) {
            $this->warn('Cancelled.');

            return self::SUCCESS;
        }

        foreach ($tables as $table) {
            if (! Schema::connection($to)->hasTable($table)) {
                $this->warn("Skipping '{$table}': table does not exist in the target connection yet (run `php artisan migrate` there first).");

                continue;
            }

            $total = $sourceConnection->table($table)->count();

            if ($total === 0) {
                $this->line("  {$table}: empty, skipping.");

                continue;
            }

            if ($this->option('truncate')) {
                $targetConnection->table($table)->truncate();
            }

            // Not using chunkById(): some pivot tables (e.g. announcement_user, or the Spatie
            // permission tables that are always empty) have no `id` column. Since this is a
            // one-off migration for a homelab-scale app (not big data), cursor() + array_chunk is enough
            // and needs no unique column for ordering.
            $copied = 0;
            foreach ($sourceConnection->table($table)->cursor()->chunk($chunk) as $rows) {
                $data = $rows->map(fn ($row) => (array) $row)->all();

                if ($data !== []) {
                    $targetConnection->table($table)->insert($data);
                }

                $copied += count($data);
            }

            $this->line("  {$table}: {$copied}/{$total} rows copied.");
        }

        $this->info('Done. Check the row counts of the important tables manually before switching DB_CONNECTION in .env.');

        return self::SUCCESS;
    }

    private function listTables(\Illuminate\Database\Connection $connection): array
    {
        $driver = $connection->getDriverName();

        $rows = match ($driver) {
            'sqlite' => $connection->select("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != 'migrations'"),
            'pgsql' => $connection->select("SELECT tablename AS name FROM pg_catalog.pg_tables WHERE schemaname = 'public' AND tablename != 'migrations'"),
            default => array_filter(
                $connection->select('SHOW TABLES'),
                fn ($row) => array_values((array) $row)[0] !== 'migrations',
            ),
        };

        return array_values(array_map(fn ($row) => array_values((array) $row)[0], $rows));
    }
}
