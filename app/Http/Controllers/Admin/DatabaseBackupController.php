<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\StreamedResponse;

class DatabaseBackupController extends Controller
{
    // Tables that are not backed up/imported (ephemeral or managed by SSO)
    private const EXCLUDED = [
        'users',
        'migrations',
        'sessions',
        'cache',
        'cache_locks',
        'jobs',
        'failed_jobs',
        'password_reset_tokens',
    ];

    public function download(): StreamedResponse
    {
        abort_unless(auth()->user()->isSuperAdmin(), 403);

        $tables = $this->getBackupTables();
        $filename = 'malas-backup-'.now()->format('Y-m-d-His').'.sql';
        $quote = $this->identifierQuoteChar();

        return response()->streamDownload(function () use ($tables, $quote): void {
            echo "-- Malas Database Backup\n";
            echo '-- Generated : '.now()->toDateTimeString()."\n";
            echo '-- Tables    : '.implode(', ', $tables)."\n";
            echo "-- NOTE: Table 'users' is not backed up (managed via SSO)\n\n";
            echo $this->fkChecksStatement(false)."\n\n";

            foreach ($tables as $table) {
                $qTable = $this->quoteIdentifier($table, $quote);

                echo "-- --------------------------------------------------------\n";
                echo "-- Table: {$qTable}\n";
                echo "-- --------------------------------------------------------\n";

                echo "DELETE FROM {$qTable};\n";

                $rows = DB::table($table)->get();

                if ($rows->isEmpty()) {
                    echo "\n";

                    continue;
                }

                $columns = array_keys((array) $rows->first());
                $colList = implode(', ', array_map(fn (string $c) => $this->quoteIdentifier($c, $quote), $columns));

                foreach ($rows as $row) {
                    $vals = array_map(function ($v): string {
                        if ($v === null) {
                            return 'NULL';
                        }

                        return "'".str_replace(
                            ['\\',  "'",  "\n",  "\r",  "\x00", "\x1a"],
                            ['\\\\', "\\'", '\\n', '\\r', '\\0',  '\\Z'],
                            (string) $v
                        )."'";
                    }, (array) $row);

                    echo "INSERT INTO {$qTable} ({$colList}) VALUES (".implode(', ', $vals).");\n";
                }

                echo "\n";
            }

            echo $this->fkChecksStatement(true)."\n";
        }, $filename, ['Content-Type' => 'application/sql']);
    }

    public function import(Request $request): RedirectResponse
    {
        abort_unless(auth()->user()->isSuperAdmin(), 403);

        $request->validate([
            'backup_file' => ['required', 'file', 'max:102400'],
        ]);

        $content = file_get_contents($request->file('backup_file')->getRealPath());

        // Also accept the old signature (MALAS, before the rename to title case), so old backups that
        // users already downloaded are not rejected just because the brand name changed.
        if (! str_starts_with($content, '-- Malas Database Backup') && ! str_starts_with($content, '-- MALAS Database Backup')) {
            return back()->with('error', __('flash.database_backup.invalid_file'));
        }

        // Parse statement satu per satu
        $statements = $this->parseStatements($content);

        // Safety: drop statements that touch excluded tables
        $excluded = self::EXCLUDED;
        $statements = array_filter($statements, function (string $sql) use ($excluded): bool {
            foreach ($excluded as $table) {
                // Check whether the statement mentions this table in a DML/DDL context
                if (preg_match('/\b(DELETE\s+FROM|INSERT\s+INTO|UPDATE|TRUNCATE|DROP\s+TABLE|CREATE\s+TABLE)\s+[`"]?'.preg_quote($table, '/').'[`"]?/i', $sql)) {
                    return false;
                }
            }

            return true;
        });

        try {
            DB::beginTransaction();
            DB::statement($this->fkChecksStatement(false));

            foreach ($statements as $sql) {
                $sql = trim($sql);
                if ($sql === '' || str_starts_with($sql, '--')) {
                    continue;
                }

                // FK-check lines in the file (MySQL or SQLite syntax, depending on the driver
                // used when the backup was generated) are deliberately skipped here. We always emit
                // the correct pragma/statement for the driver that is active NOW via
                // fkChecksStatement(), instead of executing the raw line from the file. This is also what
                // keeps cross-driver import working (e.g. a backup from SQLite dev restored to MySQL
                // prod); the INSERT/DELETE statements themselves are driver-agnostic.
                if (preg_match('/^(SET\s+FOREIGN_KEY_CHECKS|PRAGMA\s+foreign_keys|SET\s+session_replication_role)/i', $sql)) {
                    continue;
                }

                DB::unprepared($sql);
            }

            DB::statement($this->fkChecksStatement(true));
            DB::commit();

            ActivityLog::record('database.import', 'Imported database from backup file: '.$request->file('backup_file')->getClientOriginalName().'.');

            return back()->with('success', __('flash.database_backup.imported'));
        } catch (\Throwable $e) {
            DB::rollBack();
            // Make sure FK checks are re-enabled even on rollback
            try {
                DB::statement($this->fkChecksStatement(true));
            } catch (\Throwable) {
            }

            return back()->with('error', __('flash.database_backup.import_failed', ['error' => $e->getMessage()]));
        }
    }

    private function parseStatements(string $content): array
    {
        $statements = [];
        $current = '';

        foreach (explode("\n", $content) as $line) {
            $trimmed = ltrim($line);

            // Skip comments and empty lines
            if ($trimmed === '' || str_starts_with($trimmed, '--')) {
                continue;
            }

            $current .= $line."\n";

            // A statement ends when a line ends with a semicolon
            if (str_ends_with(rtrim($line), ';')) {
                $statements[] = trim($current);
                $current = '';
            }
        }

        return array_filter($statements, fn (string $s) => $s !== '');
    }

    private function getBackupTables(): array
    {
        // How to list tables differs per driver — SQLite (dev, lihat CLAUDE.md) pakai
        // `sqlite_master`, Postgres pakai `information_schema`, MySQL pakai `SHOW TABLES`.
        $rows = match (DB::connection()->getDriverName()) {
            'sqlite' => DB::select("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"),
            'pgsql' => DB::select("SELECT tablename AS name FROM pg_catalog.pg_tables WHERE schemaname = 'public'"),
            default => DB::select('SHOW TABLES'),
        };

        return array_values(array_filter(
            array_map(fn ($row) => array_values((array) $row)[0], $rows),
            fn (string $table) => ! in_array($table, self::EXCLUDED, true),
        ));
    }

    /**
     * MySQL pakai `SET FOREIGN_KEY_CHECKS`, SQLite pakai `PRAGMA foreign_keys`, Postgres
     * has no global FK toggle; use `session_replication_role = replica` (needs
     * superuser/owner privilege, which is satisfied automatically in our own Postgres container).
     */
    private function fkChecksStatement(bool $enable): string
    {
        return match (DB::connection()->getDriverName()) {
            'sqlite' => 'PRAGMA foreign_keys = '.($enable ? 'ON' : 'OFF').';',
            'pgsql' => 'SET session_replication_role = '.($enable ? 'origin' : 'replica').';',
            default => 'SET FOREIGN_KEY_CHECKS='.($enable ? '1' : '0').';',
        };
    }

    /** Backtick (MySQL/SQLite) vs double-quote (Postgres) for identifiers in the SQL dump. */
    private function identifierQuoteChar(): string
    {
        return DB::connection()->getDriverName() === 'pgsql' ? '"' : '`';
    }

    private function quoteIdentifier(string $identifier, string $quote): string
    {
        return $quote.$identifier.$quote;
    }
}
