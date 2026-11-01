<?php

namespace App\Http\Controllers\User;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\Series;
use App\Models\WishlistItem;
use App\Services\StorageSettingsService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class WishlistController extends Controller
{
    public function __construct(private StorageSettingsService $storage) {}

    public function index(): Response
    {
        $items = auth()->user()
            ->wishlistItems()
            ->with('series')
            ->latest()
            ->get()
            ->map(fn ($item) => [
                'id' => $item->id,
                'series_id' => $item->series_id,
                'series_slug' => $item->series->slug,
                'title_romaji' => $item->series->title_romaji,
                'title_english' => $item->series->title_english,
                'cover_url' => $this->storage->url($item->series->cover_path),
                'status' => $item->series->status,
                'type' => $item->series->type,
                'genres' => $item->series->genres ?? [],
            ]);

        return Inertia::render('User/Wishlist/Index', [
            'items' => $items,
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $request->validate([
            'series_id' => ['required', 'uuid', 'exists:series,id'],
        ]);

        $user = auth()->user();

        $alreadyOwned = $user->collections()->where('series_id', $request->series_id)->exists();
        if ($alreadyOwned) {
            return redirect()->back()->with('info', __('flash.wishlist.already_owned'));
        }

        $user->wishlistItems()->firstOrCreate(['series_id' => $request->series_id]);

        $title = Series::find($request->series_id)?->title_romaji ?? $request->series_id;
        ActivityLog::record('wishlist.add', "{$user->name} added \"{$title}\" to the wishlist.", $user);

        return redirect()->back()->with('success', __('flash.wishlist.added'));
    }

    public function destroy(WishlistItem $wishlistItem): RedirectResponse
    {
        abort_if($wishlistItem->user_id !== auth()->id(), 403);

        $seriesId = $wishlistItem->series_id;
        $title = $wishlistItem->series->title_romaji ?? $seriesId;
        $wishlistItem->delete();

        ActivityLog::record('wishlist.remove', auth()->user()->name." removed \"{$title}\" from the wishlist.", auth()->user());

        return redirect()->back()->with([
            'success' => __('flash.wishlist.deleted'),
            'undo_url' => route('wishlist.restore'),
            'undo_payload' => ['series_id' => $seriesId],
        ]);
    }

    public function restore(Request $request): RedirectResponse
    {
        $request->validate([
            'series_id' => ['required', 'uuid', 'exists:series,id'],
        ]);

        auth()->user()->wishlistItems()->firstOrCreate(['series_id' => $request->series_id]);

        ActivityLog::record('wishlist.undo_remove', auth()->user()->name.' restored a wishlist item.', auth()->user());

        return redirect()->back()->with('success', __('flash.wishlist.restored'));
    }
}
