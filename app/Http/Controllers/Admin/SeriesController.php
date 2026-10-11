<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\StoreSeriesRequest;
use App\Http\Requests\Admin\UpdateSeriesRequest;
use App\Models\ActivityLog;
use App\Models\CollectionVolume;
use App\Models\Series;
use App\Models\Volume;
use App\Services\StorageSettingsService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

class SeriesController extends Controller
{
    public function __construct(private StorageSettingsService $storage) {}

    public function index(): Response|RedirectResponse
    {
        $this->authorize('viewAny', Series::class);

        $series = Series::query()
            ->when(request('search'), fn ($q, $s) => $q->searchTitle($s))
            ->when(request('status'), fn ($q, $s) => $q->where('status', $s))
            ->when(request('type'), fn ($q, $t) => $q->where('type', $t))
            ->withCount('volumes')
            ->orderByRaw('LOWER(title_romaji)')
            ->orderBy('id')
            ->paginate($this->perPage())
            ->withQueryString()
            ->through(fn ($s) => [
                'id' => $s->id,
                'slug' => $s->slug,
                'title_romaji' => $s->title_romaji,
                'title_english' => $s->title_english,
                'cover_url' => $this->storage->url($s->cover_path),
                'status' => $s->status,
                'type' => $s->type,
                'total_volumes' => $s->total_volumes,
                'volumes_count' => $s->volumes_count,
                'score' => $s->score,
            ]);

        if ($series->isEmpty() && $series->currentPage() > 1) {
            return redirect()->route('admin.series.index', [...request()->except('page'), 'page' => $series->lastPage()]);
        }

        return Inertia::render('Admin/Series/Index', [
            'series' => $series,
            'filters' => request()->only(['search', 'status', 'type', 'per_page']),
        ]);
    }

    public function create(): Response
    {
        $this->authorize('create', Series::class);

        return Inertia::render('Admin/Series/Create');
    }

    public function store(StoreSeriesRequest $request): RedirectResponse
    {
        $this->authorize('create', Series::class);

        $data = $request->validated();
        $data['cover_path'] = $this->storeCover($request->file('cover'));
        unset($data['cover']);

        $series = Series::create($data);

        ActivityLog::record('series.create', "Menambahkan series \"{$series->title_romaji}\".", $series);

        return redirect()->route('admin.series.index')
            ->with('success', __('flash.series.created'));
    }

    public function show(Request $request, Series $series): Response
    {
        $this->authorize('view', $series);

        $volumes = $series->volumes()
            ->orderBy('volume_number')
            ->get(['id', 'volume_number', 'type', 'isbn', 'published_at'])
            ->map(fn ($v) => [
                'id' => $v->id,
                'volume_number' => $v->volume_number,
                'type' => $v->type,
                'isbn' => $v->isbn,
                'published_at' => $v->published_at?->toDateString(),
            ]);

        return Inertia::render('Admin/Series/Show', [
            'series' => [
                ...$series->only([
                    'id', 'slug', 'title_romaji', 'title_english', 'title_japanese',
                    'synopsis', 'status', 'type', 'total_volumes', 'score', 'rank',
                    'genres', 'authors', 'illustrators', 'themes', 'demographics',
                ]),
                'published_from' => $series->published_from?->toDateString(),
                'published_to' => $series->published_to?->toDateString(),
                'cover_url' => $this->storage->url($series->cover_path),
            ],
            'volumes' => $volumes,
            'can' => [
                'update' => $request->user()->can('update', $series),
                'delete' => $request->user()->can('delete', $series),
                'createVolume' => $request->user()->can('create', Volume::class),
            ],
            'ownerships' => CollectionVolume::whereHas('collection', fn ($q) => $q->where('series_id', $series->id))
                ->with(['collection.user', 'activeLoans'])
                ->orderBy('volume_number')
                ->get()
                ->map(fn ($cv) => [
                    'id' => $cv->id,
                    'volume_number' => $cv->volume_number,
                    'format' => $cv->format,
                    'user_name' => $cv->collection->user->name,
                    'active_loan' => $cv->activeLoans->first()
                        ? ['borrower_name' => $cv->activeLoans->first()->borrower_name]
                        : null,
                ]),
        ]);
    }

    public function edit(Series $series): Response
    {
        $this->authorize('update', $series);

        $volumes = $series->volumes()
            ->orderBy('volume_number')
            ->get(['id', 'volume_number', 'type', 'isbn', 'published_at'])
            ->map(fn ($v) => [
                'id' => $v->id,
                'volume_number' => $v->volume_number,
                'type' => $v->type,
                'isbn' => $v->isbn,
                'published_at' => $v->published_at?->toDateString(),
            ]);

        return Inertia::render('Admin/Series/Edit', [
            'series' => [
                ...$series->only([
                    'id', 'slug', 'mal_id', 'title_romaji', 'title_english', 'title_japanese',
                    'synopsis', 'status', 'type', 'total_volumes', 'score', 'rank',
                ]),
                'published_from' => $series->published_from?->toDateString(),
                'published_to' => $series->published_to?->toDateString(),
                'cover_url' => $this->storage->url($series->cover_path),
                'genres' => $series->genres ?? [],
                'authors' => $series->authors ?? [],
                'illustrators' => $series->illustrators ?? [],
                'themes' => $series->themes ?? [],
                'demographics' => $series->demographics ?? [],
            ],
            'volumes' => $volumes,
            'media' => $series->media->map(fn ($m) => [
                'id' => $m->id,
                'image_url' => $this->storage->url($m->image_path),
                'caption' => $m->caption,
            ]),
        ]);
    }

    public function update(UpdateSeriesRequest $request, Series $series): RedirectResponse
    {
        $this->authorize('update', $series);

        $data = $request->validated();

        // Frontend selalu kirim genres[]/authors[]/dll (bahkan pas kosong, isinya string kosong
        // sebagai sentinel) supaya Laravel nggak skip key-nya sama sekali — kalau key nggak ada,
        // update() nggak akan nyentuh kolomnya, jadi tag lama yang sengaja dihapus admin malah
        // nggak kehapus. Sentinel string kosong dibuang di sini sebelum disimpan — middleware
        // global ConvertEmptyStringsToNull sudah ngubah '' jadi null duluan sebelum validasi,
        // jadi filter di sini harus buang null juga, bukan cuma ''.
        foreach (['genres', 'authors', 'illustrators', 'themes', 'demographics'] as $tagField) {
            if (array_key_exists($tagField, $data)) {
                $data[$tagField] = array_values(array_filter($data[$tagField], fn ($v) => $v !== '' && $v !== null));
            }
        }

        if ($request->hasFile('cover')) {
            if ($series->cover_path) {
                $this->storage->delete($series->cover_path);
            }
            $data['cover_path'] = $this->storeCover($request->file('cover'));
        } elseif ($request->filled('cover_url')) {
            $fetched = $this->fetchCoverFromUrl($request->cover_url);
            if (! $fetched) {
                throw ValidationException::withMessages([
                    'cover_url' => 'Cover dari URL itu gagal diunduh. Periksa URL-nya atau unggah file langsung.',
                ]);
            }
            if ($series->cover_path) {
                $this->storage->delete($series->cover_path);
            }
            $data['cover_path'] = $fetched;
        }

        unset($data['cover'], $data['cover_url']);
        $series->update($data);

        $changed = collect(array_keys($series->getChanges()))->reject(fn ($k) => $k === 'updated_at')->values();
        ActivityLog::record(
            'series.update',
            "Mengubah series \"{$series->title_romaji}\"".($changed->isNotEmpty() ? ' ('.$changed->implode(', ').')' : ' (tanpa perubahan data)').'.',
            $series,
        );

        return redirect()->route('admin.series.show', $series)
            ->with('success', __('flash.series.updated'));
    }

    public function destroy(Series $series): RedirectResponse
    {
        $this->authorize('delete', $series);

        $id = $series->id;
        ActivityLog::record('series.delete', "Menghapus series \"{$series->title_romaji}\".", $series);
        $series->delete();

        return $this->indexRedirect()->with([
            'success' => __('flash.series.deleted'),
            'undo_url' => route('admin.series.restore', $id),
        ]);
    }

    public function bulkDestroy(Request $request): RedirectResponse
    {
        $request->validate([
            'ids' => ['required', 'array', 'min:1'],
            'ids.*' => ['uuid', 'exists:series,id'],
        ]);

        $series = Series::whereIn('id', $request->ids)->get();

        foreach ($series as $s) {
            $this->authorize('delete', $s);
        }

        $count = $series->count();
        $titles = $series->pluck('title_romaji')->implode(', ');
        ActivityLog::record('series.bulk_delete', "Menghapus {$count} series sekaligus: {$titles}.");
        Series::whereIn('id', $request->ids)->delete();

        return $this->indexRedirect()->with([
            'success' => __('flash.series.bulk_deleted', ['count' => $count]),
            'undo_url' => route('admin.series.restore-bulk'),
            'undo_payload' => ['ids' => $request->ids],
        ]);
    }

    public function restore(string $id): RedirectResponse
    {
        $series = Series::withTrashed()->findOrFail($id);

        $this->authorize('delete', $series);

        $series->restore();
        ActivityLog::record('series.restore', "Memulihkan series \"{$series->title_romaji}\".", $series);

        return redirect()->back()->with('success', __('flash.series.restored'));
    }

    public function restoreBulk(Request $request): RedirectResponse
    {
        $request->validate([
            'ids' => ['required', 'array', 'min:1'],
            'ids.*' => ['uuid'],
        ]);

        $series = Series::withTrashed()->whereIn('id', $request->ids)->get();

        foreach ($series as $s) {
            $this->authorize('delete', $s);
        }

        Series::withTrashed()->whereIn('id', $request->ids)->restore();
        ActivityLog::record('series.bulk_restore', "Memulihkan {$series->count()} series sekaligus.");

        return redirect()->back()->with('success', __('flash.series.bulk_restored', ['count' => $series->count()]));
    }

    /**
     * Setelah hapus: kembali ke daftar yang sedang dibuka admin (halaman, pencarian, dan filter
     * tetap), bukan ke halaman 1. Kalau hapus dilakukan dari halaman lain (mis. detail series),
     * ke daftar biasa. Hanya URL daftar series sendiri yang diterima dari Referer.
     */
    private function indexRedirect(): RedirectResponse
    {
        $index = route('admin.series.index');
        $previous = url()->previous();
        $stay = $previous === $index || str_starts_with($previous, $index.'?');

        return redirect($stay ? $previous : $index);
    }

    private function storeCover(?UploadedFile $file): ?string
    {
        return $file ? $this->storage->storeUploadedFile($file, 'covers') : null;
    }

    private function fetchCoverFromUrl(string $url): ?string
    {
        try {
            $response = Http::timeout(20)->get($url);
            if (! $response->successful()) {
                return null;
            }

            $ext = pathinfo(parse_url($url, PHP_URL_PATH), PATHINFO_EXTENSION) ?: 'jpg';

            return $this->storage->storeContents('covers', 'url_'.uniqid().'.'.$ext, $response->body());
        } catch (\Exception) {
            return null;
        }
    }
}
