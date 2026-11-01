<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;

class UserController extends Controller
{
    public function index(): Response
    {
        $this->authorize('viewAny', User::class);

        $users = User::query()
            ->when(request('search'), fn ($q, $s) => $q->where(fn ($sub) => $sub->where('name', 'like', "%{$s}%")
                ->orWhere('email', 'like', "%{$s}%")
            ))
            ->when(request('role'), fn ($q, $r) => $q->where('role', $r))
            ->when(request('status') === 'banned', fn ($q) => $q->where('is_banned', true))
            ->when(request('status') === 'active', fn ($q) => $q->where('is_banned', false))
            ->orderBy('created_at', 'desc')
            ->paginate($this->perPage())
            ->withQueryString()
            ->through(fn ($u) => [
                'id' => $u->id,
                'name' => $u->name,
                'email' => $u->email,
                'avatar' => $u->avatar,
                'role' => $u->role,
                'is_banned' => $u->is_banned,
                'created_at' => $u->created_at->toDateString(),
            ]);

        return Inertia::render('Admin/Users/Index', [
            'users' => $users,
            'filters' => request()->only(['search', 'role', 'status']),
        ]);
    }

    public function show(Request $request, User $user): Response
    {
        $this->authorize('view', $user);

        $collectionsCount = $user->collections()->count();

        return Inertia::render('Admin/Users/Show', [
            'user' => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'role' => $user->role,
                'is_banned' => $user->is_banned,
                'ban_reason' => $user->ban_reason,
                'banned_at' => $user->banned_at?->toDateTimeString(),
                'created_at' => $user->created_at->toDateString(),
            ],
            'collections_count' => $collectionsCount,
            'can' => [
                'ban' => $request->user()->can('ban', $user),
                'changeRole' => $request->user()->can('changeRole', $user),
            ],
        ]);
    }

    public function ban(Request $request, User $user): RedirectResponse
    {
        $this->authorize('ban', $user);

        $request->validate([
            'ban_reason' => ['required', 'string', 'max:500'],
        ]);

        $user->update([
            'is_banned' => true,
            'ban_reason' => $request->ban_reason,
            'banned_at' => now(),
        ]);

        ActivityLog::record('user.ban', "Mem-ban {$user->name} ({$user->email}). Alasan: {$request->ban_reason}", $user);

        // Force logout the banned user
        DB::table('sessions')->where('user_id', $user->id)->delete();

        return redirect()->back()->with('success', __('flash.users.banned', ['name' => $user->name]));
    }

    public function unban(User $user): RedirectResponse
    {
        $this->authorize('ban', $user);

        $user->update([
            'is_banned' => false,
            'ban_reason' => null,
            'banned_at' => null,
        ]);

        ActivityLog::record('user.unban', "Meng-unban {$user->name} ({$user->email}).", $user);

        return redirect()->back()->with('success', __('flash.users.unbanned', ['name' => $user->name]));
    }

    public function changeRole(Request $request, User $user): RedirectResponse
    {
        $this->authorize('changeRole', $user);

        $request->validate([
            'role' => ['required', 'in:admin,user,super_admin'],
        ]);

        $oldRole = $user->role;
        $user->update(['role' => $request->role]);

        ActivityLog::record(
            'user.role_change',
            "Changed the role of {$user->name} ({$user->email}) from {$oldRole} to {$request->role}.",
            $user
        );

        return redirect()->back()->with('success', __('flash.users.role_changed', ['name' => $user->name, 'role' => $request->role]));
    }
}
