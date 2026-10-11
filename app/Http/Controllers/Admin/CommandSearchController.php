<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Series;
use App\Models\Ticket;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CommandSearchController extends Controller
{
    public function search(Request $request): JsonResponse
    {
        $q = trim((string) $request->get('q', ''));

        if (mb_strlen($q) < 2) {
            return response()->json(['series' => [], 'users' => [], 'tickets' => []]);
        }

        $series = Series::query()
            ->searchTitle($q)
            ->limit(5)
            ->get(['id', 'slug', 'title_romaji'])
            ->map(fn ($s) => ['id' => $s->id, 'slug' => $s->slug, 'title' => $s->title_romaji]);

        $users = User::query()
            ->where(fn ($sub) => $sub->where('name', 'like', "%{$q}%")
                ->orWhere('email', 'like', "%{$q}%")
            )
            ->limit(5)
            ->get(['id', 'name', 'email'])
            ->map(fn ($u) => ['id' => $u->id, 'name' => $u->name, 'email' => $u->email]);

        $tickets = Ticket::query()
            ->where('subject', 'like', "%{$q}%")
            ->limit(5)
            ->get(['id', 'subject'])
            ->map(fn ($t) => ['id' => $t->id, 'subject' => $t->subject]);

        return response()->json([
            'series' => $series,
            'users' => $users,
            'tickets' => $tickets,
        ]);
    }
}
