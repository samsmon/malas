<?php

namespace App\Http\Controllers\User;

use App\Http\Controllers\Controller;
use App\Models\Series;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SearchController extends Controller
{
    public function search(Request $request): JsonResponse
    {
        $q = trim((string) $request->get('q', ''));

        if (mb_strlen($q) < 2) {
            return response()->json(['catalog' => [], 'collection' => []]);
        }

        $catalog = Series::query()
            ->searchTitle($q)
            ->limit(5)
            ->get(['id', 'slug', 'title_romaji'])
            ->map(fn ($s) => ['id' => $s->id, 'slug' => $s->slug, 'title' => $s->title_romaji]);

        $collection = $request->user()
            ->collections()
            ->with('series:id,slug,title_romaji')
            ->whereHas('series', fn ($sub) => $sub->searchTitle($q))
            ->limit(5)
            ->get()
            ->map(fn ($c) => ['id' => $c->id, 'slug' => $c->series->slug, 'title' => $c->series->title_romaji]);

        return response()->json([
            'catalog' => $catalog,
            'collection' => $collection,
        ]);
    }
}
