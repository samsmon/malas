<?php

namespace App\Http\Controllers\User;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\Collection;
use App\Models\CollectionVolume;
use App\Models\Loan;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class LoanController extends Controller
{
    public function index(): Response
    {
        $user = auth()->user();

        $collectionIds = $user->collections()->pluck('id');

        $loans = Loan::whereIn('collection_id', $collectionIds)
            ->with(['collection.series', 'collectionVolume'])
            ->latest('loaned_at')
            ->paginate($this->perPage())
            ->withQueryString()
            ->through(fn ($l) => [
                'id' => $l->id,
                'collection_id' => $l->collection_id,
                'series_slug' => $l->collection->series->slug,
                'series_title' => $l->collection->series->title_romaji,
                'volume_number' => $l->collectionVolume?->volume_number,
                'borrower_name' => $l->borrower_name,
                'loaned_at' => $l->loaned_at?->toDateString(),
                'due_at' => $l->due_at?->toDateString(),
                'returned_at' => $l->returned_at?->toDateString(),
                'notes' => $l->notes,
                'is_overdue' => $l->isOverdue(),
            ]);

        return Inertia::render('User/Loans/Index', [
            'loans' => $loans,
        ]);
    }

    public function store(Request $request, Collection $collection): RedirectResponse
    {
        $this->authorize('update', $collection);

        $data = $request->validate([
            'collection_volume_id' => ['required', 'uuid', 'exists:collection_volumes,id'],
            'borrower_name' => ['required', 'string', 'max:255'],
            'loaned_at' => ['required', 'date'],
            'due_at' => ['nullable', 'date', 'after:loaned_at'],
            'notes' => ['nullable', 'string', 'max:1000'],
        ]);

        $cv = CollectionVolume::findOrFail($data['collection_volume_id']);
        abort_if($cv->collection_id !== $collection->id, 403, 'This volume is not in the collection.');

        $alreadyLoaned = $cv->activeLoans()->exists();

        if ($alreadyLoaned) {
            return redirect()->back()->with('error', __('flash.loans.already_loaned'));
        }

        $loan = Loan::create([
            ...$data,
            'collection_id' => $collection->id,
        ]);

        ActivityLog::record(
            'loan.create',
            auth()->user()->name." recorded a loan of volume {$cv->volume_number} to {$data['borrower_name']}.",
            $loan,
        );

        return redirect()->back()->with('success', __('flash.loans.recorded'));
    }

    public function markReturned(Loan $loan): RedirectResponse
    {
        $this->authorize('update', $loan);

        $loan->update(['returned_at' => now()->toDateString()]);

        ActivityLog::record(
            'loan.mark_returned',
            auth()->user()->name." marked the loan to {$loan->borrower_name} as returned.",
            $loan,
        );

        return redirect()->back()->with('success', __('flash.loans.marked_returned'));
    }
}
