<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\StoreVolumeRequest;
use App\Http\Requests\Admin\UpdateVolumeRequest;
use App\Models\ActivityLog;
use App\Models\Series;
use App\Models\Volume;
use Illuminate\Http\RedirectResponse;
use Inertia\Inertia;
use Inertia\Response;

class VolumeController extends Controller
{
    public function generate(Series $series): RedirectResponse
    {
        $this->authorize('create', Volume::class);

        if (! $series->total_volumes) {
            return redirect()->back()->with('error', __('flash.volumes.total_not_set'));
        }

        $existing = $series->volumes()->pluck('volume_number')->all();
        $created = 0;

        for ($i = 1; $i <= $series->total_volumes; $i++) {
            if (! in_array($i, $existing)) {
                $series->volumes()->create(['volume_number' => $i, 'type' => 'regular']);
                $created++;
            }
        }

        $message = $created > 0
            ? __('flash.volumes.generated', ['count' => $created])
            : __('flash.volumes.all_already_exist');

        return redirect()->back()->with($created > 0 ? 'success' : 'info', $message);
    }

    public function store(StoreVolumeRequest $request, Series $series): RedirectResponse
    {
        $this->authorize('create', Volume::class);

        $data = $request->validated();
        $data['series_id'] = $series->id;

        $series->volumes()->create($data);

        return redirect()->back()
            ->with('success', __('flash.volumes.created'));
    }

    public function edit(Volume $volume): Response
    {
        $this->authorize('update', $volume);

        return Inertia::render('Admin/Series/EditVolume', [
            'volume' => [
                'id' => $volume->id,
                'series_id' => $volume->series_id,
                'volume_number' => $volume->volume_number,
                'type' => $volume->type,
                'isbn' => $volume->isbn,
                'published_at' => $volume->published_at?->toDateString(),
            ],
            'series' => $volume->series->only(['id', 'slug', 'title_romaji']),
        ]);
    }

    public function update(UpdateVolumeRequest $request, Volume $volume): RedirectResponse
    {
        $this->authorize('update', $volume);

        $volume->update($request->validated());

        return redirect()->back()
            ->with('success', __('flash.volumes.updated'));
    }

    public function destroy(Volume $volume): RedirectResponse
    {
        $this->authorize('delete', $volume);

        $volumeId = $volume->id;

        ActivityLog::record(
            'volume.delete',
            "Deleted volume #{$volume->volume_number} from series \"{$volume->series->title_romaji}\".",
            $volume
        );

        $volume->delete();

        return redirect()->back()->with([
            'success' => __('flash.volumes.deleted'),
            'undo_url' => route('admin.volumes.restore', $volumeId),
        ]);
    }

    public function restore(string $volume): RedirectResponse
    {
        $volumeModel = Volume::withTrashed()->findOrFail($volume);

        $this->authorize('delete', $volumeModel);

        $volumeModel->restore();
        ActivityLog::record(
            'volume.restore',
            "Restored volume #{$volumeModel->volume_number} from series \"{$volumeModel->series->title_romaji}\"."
        );

        return redirect()->back()->with('success', __('flash.volumes.restored'));
    }
}
