<?php

namespace App\Http\Controllers\User;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreTicketRequest;
use App\Models\ActivityLog;
use App\Models\Series;
use App\Models\Ticket;
use App\Services\StorageSettingsService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class TicketController extends Controller
{
    private const MAX_ACTIVE_TICKETS = 2;

    public function __construct(private StorageSettingsService $storage) {}

    public function index(): Response
    {
        $tickets = auth()->user()
            ->tickets()
            ->with('series:id,slug,title_romaji')
            ->latest()
            ->paginate($this->perPage(15))
            ->withQueryString()
            ->through(fn ($t) => [
                'id' => $t->id,
                'subject' => $t->subject,
                'type' => $t->type,
                'status' => $t->status,
                'series' => $t->series ? ['id' => $t->series->id, 'slug' => $t->series->slug, 'title_romaji' => $t->series->title_romaji] : null,
                'created_at' => $t->created_at->toDateString(),
            ]);

        return Inertia::render('User/Tickets/Index', [
            'tickets' => $tickets,
        ]);
    }

    public function create(Request $request): Response
    {
        $this->authorize('create', Ticket::class);

        $series = null;

        if ($request->filled('series_id')) {
            $series = Series::query()
                ->select(['id', 'title_romaji', 'cover_path'])
                ->find($request->series_id);
        }

        $activeCount = $this->activeTicketsCount();

        return Inertia::render('User/Tickets/Create', [
            'series' => $series ? [
                'id' => $series->id,
                'title_romaji' => $series->title_romaji,
                'cover_url' => $this->storage->url($series->cover_path),
            ] : null,
            'activeTicketsCount' => $activeCount,
            'maxActiveTickets' => self::MAX_ACTIVE_TICKETS,
            'canCreate' => $activeCount < self::MAX_ACTIVE_TICKETS,
        ]);
    }

    public function store(StoreTicketRequest $request): RedirectResponse
    {
        if ($this->activeTicketsCount() >= self::MAX_ACTIVE_TICKETS) {
            return redirect()->back()->with(
                'error',
                __('flash.tickets.limit_reached', ['max' => self::MAX_ACTIVE_TICKETS])
            );
        }

        $ticket = auth()->user()->tickets()->create($request->validated());

        ActivityLog::record('ticket.create', auth()->user()->name." created ticket \"{$ticket->subject}\".", $ticket);

        return redirect()->route('tickets.index')
            ->with('success', __('flash.tickets.created'));
    }

    private function activeTicketsCount(): int
    {
        return auth()->user()->tickets()
            ->whereIn('status', ['open', 'in_progress'])
            ->count();
    }

    public function show(Ticket $ticket): Response
    {
        $this->authorize('view', $ticket);

        return Inertia::render('User/Tickets/Show', [
            'ticket' => [
                'id' => $ticket->id,
                'subject' => $ticket->subject,
                'type' => $ticket->type,
                'message' => $ticket->message,
                'status' => $ticket->status,
                'admin_response' => $ticket->admin_response,
                'responded_at' => $ticket->responded_at?->toDateTimeString(),
                'created_at' => $ticket->created_at->toDateTimeString(),
                'series' => $ticket->series ? [
                    'id' => $ticket->series->id,
                    'slug' => $ticket->series->slug,
                    'title_romaji' => $ticket->series->title_romaji,
                ] : null,
            ],
        ]);
    }
}
