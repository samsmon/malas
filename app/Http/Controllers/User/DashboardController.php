<?php

namespace App\Http\Controllers\User;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\Collection;
use App\Models\GenreFunfact;
use App\Models\Loan;
use App\Models\Series;
use App\Models\Ticket;
use App\Models\User;
use App\Services\AiFunfactService;
use App\Services\AiRateLimitException;
use App\Services\StorageSettingsService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection as SupportCollection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Inertia\Inertia;
use Inertia\Response;

class DashboardController extends Controller
{
    // AI funfacts only start being generated once the user's collection is large enough to
    // infer a meaningful genre pattern.
    private const FUNFACT_ELIGIBLE_THRESHOLD = 15;

    private const FUNFACT_COOLDOWN_DAYS = 7;

    // Temporarily disabled at the user's request (2026-08-15): auto-generate and the
    // "Regenerate" button are skipped; the genre word cloud (not AI) keeps working normally. Set to true again
    // to re-enable; no data needs to be restored.
    private const FUNFACT_GENERATION_ENABLED = false;

    public function __construct(
        private StorageSettingsService $storage,
        private AiFunfactService $aiFunfact,
    ) {}

    public function index(Request $request): Response
    {
        $user = $request->user();

        $collectionIds = $user->collections()->pluck('id');

        $ownedCount = DB::table('collection_volumes')
            ->whereIn('collection_id', $collectionIds)
            ->count();

        $activeLoansCount = Loan::whereIn('collection_id', $collectionIds)
            ->whereNull('returned_at')
            ->count();

        $overdueCount = Loan::whereIn('collection_id', $collectionIds)
            ->whereNull('returned_at')
            ->whereNotNull('due_at')
            ->where('due_at', '<', now())
            ->count();

        $latestTicket = Ticket::where('user_id', $user->id)
            ->latest()
            ->first(['id', 'subject', 'status']);

        $collectionsByStatus = Collection::where('user_id', $user->id)
            ->join('series', 'series.id', '=', 'collections.series_id')
            ->selectRaw('series.status as status, count(*) as total')
            ->groupBy('series.status')
            ->pluck('total', 'status')
            ->toArray();

        $recommendations = $this->genreRecommendations($user, 6);
        if ($recommendations->isEmpty()) {
            $recommendations = $this->fallbackRecommendations($user, 6);
        }
        $recommendations = $recommendations->map(fn ($s) => $this->presentSeries($s));

        $ownedGenreCounts = $this->ownedGenreCounts($user);
        $collectionsCount = $collectionIds->count();
        $eligible = $collectionsCount >= self::FUNFACT_ELIGIBLE_THRESHOLD;

        $funfact = GenreFunfact::where('user_id', $user->id)->first();

        if ($eligible && self::FUNFACT_GENERATION_ENABLED) {
            $funfact = $this->maybeAutoGenerateFunfact($user, $funfact, $ownedGenreCounts, $collectionsCount);
        }

        return Inertia::render('User/Dashboard', [
            'stats' => [
                'series_count' => $collectionIds->count(),
                'owned_volumes_count' => $ownedCount,
                'active_loans_count' => $activeLoansCount,
                'overdue_count' => $overdueCount,
            ],
            'latest_ticket' => $latestTicket ? [
                'id' => $latestTicket->id,
                'subject' => $latestTicket->subject,
                'status' => $latestTicket->status,
            ] : null,
            'collections_by_status' => $collectionsByStatus,
            'recommendations' => $recommendations->values(),
            'continue_reading' => $this->continueReading($user),
            'genre_distribution' => $this->presentDistribution($ownedGenreCounts),
            'funfact' => [
                'eligible' => $eligible,
                'generation_enabled' => self::FUNFACT_GENERATION_ENABLED,
                'content' => $funfact?->content,
                'generated_at' => $funfact?->generated_at?->toIso8601String(),
                'quota_remaining' => $this->quotaRemaining($funfact),
                'quota_max' => $funfact?->quota_override ?? GenreFunfact::DEFAULT_MANUAL_QUOTA,
            ],
        ]);
    }

    public function regenerateFunfact(Request $request): RedirectResponse
    {
        if (! self::FUNFACT_GENERATION_ENABLED) {
            abort(404);
        }

        $user = $request->user();

        $request->validate([
            'content' => ['nullable', 'string', 'max:1000'],
        ]);

        $funfact = GenreFunfact::firstOrNew(['user_id' => $user->id], ['manual_regenerate_count' => 0]);
        $this->resetQuotaWindowIfExpired($funfact);
        $quotaMax = $funfact->quota_override ?? GenreFunfact::DEFAULT_MANUAL_QUOTA;

        if ($funfact->manual_regenerate_count >= $quotaMax) {
            return redirect()->back()->with('error', __('flash.dashboard.funfact_quota_reached', ['max' => $quotaMax]));
        }

        $ownedGenreCounts = $this->ownedGenreCounts($user);

        try {
            $content = $this->aiFunfact->generate($this->buildFunfactContext($ownedGenreCounts));
        } catch (AiRateLimitException $e) {
            // Free-tier provider is rate limited: still show something (fallback) without consuming quota.
            report($e);
            ActivityLog::record(
                'ai.funfact.rate_limited',
                "AI rate limit while generating funfact for {$user->name}: {$e->getMessage()}",
                $user,
            );

            $content = $this->aiFunfact->fallbackText($this->buildFunfactContext($ownedGenreCounts));
            $funfact->content = $content;
            $funfact->generated_at = now();
            $funfact->collections_count_at_generation = $user->collections()->count();
            $funfact->save();

            return redirect()->back()->with('info', __('flash.dashboard.funfact_rate_limited'));
        } catch (\Throwable $e) {
            // A failed attempt does not consume quota; the old funfact (if any) is kept.
            report($e);
            ActivityLog::record(
                'ai.funfact.error',
                "Funfact generation failed for {$user->name}: {$e->getMessage()}",
                $user,
            );

            return redirect()->back()->with('error', __('flash.dashboard.funfact_failed'));
        }

        $funfact->content = $content;
        $funfact->generated_at = now();
        $funfact->collections_count_at_generation = $user->collections()->count();
        $funfact->manual_regenerate_count += 1;
        $funfact->manual_regenerate_window_started_at ??= now();
        $funfact->save();

        ActivityLog::record('ai.funfact.generate', "Funfact regenerated by {$user->name}.", $user);

        return redirect()->back()->with('success', __('flash.dashboard.funfact_regenerated'));
    }

    public function surpriseMe(Request $request): JsonResponse
    {
        $user = $request->user();

        $pool = $this->genreRecommendations($user, 20);

        if ($pool->isEmpty()) {
            $pool = $this->fallbackRecommendations($user, 20);
        }

        return response()->json([
            'series' => $pool->isNotEmpty() ? $this->presentSeries($pool->random()) : null,
        ]);
    }

    public function genreDetail(Request $request): JsonResponse
    {
        $user = $request->user();
        $genre = trim((string) $request->get('genre', ''));

        if (! $genre) {
            return response()->json(['genre' => null, 'owned' => [], 'recommended' => []]);
        }

        $ownedSeriesIds = $user->collections()->pluck('series_id');
        $columns = ['id', 'slug', 'title_romaji', 'cover_path', 'type', 'status', 'genres', 'authors', 'synopsis'];

        $owned = Series::whereIn('id', $ownedSeriesIds)
            ->whereJsonContains('genres', $genre)
            ->limit(12)
            ->get($columns)
            ->map(fn ($s) => $this->presentSeries($s));

        $recommended = Series::whereNotIn('id', $ownedSeriesIds)
            ->whereJsonContains('genres', $genre)
            ->orderByDesc('score')
            ->limit(6)
            ->get($columns)
            ->map(fn ($s) => $this->presentSeries($s));

        return response()->json([
            'genre' => $genre,
            'owned' => $owned->values(),
            'recommended' => $recommended->values(),
        ]);
    }

    /**
     * Rank non-owned series by how many genres they share with the user's
     * existing collection. Computed in PHP (not raw JSON DB queries) so it
     * behaves identically on SQLite (dev) and MySQL (prod).
     *
     * @return SupportCollection<int, Series>
     */
    private function genreRecommendations(User $user, int $limit): SupportCollection
    {
        $ownedSeriesIds = $user->collections()->pluck('series_id');
        $ownedGenreCounts = $this->ownedGenreCounts($user);

        if ($ownedGenreCounts->isEmpty()) {
            return collect();
        }

        return Series::whereNotIn('id', $ownedSeriesIds)
            ->get(['id', 'slug', 'title_romaji', 'cover_path', 'type', 'status', 'genres', 'authors', 'synopsis'])
            ->map(fn ($s) => [
                'series' => $s,
                'score' => collect($s->genres ?? [])->sum(fn ($g) => $ownedGenreCounts->get($g, 0)),
            ])
            ->filter(fn ($item) => $item['score'] > 0)
            ->sortByDesc('score')
            ->take($limit)
            ->pluck('series')
            ->values();
    }

    /**
     * Used when genre-overlap scoring finds nothing (new user, or the
     * remaining catalog lacks genre metadata) so the section never sits empty.
     *
     * @return SupportCollection<int, Series>
     */
    private function fallbackRecommendations(User $user, int $limit): SupportCollection
    {
        $ownedSeriesIds = $user->collections()->pluck('series_id');

        return Series::whereNotIn('id', $ownedSeriesIds)
            ->inRandomOrder()
            ->limit($limit)
            ->get(['id', 'slug', 'title_romaji', 'cover_path', 'type', 'status', 'genres', 'authors', 'synopsis']);
    }

    private function presentSeries(Series $series): array
    {
        $synopsis = $series->synopsis ? trim(strip_tags($series->synopsis)) : null;

        return [
            'id' => $series->id,
            'slug' => $series->slug,
            'title_romaji' => $series->title_romaji,
            'cover_url' => $this->storage->url($series->cover_path),
            'type' => $series->type,
            'status' => $series->status,
            'authors' => $series->authors ?? [],
            'genres' => $series->genres ?? [],
            'synopsis' => $synopsis ? Str::limit($synopsis, 160) : null,
        ];
    }

    /**
     * Series the user has started reading (at least one read volume) but hasn't
     * finished (there's an unread volume after the last one they read).
     *
     * @return array<int, array{collection_id: string, series_slug: string, series_title: string, cover_url: string|null, next_volume: int}>
     */
    private function continueReading(User $user): array
    {
        return $user->collections()
            ->with(['series:id,slug,title_romaji,cover_path', 'collectionVolumes'])
            ->get()
            ->map(function (Collection $c) {
                $readVolumes = $c->collectionVolumes->whereNotNull('read_at');

                if ($readVolumes->isEmpty()) {
                    return null;
                }

                $lastReadVolumeNumber = $readVolumes->max('volume_number');
                $lastReadAt = $readVolumes->max('read_at');

                $nextUnread = $c->collectionVolumes
                    ->where('volume_number', '>', $lastReadVolumeNumber)
                    ->whereNull('read_at')
                    ->sortBy('volume_number')
                    ->first();

                if (! $nextUnread) {
                    return null;
                }

                return [
                    'collection_id' => $c->id,
                    'series_slug' => $c->series->slug,
                    'series_title' => $c->series->title_romaji,
                    'cover_url' => $this->storage->url($c->series->cover_path),
                    'next_volume' => $nextUnread->volume_number,
                    'last_read_at' => $lastReadAt,
                ];
            })
            ->filter()
            // Shuffle the order (not sortByDesc last_read_at) so the widget does not
            // keep showing the same series every time the dashboard is opened.
            ->shuffle()
            ->take(5)
            ->map(fn ($item) => collect($item)->except('last_read_at')->all())
            ->values()
            ->all();
    }

    /** @return SupportCollection<string, int> */
    private function ownedGenreCounts(User $user): SupportCollection
    {
        $ownedSeriesIds = $user->collections()->pluck('series_id');

        return Series::whereIn('id', $ownedSeriesIds)
            ->pluck('genres')
            ->flatten()
            ->filter()
            ->countBy();
    }

    /**
     * Genre popularity across every user's collection (not de-duplicated by series),
     * used as the "rata-rata pengguna lain" baseline for the funfact comparison line.
     *
     * @return SupportCollection<string, int>
     */
    private function globalGenreCounts(): SupportCollection
    {
        return DB::table('collections')
            ->join('series', 'series.id', '=', 'collections.series_id')
            ->pluck('series.genres')
            ->map(fn ($json) => json_decode($json ?? '[]', true) ?? [])
            ->flatten()
            ->filter()
            ->countBy();
    }

    /** @return array<int, array{genre: string, count: int, percent: float}> */
    private function presentDistribution(SupportCollection $ownedGenreCounts): array
    {
        $total = $ownedGenreCounts->sum();

        if ($total === 0) {
            return [];
        }

        return $ownedGenreCounts->sortDesc()->take(20)
            ->map(fn ($count, $genre) => [
                'genre' => $genre,
                'count' => $count,
                'percent' => round($count / $total * 100, 1),
            ])
            ->values()
            ->all();
    }

    /** @return array{top_genres: array<int, array{genre: string, count: int, percent: float}>, comparison: array{genre: string, multiplier: float}|null} */
    private function buildFunfactContext(SupportCollection $ownedGenreCounts): array
    {
        $topGenres = $this->presentDistribution($ownedGenreCounts);
        $topGenres = array_slice($topGenres, 0, 5);

        $comparison = null;

        if (! empty($topGenres)) {
            $topGenre = $topGenres[0]['genre'];
            $total = $ownedGenreCounts->sum();
            $globalCounts = $this->globalGenreCounts();
            $globalTotal = $globalCounts->sum();
            $globalShare = $globalTotal > 0 ? $globalCounts->get($topGenre, 0) / $globalTotal : 0;
            $userShare = $total > 0 ? $ownedGenreCounts->get($topGenre, 0) / $total : 0;

            if ($globalShare > 0) {
                $comparison = [
                    'genre' => $topGenre,
                    'multiplier' => round($userShare / $globalShare, 1),
                ];
            }
        }

        return ['top_genres' => $topGenres, 'comparison' => $comparison];
    }

    private function needsAutoGenerate(?GenreFunfact $funfact, int $collectionsCount): bool
    {
        return ! $funfact || ! $funfact->content
            || ($collectionsCount > ($funfact->collections_count_at_generation ?? 0)
                && $funfact->generated_at
                && $funfact->generated_at->diffInDays(now()) >= self::FUNFACT_COOLDOWN_DAYS);
    }

    private function maybeAutoGenerateFunfact(User $user, ?GenreFunfact $funfact, SupportCollection $ownedGenreCounts, int $collectionsCount): ?GenreFunfact
    {
        if (! $this->needsAutoGenerate($funfact, $collectionsCount)) {
            return $funfact;
        }

        try {
            $content = $this->aiFunfact->generate($this->buildFunfactContext($ownedGenreCounts));
        } catch (AiRateLimitException $e) {
            // Free-tier provider is rate limited: still store a fallback so the dashboard is not empty.
            report($e);
            ActivityLog::record(
                'ai.funfact.rate_limited',
                "AI rate limit while auto-generating funfact for {$user->name}: {$e->getMessage()}",
                $user,
            );

            $content = $this->aiFunfact->fallbackText($this->buildFunfactContext($ownedGenreCounts));
        } catch (\Throwable $e) {
            // Auto-generate failed (e.g. AI provider down): leave the old funfact (or none) as is.
            report($e);
            ActivityLog::record(
                'ai.funfact.auto_generate_error',
                "Auto-generate funfact failed for {$user->name}: {$e->getMessage()}",
                $user,
            );

            return $funfact;
        }

        $funfact = $funfact ?? new GenreFunfact(['user_id' => $user->id]);
        $funfact->content = $content;
        $funfact->generated_at = now();
        $funfact->collections_count_at_generation = $collectionsCount;
        $funfact->save();

        ActivityLog::record('ai.funfact.auto_generate', "Auto-generated funfact for {$user->name}.", $user);

        return $funfact;
    }

    private function resetQuotaWindowIfExpired(GenreFunfact $funfact): void
    {
        if ($funfact->manual_regenerate_window_started_at
            && $funfact->manual_regenerate_window_started_at->diffInDays(now()) >= self::FUNFACT_COOLDOWN_DAYS) {
            $funfact->manual_regenerate_count = 0;
            $funfact->manual_regenerate_window_started_at = null;
        }
    }

    private function quotaRemaining(?GenreFunfact $funfact): int
    {
        if (! $funfact) {
            return GenreFunfact::DEFAULT_MANUAL_QUOTA;
        }

        $this->resetQuotaWindowIfExpired($funfact);

        $quotaMax = $funfact->quota_override ?? GenreFunfact::DEFAULT_MANUAL_QUOTA;

        return max(0, $quotaMax - $funfact->manual_regenerate_count);
    }
}
