<?php

namespace App\Http\Controllers\User;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\Collection;
use App\Models\CollectionVolume;
use App\Models\Series;
use App\Services\StorageSettingsService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;
use Symfony\Component\HttpFoundation\StreamedResponse;

class CollectionController extends Controller
{
    public function __construct(private StorageSettingsService $storage) {}

    public function index(): Response
    {
        $collections = auth()->user()
            ->collections()
            ->with(['series', 'collectionVolumes:id,collection_id,volume_number'])
            ->withCount([
                'collectionVolumes',
                'collectionVolumes as read_volumes_count' => fn ($q) => $q->whereNotNull('read_at'),
            ])
            ->latest()
            ->get()
            ->map(fn ($c) => [
                'id' => $c->id,
                'series_id' => $c->series_id,
                'slug' => $c->series->slug,
                'title_romaji' => $c->series->title_romaji,
                'title_english' => $c->series->title_english,
                'cover_url' => $this->storage->url($c->series->cover_path),
                'total_volumes' => $c->series->total_volumes,
                'collection_volumes_count' => $c->collection_volumes_count,
                'read_volumes_count' => $c->read_volumes_count,
                'status' => $c->series->status,
                'type' => $c->series->type,
                'genres' => $c->series->genres ?? [],
                'condition' => $c->condition,
                'created_at' => $c->created_at->toIso8601String(),
                'is_adult' => $c->series->is_adult,
                'missing_volumes' => $this->missingVolumes($c),
            ]);

        return Inertia::render('User/Collection/Index', [
            'collections' => $collections,
        ]);
    }

    /**
     * Volume numbers the user does not own yet, compared against `series.total_volumes`
     * (this number from AniList/RanobeDB already represents volumes that HAVE been released, not
     * a projected planned total, so no separate release date filter is needed). Null if
     * `total_volumes` is not known yet, so the gap cannot be computed.
     *
     * @return array<int, int>
     */
    private function missingVolumes(Collection $collection): array
    {
        if (! $collection->series->total_volumes) {
            return [];
        }

        $owned = $collection->collectionVolumes->pluck('volume_number')->all();

        return collect(range(1, $collection->series->total_volumes))
            ->diff($owned)
            ->values()
            ->all();
    }

    public function export(): StreamedResponse
    {
        $user = auth()->user();

        $collections = $user->collections()
            ->with(['series', 'collectionVolumes'])
            ->get()
            ->map(fn ($c) => [
                // Series identifiers for matching on import. All are sent (not just one)
                // so the import can still match even if one ID changes or is empty.
                'series' => [
                    'anilist_id' => $c->series->anilist_id,
                    'ranobedb_id' => $c->series->ranobedb_id,
                    'mal_id' => $c->series->mal_id,
                    'slug' => $c->series->slug,
                    'title_romaji' => $c->series->title_romaji,
                ],
                'condition' => $c->condition,
                'acquired_at' => $c->acquired_at?->toDateString(),
                'notes' => $c->notes,
                'personal_rating' => $c->personal_rating,
                'personal_review' => $c->personal_review,
                'volumes' => $c->collectionVolumes->map(fn ($v) => [
                    'volume_number' => $v->volume_number,
                    'format' => $v->format,
                    'ebook_source' => $v->ebook_source,
                    'language' => $v->language,
                    'read_at' => $v->read_at?->toIso8601String(),
                ])->all(),
            ]);

        $payload = [
            'version' => 1,
            'exported_at' => now()->toIso8601String(),
            'exported_by' => $user->username ?? $user->name,
            'collections' => $collections,
        ];

        $filename = 'malas-collection-'.($user->username ?? 'user').'-'.now()->format('Y-m-d-His').'.json';

        return response()->streamDownload(function () use ($payload) {
            echo json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        }, $filename, ['Content-Type' => 'application/json']);
    }

    public function import(Request $request): RedirectResponse
    {
        $request->validate([
            'collection_file' => ['required', 'file', 'max:10240'],
        ]);

        $content = file_get_contents($request->file('collection_file')->getRealPath());
        $data = json_decode($content, true);

        if (! is_array($data) || ! isset($data['version'], $data['collections']) || ! is_array($data['collections'])) {
            return redirect()->back()->with('error', __('flash.collections.import_invalid'));
        }

        $user = auth()->user();
        $ownedSeriesIds = $user->collections()->pluck('series_id')->all();

        $imported = 0;
        $skippedExisting = 0;
        $skippedNotFound = 0;

        DB::beginTransaction();

        try {
            foreach ($data['collections'] as $entry) {
                $series = $this->matchSeriesForImport($entry['series'] ?? []);

                if (! $series) {
                    $skippedNotFound++;

                    continue;
                }

                if (in_array($series->id, $ownedSeriesIds, true)) {
                    $skippedExisting++;

                    continue;
                }

                $collection = $user->collections()->create([
                    'series_id' => $series->id,
                    'condition' => $this->sanitizeEnum($entry['condition'] ?? null, ['mint', 'good', 'fair', 'poor'], 'good'),
                    'acquired_at' => $entry['acquired_at'] ?? null,
                    'notes' => is_string($entry['notes'] ?? null) ? $entry['notes'] : null,
                    'personal_rating' => is_numeric($entry['personal_rating'] ?? null) ? (int) $entry['personal_rating'] : null,
                    'personal_review' => is_string($entry['personal_review'] ?? null) ? $entry['personal_review'] : null,
                ]);

                $seenVolumeNumbers = [];

                foreach (($entry['volumes'] ?? []) as $volumeData) {
                    $volumeNumber = $volumeData['volume_number'] ?? null;

                    if (! is_numeric($volumeNumber) || in_array((int) $volumeNumber, $seenVolumeNumbers, true)) {
                        continue;
                    }

                    $seenVolumeNumbers[] = (int) $volumeNumber;

                    $collection->collectionVolumes()->create([
                        'volume_number' => (int) $volumeNumber,
                        'format' => $this->sanitizeEnum($volumeData['format'] ?? null, ['physical', 'ebook', 'online', 'webtoon'], 'physical'),
                        'ebook_source' => $this->sanitizeEnum($volumeData['ebook_source'] ?? null, ['bookwalker', 'amazon', 'local_epub'], null),
                        'language' => $this->sanitizeEnum($volumeData['language'] ?? null, ['id', 'en', 'ja', 'other'], null),
                        'read_at' => is_string($volumeData['read_at'] ?? null) ? $volumeData['read_at'] : null,
                    ]);
                }

                $ownedSeriesIds[] = $series->id;
                $imported++;
            }

            DB::commit();
        } catch (\Throwable $e) {
            DB::rollBack();
            report($e);

            return redirect()->back()->with('error', __('flash.collections.import_failed'));
        }

        ActivityLog::record(
            'collection.import',
            "{$user->name} imported {$imported} series into the collection (skipped {$skippedExisting} already owned, {$skippedNotFound} not in the catalog).",
            $user,
        );

        return redirect()->back()->with('success', __('flash.collections.imported', [
            'count' => $imported,
            'skipped' => $skippedExisting + $skippedNotFound,
        ]));
    }

    private function matchSeriesForImport(array $seriesData): ?Series
    {
        foreach (['anilist_id', 'ranobedb_id', 'mal_id'] as $key) {
            if (! empty($seriesData[$key])) {
                $series = Series::where($key, $seriesData[$key])->first();
                if ($series) {
                    return $series;
                }
            }
        }

        if (! empty($seriesData['slug'])) {
            return Series::where('slug', $seriesData['slug'])->first();
        }

        return null;
    }

    private function sanitizeEnum(mixed $value, array $allowed, ?string $default): ?string
    {
        return in_array($value, $allowed, true) ? $value : $default;
    }

    public function store(Request $request): RedirectResponse
    {
        $this->authorize('create', Collection::class);

        $request->validate([
            'series_ids' => ['required', 'array', 'min:1'],
            'series_ids.*' => ['uuid', 'exists:series,id'],
        ]);

        $user = auth()->user();
        $existingIds = $user->collections()->pluck('series_id')->toArray();

        $added = 0;
        $skipped = 0;
        $createdIds = [];

        foreach ($request->series_ids as $seriesId) {
            if (in_array($seriesId, $existingIds)) {
                $skipped++;

                continue;
            }
            $collection = $user->collections()->create(['series_id' => $seriesId]);
            $createdIds[] = $collection->id;
            $user->wishlistItems()->where('series_id', $seriesId)->delete();
            $added++;
        }

        if ($added === 0) {
            return redirect()->back()
                ->with('info', __('flash.collections.already_added'));
        }

        $msg = $skipped > 0
            ? __('flash.collections.added_with_skipped', ['count' => $added, 'skipped' => $skipped])
            : __('flash.collections.added', ['count' => $added]);

        ActivityLog::record('collection.add', "{$user->name} added {$added} series to the collection.", $user);

        return redirect()->back()->with([
            'success' => $msg,
            'undo_url' => route('collection.undo-store'),
            'undo_payload' => ['collection_ids' => $createdIds],
        ]);
    }

    public function undoStore(Request $request): RedirectResponse
    {
        $request->validate([
            'collection_ids' => ['required', 'array', 'min:1'],
            'collection_ids.*' => ['uuid'],
        ]);

        $user = auth()->user();
        $count = $user->collections()->whereIn('id', $request->collection_ids)->delete();

        ActivityLog::record('collection.undo_add', "{$user->name} undid adding {$count} series to the collection.", $user);

        return redirect()->back()->with('success', __('flash.collections.undo_added', ['count' => $count]));
    }

    public function show(Collection $collection): Response
    {
        $this->authorize('view', $collection);

        $series = $collection->series;

        $collectionVolumes = $collection->collectionVolumes()
            ->with(['activeLoans'])
            ->orderBy('volume_number')
            ->get()
            ->map(fn ($cv) => [
                'id' => $cv->id,
                'volume_number' => $cv->volume_number,
                'format' => $cv->format,
                'ebook_source' => $cv->ebook_source,
                'language' => $cv->language,
                'read_at' => $cv->read_at?->toIso8601String(),
                'active_loan' => $cv->activeLoans->first() ? [
                    'id' => $cv->activeLoans->first()->id,
                    'borrower_name' => $cv->activeLoans->first()->borrower_name,
                    'loaned_at' => $cv->activeLoans->first()->loaned_at?->toDateString(),
                    'due_at' => $cv->activeLoans->first()->due_at?->toDateString(),
                    'is_overdue' => $cv->activeLoans->first()->isOverdue(),
                ] : null,
            ]);

        $lastReadVolume = $collectionVolumes->filter(fn ($cv) => $cv['read_at'] !== null)
            ->max('volume_number');

        return Inertia::render('User/Collection/Show', [
            'collection' => [
                'id' => $collection->id,
                'series_id' => $collection->series_id,
                'condition' => $collection->condition,
                'personal_rating' => $collection->personal_rating,
                'personal_review' => $collection->personal_review,
            ],
            'series' => [
                ...$series->only([
                    'id', 'slug', 'title_romaji', 'title_english', 'status', 'type', 'total_volumes', 'is_adult',
                ]),
                'genres' => $series->genres ?? [],
                'themes' => $series->themes ?? [],
                'demographics' => $series->demographics ?? [],
                'cover_url' => $this->storage->url($series->cover_path),
            ],
            'volumes' => $collectionVolumes,
            'last_read_volume' => $lastReadVolume,
        ]);
    }

    public function destroy(Collection $collection): RedirectResponse
    {
        $this->authorize('delete', $collection);

        $payload = [
            'series_id' => $collection->series_id,
            'condition' => $collection->condition,
            'personal_rating' => $collection->personal_rating,
            'personal_review' => $collection->personal_review,
            'volumes' => $collection->collectionVolumes()->get([
                'volume_number', 'format', 'ebook_source', 'language', 'read_at',
            ])->map->only(['volume_number', 'format', 'ebook_source', 'language', 'read_at'])->all(),
        ];

        $seriesTitle = $collection->series->title_romaji;
        $collection->delete();

        ActivityLog::record('collection.remove', auth()->user()->name." removed \"{$seriesTitle}\" from the collection.", auth()->user());

        return redirect()->route('collection.index')->with([
            'success' => __('flash.collections.deleted'),
            // Note: the loan (Loan) history of volumes in this collection is not restored by undo.
            'undo_url' => route('collection.undo-destroy'),
            'undo_payload' => $payload,
        ]);
    }

    public function undoDestroy(Request $request): RedirectResponse
    {
        $request->validate([
            'series_id' => ['required', 'uuid', 'exists:series,id'],
            'condition' => ['nullable', 'string'],
            'personal_rating' => ['nullable', 'integer'],
            'personal_review' => ['nullable', 'string'],
            'volumes' => ['array'],
        ]);

        $user = auth()->user();

        if ($user->collections()->where('series_id', $request->series_id)->exists()) {
            return redirect()->back()->with('info', __('flash.collections.already_restored'));
        }

        // array_filter drops keys whose value is null so the DB column defaults (e.g. condition) are still
        // used. Otherwise Eloquent would insert NULL explicitly and violate NOT NULL.
        $attributes = array_filter($request->only([
            'series_id', 'condition', 'personal_rating', 'personal_review',
        ]), fn ($value) => $value !== null);

        $collection = $user->collections()->create($attributes);

        foreach ($request->input('volumes', []) as $volume) {
            $collection->collectionVolumes()->create(array_filter($volume, fn ($value) => $value !== null));
        }

        ActivityLog::record('collection.undo_remove', "{$user->name} restored the deleted collection.", $user);

        return redirect()->back()->with('success', __('flash.collections.restored'));
    }

    public function updateCondition(Request $request, Collection $collection): RedirectResponse
    {
        $this->authorize('update', $collection);

        $request->validate([
            'condition' => ['required', Rule::in(['mint', 'good', 'fair', 'poor'])],
        ]);

        $collection->update(['condition' => $request->condition]);

        ActivityLog::record('collection.update_condition', auth()->user()->name." changed the condition of collection \"{$collection->series->title_romaji}\" to {$request->condition}.", auth()->user());

        return redirect()->back()->with('success', __('flash.collections.condition_updated'));
    }

    public function storeVolumes(Request $request, Collection $collection): RedirectResponse
    {
        $this->authorize('update', $collection);

        $request->validate([
            'volumes' => ['required', 'string'],
            'format' => ['required', Rule::in(['physical', 'ebook', 'online', 'webtoon'])],
            'ebook_source' => ['nullable', 'required_if:format,ebook', Rule::in(['bookwalker', 'amazon', 'local_epub'])],
            'language' => ['nullable', Rule::in(['id', 'en', 'ja', 'other'])],
        ]);

        $numbers = collect(explode(',', $request->volumes))
            ->flatMap(function (string $segment): array {
                $segment = trim($segment);
                if (str_contains($segment, '-')) {
                    [$a, $b] = array_map('intval', explode('-', $segment, 2));
                    if ($a > $b) {
                        [$a, $b] = [$b, $a];
                    }

                    return $a > 0 ? range($a, $b) : [];
                }
                $n = (int) $segment;

                return $n > 0 ? [$n] : [];
            })
            ->unique()
            ->sort()
            ->values();

        if ($numbers->isEmpty()) {
            return redirect()->back()->with('error', __('flash.collections.volumes_invalid_number'));
        }

        if ($numbers->count() > 100) {
            return redirect()->back()->with('error', __('flash.collections.volumes_too_many'));
        }

        $existing = $collection->collectionVolumes()->pluck('volume_number')->toArray();

        $created = 0;
        $skipped = 0;

        foreach ($numbers as $number) {
            if (in_array($number, $existing)) {
                $skipped++;

                continue;
            }
            $collection->collectionVolumes()->create([
                'volume_number' => $number,
                'format' => $request->format,
                'ebook_source' => $request->format === 'ebook' ? $request->ebook_source : null,
                'language' => $request->language,
            ]);
            $created++;
        }

        $message = match (true) {
            $created > 0 && $skipped > 0 => __('flash.collections.volumes_added_with_skipped', ['count' => $created, 'skipped' => $skipped]),
            $created > 0 => __('flash.collections.volumes_added', ['count' => $created]),
            default => __('flash.collections.volumes_all_existing'),
        };

        if ($created > 0) {
            ActivityLog::record(
                'collection.volumes.add',
                auth()->user()->name." added {$created} volumes to \"{$collection->series->title_romaji}\".",
                $collection,
            );
        }

        return redirect()->back()->with($created > 0 ? 'success' : 'info', $message);
    }

    public function updateVolumeFormat(Request $request, Collection $collection, CollectionVolume $collectionVolume): RedirectResponse
    {
        $this->authorize('update', $collection);

        abort_if($collectionVolume->collection_id !== $collection->id, 403);

        $request->validate([
            'format' => ['required', Rule::in(['physical', 'ebook', 'online', 'webtoon'])],
            'ebook_source' => ['nullable', 'required_if:format,ebook', Rule::in(['bookwalker', 'amazon', 'local_epub'])],
            'language' => ['nullable', Rule::in(['id', 'en', 'ja', 'other'])],
        ]);

        $collectionVolume->update([
            'format' => $request->format,
            'ebook_source' => $request->format === 'ebook' ? $request->ebook_source : null,
            'language' => $request->language,
        ]);

        ActivityLog::record(
            'collection.volumes.update_format',
            auth()->user()->name." changed the format of volume {$collectionVolume->volume_number} to {$request->format}.",
            $collectionVolume,
        );

        return redirect()->back()->with('success', __('flash.collections.volume_format_updated', ['number' => $collectionVolume->volume_number]));
    }

    public function updateVolumesFormat(Request $request, Collection $collection): RedirectResponse
    {
        $this->authorize('update', $collection);

        $request->validate([
            'volume_ids' => ['required', 'array', 'min:1'],
            'volume_ids.*' => ['uuid'],
            'format' => ['required', Rule::in(['physical', 'ebook', 'online', 'webtoon'])],
            'ebook_source' => ['nullable', 'required_if:format,ebook', Rule::in(['bookwalker', 'amazon', 'local_epub'])],
            'language' => ['nullable', Rule::in(['id', 'en', 'ja', 'other'])],
        ]);

        $updated = $collection->collectionVolumes()
            ->whereIn('id', $request->volume_ids)
            ->update([
                'format' => $request->format,
                'ebook_source' => $request->format === 'ebook' ? $request->ebook_source : null,
                'language' => $request->language,
            ]);

        ActivityLog::record(
            'collection.volumes.bulk_update_format',
            auth()->user()->name." changed the format of {$updated} volumes to {$request->format}.",
            $collection,
        );

        return redirect()->back()->with('success', __('flash.collections.volumes_format_bulk_updated', ['count' => $updated]));
    }

    public function destroyVolume(Collection $collection, CollectionVolume $collectionVolume): RedirectResponse
    {
        $this->authorize('update', $collection);

        abort_if($collectionVolume->collection_id !== $collection->id, 403);

        $payload = $collectionVolume->only(['volume_number', 'format', 'ebook_source', 'language', 'read_at']);
        $volumeNumber = $collectionVolume->volume_number;
        $collectionVolume->delete();

        ActivityLog::record(
            'collection.volumes.remove',
            auth()->user()->name." removed volume {$volumeNumber} from \"{$collection->series->title_romaji}\".",
            $collection,
        );

        return redirect()->back()->with([
            'success' => __('flash.collections.volume_deleted'),
            // Note: the loan (Loan) history of this volume is not restored by undo.
            'undo_url' => route('collection.volumes.restore', $collection->id),
            'undo_payload' => ['volumes' => [$payload]],
        ]);
    }

    public function destroyVolumes(Request $request, Collection $collection): RedirectResponse
    {
        $this->authorize('update', $collection);

        $request->validate([
            'volume_ids' => ['required', 'array', 'min:1'],
            'volume_ids.*' => ['uuid'],
        ]);

        $volumes = $collection->collectionVolumes()
            ->whereIn('id', $request->volume_ids)
            ->get(['volume_number', 'format', 'ebook_source', 'language', 'read_at'])
            ->map->only(['volume_number', 'format', 'ebook_source', 'language', 'read_at'])
            ->all();

        $deleted = $collection->collectionVolumes()
            ->whereIn('id', $request->volume_ids)
            ->delete();

        ActivityLog::record(
            'collection.volumes.bulk_remove',
            auth()->user()->name." removed {$deleted} volumes from \"{$collection->series->title_romaji}\".",
            $collection,
        );

        return redirect()->back()->with([
            'success' => __('flash.collections.volumes_bulk_deleted', ['count' => $deleted]),
            // Note: the loan (Loan) history of these volumes is not restored by undo.
            'undo_url' => route('collection.volumes.restore', $collection->id),
            'undo_payload' => ['volumes' => $volumes],
        ]);
    }

    public function restoreVolumes(Request $request, Collection $collection): RedirectResponse
    {
        $this->authorize('update', $collection);

        $request->validate([
            'volumes' => ['required', 'array', 'min:1'],
        ]);

        $existing = $collection->collectionVolumes()->pluck('volume_number')->all();
        $restored = 0;

        foreach ($request->volumes as $volume) {
            if (in_array($volume['volume_number'], $existing, true)) {
                continue;
            }
            $collection->collectionVolumes()->create(array_filter($volume, fn ($value) => $value !== null));
            $restored++;
        }

        ActivityLog::record(
            'collection.volumes.undo_remove',
            auth()->user()->name." restored {$restored} volumes in \"{$collection->series->title_romaji}\".",
            $collection,
        );

        return redirect()->back()->with('success', __('flash.collections.volumes_restored', ['count' => $restored]));
    }

    public function toggleVolumeRead(Collection $collection, CollectionVolume $collectionVolume): RedirectResponse
    {
        $this->authorize('update', $collection);

        abort_if($collectionVolume->collection_id !== $collection->id, 403);

        $nowRead = ! $collectionVolume->read_at;

        $collectionVolume->update([
            'read_at' => $nowRead ? now() : null,
        ]);

        ActivityLog::record(
            'collection.volumes.toggle_read',
            auth()->user()->name.' marked volume '.$collectionVolume->volume_number.($nowRead ? ' as read.' : ' as unread.'),
            $collectionVolume,
        );

        return redirect()->back()->with([
            'success' => $nowRead
                ? __('flash.collections.volume_marked_read', ['number' => $collectionVolume->volume_number])
                : __('flash.collections.volume_marked_unread', ['number' => $collectionVolume->volume_number]),
            'undo_url' => route('collection.volumes.toggleRead', [
                'collection' => $collection->id,
                'collectionVolume' => $collectionVolume->id,
            ]),
        ]);
    }

    public function markAllVolumesRead(Collection $collection): RedirectResponse
    {
        $this->authorize('update', $collection);

        $volumeIds = $collection->collectionVolumes()->whereNull('read_at')->pluck('id');

        if ($volumeIds->isEmpty()) {
            return redirect()->back()->with('info', __('flash.collections.all_already_read'));
        }

        $collection->collectionVolumes()->whereIn('id', $volumeIds)->update(['read_at' => now()]);

        ActivityLog::record(
            'collection.volumes.mark_all_read',
            auth()->user()->name." marked {$volumeIds->count()} volumes in \"{$collection->series->title_romaji}\" as read.",
            $collection,
        );

        return redirect()->back()->with([
            'success' => __('flash.collections.marked_all_read', ['count' => $volumeIds->count()]),
            'undo_url' => route('collection.volumes.unmarkRead', $collection->id),
            'undo_payload' => ['volume_ids' => $volumeIds->values()],
        ]);
    }

    public function unmarkVolumesRead(Request $request, Collection $collection): RedirectResponse
    {
        $this->authorize('update', $collection);

        $request->validate([
            'volume_ids' => ['required', 'array', 'min:1'],
            'volume_ids.*' => ['uuid'],
        ]);

        $collection->collectionVolumes()
            ->whereIn('id', $request->volume_ids)
            ->update(['read_at' => null]);

        ActivityLog::record('collection.volumes.undo_mark_read', auth()->user()->name.' undid marking volumes as read.', $collection);

        return redirect()->back()->with('success', __('flash.collections.undo_marked_read'));
    }

    // "Reading progress" stepper: moves the read-volume boundary one step, not a manual per-volume toggle.
    // forward marks the lowest-numbered unread volume as read; backward reverts the highest-numbered
    // read volume. Deliberately leaves volumes that were marked manually out of order untouched.
    public function advanceReadProgress(Request $request, Collection $collection): RedirectResponse
    {
        $this->authorize('update', $collection);

        $request->validate([
            'direction' => ['required', Rule::in(['forward', 'backward'])],
        ]);

        if ($request->direction === 'forward') {
            $volume = $collection->collectionVolumes()->whereNull('read_at')->orderBy('volume_number')->first();

            if (! $volume) {
                return redirect()->back()->with('info', __('flash.collections.all_owned_already_read'));
            }

            $volume->update(['read_at' => now()]);
            $message = __('flash.collections.volume_marked_read', ['number' => $volume->volume_number]);
        } else {
            $volume = $collection->collectionVolumes()->whereNotNull('read_at')->orderBy('volume_number', 'desc')->first();

            if (! $volume) {
                return redirect()->back()->with('info', __('flash.collections.none_read_yet'));
            }

            $volume->update(['read_at' => null]);
            $message = __('flash.collections.volume_marked_unread', ['number' => $volume->volume_number]);
        }

        ActivityLog::record('collection.volumes.advance_read', auth()->user()->name.' '.$message, $collection);

        return redirect()->back()->with([
            'success' => $message,
            'undo_url' => route('collection.volumes.toggleRead', [
                'collection' => $collection->id,
                'collectionVolume' => $volume->id,
            ]),
        ]);
    }

    // Quick-edit of owned volume count per format. Volume numbers are shared across formats within
    // one collection (unique constraint on collection_id+volume_number), so "add" always takes the
    // next number not owned at all, not per format. "remove" deletes the highest-numbered volume
    // OF the selected format. The button is already disabled in the frontend if that volume
    // is currently on loan, but this is server-side validation as a second layer. IMPORTANT: if the
    // highest volume turns out to be on loan, the request is REJECTED (not silently falling back to the volume below it).
    // The user must always know exactly which volume gets removed, not have the system guess.
    public function quickAdjustCount(Request $request, Collection $collection): RedirectResponse
    {
        $this->authorize('update', $collection);

        $request->validate([
            'format' => ['required', Rule::in(['physical', 'ebook', 'online', 'webtoon'])],
            'direction' => ['required', Rule::in(['add', 'remove'])],
        ]);

        $format = $request->format;

        if ($request->direction === 'add') {
            $nextNumber = ($collection->collectionVolumes()->max('volume_number') ?? 0) + 1;

            $ebookSource = null;
            if ($format === 'ebook') {
                $ebookSource = $collection->collectionVolumes()
                    ->where('format', 'ebook')
                    ->whereNotNull('ebook_source')
                    ->latest('created_at')
                    ->value('ebook_source') ?? 'bookwalker';
            }

            $volume = $collection->collectionVolumes()->create([
                'volume_number' => $nextNumber,
                'format' => $format,
                'ebook_source' => $ebookSource,
            ]);

            ActivityLog::record(
                'collection.volumes.quick_add',
                auth()->user()->name." added volume {$nextNumber} ({$format}) to \"{$collection->series->title_romaji}\".",
                $collection,
            );

            return redirect()->back()->with([
                'success' => __('flash.collections.quick_volume_added', ['number' => $volume->volume_number]),
                'undo_url' => route('collection.volumes.quickCount', $collection->id),
                'undo_payload' => ['format' => $format, 'direction' => 'remove'],
            ]);
        }

        $volume = $collection->collectionVolumes()
            ->where('format', $format)
            ->orderBy('volume_number', 'desc')
            ->first();

        if (! $volume) {
            return redirect()->back()->with('info', __('flash.collections.quick_no_volume_for_format'));
        }

        if ($volume->activeLoans()->exists()) {
            return redirect()->back()->with('info', __('flash.collections.quick_top_volume_loaned'));
        }

        $payload = $volume->only(['volume_number', 'format', 'ebook_source', 'language', 'read_at']);
        $volumeNumber = $volume->volume_number;
        $volume->delete();

        ActivityLog::record(
            'collection.volumes.quick_remove',
            auth()->user()->name." removed volume {$volumeNumber} ({$format}) from \"{$collection->series->title_romaji}\".",
            $collection,
        );

        return redirect()->back()->with([
            'success' => __('flash.collections.quick_volume_deleted', ['number' => $volumeNumber]),
            'undo_url' => route('collection.volumes.restore', $collection->id),
            'undo_payload' => ['volumes' => [$payload]],
        ]);
    }

    public function updateReview(Request $request, Collection $collection): RedirectResponse
    {
        $this->authorize('update', $collection);

        $request->validate([
            'personal_rating' => ['nullable', 'integer', 'min:-10', 'max:10'],
            'personal_review' => ['nullable', 'string', 'max:2000'],
        ]);

        $collection->update([
            'personal_rating' => $request->personal_rating,
            'personal_review' => $request->personal_review,
        ]);

        ActivityLog::record(
            'collection.update_review',
            auth()->user()->name." updated the review/rating for \"{$collection->series->title_romaji}\".",
            $collection,
        );

        return redirect()->back()->with('success', __('flash.collections.review_saved'));
    }
}
