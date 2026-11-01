<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\GenreFunfact;
use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class GenreFunfactController extends Controller
{
    public function index(Request $request): Response
    {
        abort_unless($request->user()->isAdmin(), 403);

        $rows = User::query()
            ->where('role', 'user')
            ->with('genreFunfact')
            ->orderBy('name')
            ->get()
            ->map(function (User $user) {
                $funfact = $user->genreFunfact;
                $quotaMax = $funfact?->quota_override ?? GenreFunfact::DEFAULT_MANUAL_QUOTA;
                $used = $funfact?->manual_regenerate_count ?? 0;

                return [
                    'user_id' => $user->id,
                    'name' => $user->name,
                    'avatar' => $user->avatar,
                    'generated_at' => $funfact?->generated_at?->toIso8601String(),
                    'used' => $used,
                    'quota_max' => $quotaMax,
                    'quota_override' => $funfact?->quota_override,
                    'window_started_at' => $funfact?->manual_regenerate_window_started_at?->toIso8601String(),
                ];
            });

        return Inertia::render('Admin/GenreFunfacts/Index', [
            'rows' => $rows,
        ]);
    }

    public function reset(Request $request, User $user): RedirectResponse
    {
        abort_unless($request->user()->isAdmin(), 403);

        $funfact = GenreFunfact::firstOrNew(['user_id' => $user->id], ['manual_regenerate_count' => 0]);
        $funfact->manual_regenerate_count = 0;
        $funfact->manual_regenerate_window_started_at = null;
        $funfact->save();

        ActivityLog::record(
            'admin.funfact_quota.reset',
            "{$request->user()->name} reset the funfact generation quota for {$user->name}.",
            $user,
        );

        return redirect()->back()->with('success', __('flash.genre_funfacts.reset', ['name' => $user->name]));
    }

    public function override(Request $request, User $user): RedirectResponse
    {
        abort_unless($request->user()->isAdmin(), 403);

        $validated = $request->validate([
            'quota_override' => ['nullable', 'integer', 'min:0', 'max:100'],
        ]);

        $funfact = GenreFunfact::firstOrNew(['user_id' => $user->id], ['manual_regenerate_count' => 0]);
        $funfact->quota_override = $validated['quota_override'];
        $funfact->save();

        $description = $validated['quota_override'] === null
            ? "{$request->user()->name} restored the funfact quota limit of {$user->name} to default."
            : "{$request->user()->name} changed the funfact quota limit of {$user->name} to {$validated['quota_override']}x/week.";

        ActivityLog::record('admin.funfact_quota.override', $description, $user);

        return redirect()->back()->with('success', __('flash.genre_funfacts.override_updated', ['name' => $user->name]));
    }
}
