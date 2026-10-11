<?php

namespace App\Http\Middleware;

use App\Models\ActivityLog;
use Closure;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Safety net untuk log aktivitas admin: setiap request admin yang MENGUBAH data
 * (POST/PUT/PATCH/DELETE) dan sukses, tapi belum dicatat controller lewat ActivityLog::record(),
 * dicatat di sini dengan deskripsi generik. Jadi tidak ada aksi admin yang lolos, termasuk
 * aksi baru yang lupa dipasangi record(). Aksi baca (GET) tidak dicatat, kecuali unduhan
 * backup database yang sensitif.
 */
class LogAdminActivity
{
    /** Route GET yang tetap dicatat karena sensitif. */
    private const LOGGED_GET = ['admin.settings.db.download'];

    public function handle(Request $request, Closure $next): Response
    {
        ActivityLog::$recorded = false;

        $response = $next($request);

        try {
            $this->logIfNeeded($request, $response);
        } catch (\Throwable $e) {
            // Gagal mencatat log tidak boleh menggagalkan aksi admin.
            report($e);
        }

        return $response;
    }

    private function logIfNeeded(Request $request, Response $response): void
    {
        $route = $request->route();
        $user = $request->user();
        if (! $route || ! $user || ActivityLog::$recorded) {
            return;
        }

        $name = (string) $route->getName();
        $mutating = in_array($request->method(), ['POST', 'PUT', 'PATCH', 'DELETE'], true);
        if (! $mutating && ! in_array($name, self::LOGGED_GET, true)) {
            return;
        }

        // Hanya aksi yang berhasil: error server atau validasi gagal (redirect back dengan errors) tidak dicatat.
        if ($response->getStatusCode() >= 400) {
            return;
        }
        if ($request->hasSession() && $request->session()->get('errors')?->isNotEmpty()) {
            return;
        }

        $subject = collect($route->parameters())->first(fn ($v) => $v instanceof Model);
        $action = preg_replace('/^admin\./', '', $name) ?: 'admin.unknown';
        $label = $this->subjectLabel($subject);
        $description = sprintf('%s %s%s.', $request->method(), $action, $label ? " ({$label})" : '');

        ActivityLog::record($action, $description, $subject instanceof Model ? $subject : null);
    }

    private function subjectLabel(mixed $subject): ?string
    {
        if (! $subject instanceof Model) {
            return null;
        }
        foreach (['title_romaji', 'title', 'name', 'volume_number'] as $attr) {
            if (! empty($subject->{$attr})) {
                return class_basename($subject).' "'.$subject->{$attr}.'"';
            }
        }

        return class_basename($subject).' '.$subject->getKey();
    }
}
