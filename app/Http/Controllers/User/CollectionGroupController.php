<?php

namespace App\Http\Controllers\User;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\Collection;
use App\Models\CollectionGroup;
use App\Services\StorageSettingsService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class CollectionGroupController extends Controller
{
    public function __construct(private StorageSettingsService $storage) {}

    public function index(): Response
    {
        $groups = auth()->user()->collectionGroups()
            ->withCount('collections')
            ->with(['collections.series' => fn ($q) => $q->select('id', 'title_romaji', 'cover_path')])
            ->latest()
            ->get()
            ->map(fn ($g) => [
                'id' => $g->id,
                'slug' => $g->slug,
                'name' => $g->name,
                'is_public' => $g->is_public,
                'items_count' => $g->collections_count,
                'cover_urls' => $g->collections
                    ->take(4)
                    ->map(fn ($c) => $this->storage->url($c->series->cover_path))
                    ->filter()
                    ->values(),
            ]);

        return Inertia::render('User/CollectionGroups/Index', [
            'groups' => $groups,
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $this->authorize('create', CollectionGroup::class);

        $request->validate([
            'name' => ['required', 'string', 'max:100'],
        ]);

        $group = auth()->user()->collectionGroups()->create(['name' => $request->name]);

        ActivityLog::record('collection_group.create', auth()->user()->name." membuat grup koleksi \"{$group->name}\".", $group);

        return redirect()->route('collection.groups.show', $group->slug)->with('success', __('flash.collection_groups.created'));
    }

    public function show(Request $request, CollectionGroup $group): Response
    {
        $viewer = $request->user();
        $isOwner = $viewer?->id === $group->user_id;

        abort_unless($group->is_public || $isOwner || $viewer?->isAdmin(), 403);

        $items = $group->collections()
            ->with('series')
            ->get()
            ->map(fn ($c) => [
                'id' => $c->id,
                'slug' => $c->series->slug,
                'title_romaji' => $c->series->title_romaji,
                'title_english' => $c->series->title_english,
                'cover_url' => $this->storage->url($c->series->cover_path),
                'status' => $c->series->status,
                'type' => $c->series->type,
                'is_adult' => $c->series->is_adult,
            ]);

        $search = trim((string) $request->get('q', ''));
        $type = (string) $request->get('type', 'all');
        $available = null;

        if ($isOwner) {
            $existingIds = $group->collections()->pluck('collections.id');

            $available = auth()->user()->collections()
                ->with('series')
                ->whereNotIn('collections.id', $existingIds)
                ->when($search !== '', fn ($q) => $q->whereHas('series', fn ($s) => $s->searchTitle($search)))
                ->when($type !== 'all', fn ($q) => $q->whereHas('series', fn ($s) => $s->where('type', $type)))
                ->join('series', 'series.id', '=', 'collections.series_id')
                ->orderBy('series.title_romaji')
                ->select('collections.*')
                ->paginate(24)
                ->withQueryString()
                ->through(fn ($c) => [
                    'id' => $c->id,
                    'title_romaji' => $c->series->title_romaji,
                    'cover_url' => $this->storage->url($c->series->cover_path),
                    'type' => $c->series->type,
                ]);
        }

        return Inertia::render('User/CollectionGroups/Show', [
            'group' => [
                'id' => $group->id,
                'slug' => $group->slug,
                'name' => $group->name,
                'is_public' => $group->is_public,
            ],
            'items' => $items,
            'available' => $available,
            'is_owner' => $isOwner,
            'is_guest' => $viewer === null,
            'filters' => ['q' => $search, 'type' => $type],
        ]);
    }

    public function update(Request $request, CollectionGroup $group): RedirectResponse
    {
        $this->authorize('update', $group);

        $request->validate([
            'name' => ['required', 'string', 'max:100'],
        ]);

        $group->update(['name' => $request->name]);

        ActivityLog::record('collection_group.rename', auth()->user()->name." mengubah nama grup koleksi jadi \"{$group->name}\".", $group);

        return redirect()->route('collection.groups.show', $group->slug)->with('success', __('flash.collection_groups.renamed'));
    }

    public function updateVisibility(Request $request, CollectionGroup $group): RedirectResponse
    {
        $this->authorize('update', $group);

        $request->validate([
            'is_public' => ['required', 'boolean'],
        ]);

        $group->update(['is_public' => $request->boolean('is_public')]);

        $key = $request->boolean('is_public') ? 'flash.collection_groups.made_public' : 'flash.collection_groups.made_private';

        ActivityLog::record(
            'collection_group.visibility',
            auth()->user()->name.' mengubah visibilitas grup koleksi "'.$group->name.'" jadi '.($request->boolean('is_public') ? 'publik' : 'privat').'.',
            $group,
        );

        return redirect()->back()->with('success', __($key));
    }

    public function destroy(CollectionGroup $group): RedirectResponse
    {
        $this->authorize('delete', $group);

        $name = $group->name;
        $group->delete();

        ActivityLog::record('collection_group.delete', auth()->user()->name." menghapus grup koleksi \"{$name}\".");

        return redirect()->route('collection.groups.index')->with('success', __('flash.collection_groups.deleted'));
    }

    public function addItems(Request $request, CollectionGroup $group): RedirectResponse
    {
        $this->authorize('update', $group);

        $request->validate([
            'collection_ids' => ['required', 'array', 'min:1'],
            'collection_ids.*' => ['uuid'],
        ]);

        // Wajib validasi collection_ids beneran milik user ini — jangan pernah percaya ID dari
        // client mentah-mentah, atau user bisa nge-link koleksi orang lain ke grupnya.
        $validIds = auth()->user()->collections()->whereIn('id', $request->collection_ids)->pluck('id');

        $group->collections()->syncWithoutDetaching($validIds);

        ActivityLog::record(
            'collection_group.add_items',
            auth()->user()->name." menambahkan {$validIds->count()} manga ke grup \"{$group->name}\".",
            $group,
        );

        return redirect()->back()->with('success', __('flash.collection_groups.items_added', ['count' => $validIds->count()]));
    }

    public function removeItem(CollectionGroup $group, Collection $collection): RedirectResponse
    {
        $this->authorize('update', $group);
        abort_if($collection->user_id !== auth()->id(), 403);

        $group->collections()->detach($collection->id);

        ActivityLog::record(
            'collection_group.remove_item',
            auth()->user()->name." menghapus \"{$collection->series->title_romaji}\" dari grup \"{$group->name}\".",
            $group,
        );

        return redirect()->back()->with([
            'success' => __('flash.collection_groups.item_removed'),
            // Cuma detach pivot (bukan hard-delete Collection-nya), jadi undo-nya simpel: re-attach.
            'undo_url' => route('collection.groups.items.undoRemove', $group->slug),
            'undo_payload' => ['collection_id' => $collection->id],
        ]);
    }

    public function undoRemoveItem(Request $request, CollectionGroup $group): RedirectResponse
    {
        $this->authorize('update', $group);

        $request->validate([
            'collection_id' => ['required', 'uuid'],
        ]);

        $validId = auth()->user()->collections()->where('id', $request->collection_id)->value('id');

        if (! $validId) {
            return redirect()->back()->with('error', __('flash.collection_groups.item_restore_failed'));
        }

        $group->collections()->syncWithoutDetaching([$validId]);

        ActivityLog::record(
            'collection_group.undo_remove_item',
            auth()->user()->name." membatalkan penghapusan manga dari grup \"{$group->name}\".",
            $group,
        );

        return redirect()->back()->with('success', __('flash.collection_groups.item_restored'));
    }
}
