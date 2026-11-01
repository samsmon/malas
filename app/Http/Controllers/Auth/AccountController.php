<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class AccountController extends Controller
{
    /**
     * Switch to another account already linked in this session, WITHOUT re-auth, because
     * ownership was already proven once when that account was added via "Add Account".
     */
    public function switch(Request $request): RedirectResponse
    {
        $request->validate([
            'user_id' => ['required', 'uuid'],
        ]);

        $linked = session('linked_account_ids', []);

        // Required: the target must have actually logged in during this session. Never trust
        // a user_id from the client without this validation, or anyone could "switch" to any account.
        abort_unless(in_array($request->user_id, $linked, true), 403);

        $target = User::find($request->user_id);
        abort_if(! $target || $target->is_banned, 403);

        Auth::login($target, remember: true);
        $request->session()->regenerate();
        // regenerate() does NOT delete session data (default $destroy = false), so
        // linked_account_ids is still present after this line, so it is deliberately not set again.

        $default = $target->isAdmin()
            ? route('admin.dashboard', absolute: false)
            : route('dashboard', absolute: false);

        return redirect()->intended($default);
    }

    /**
     * Log out of the currently active account ONLY (X/Twitter pattern). If other accounts are still
     * linked, switch to one of them automatically. If this is the last account, the effect is the same as a full logout
     * (delegated to SsoController::logout(), which already handles SSO being down gracefully).
     */
    public function logoutCurrent(Request $request, SsoController $ssoController): RedirectResponse|\Symfony\Component\HttpFoundation\Response
    {
        $currentId = auth()->id();
        $linked = collect(session('linked_account_ids', []))
            ->reject(fn ($id) => $id === $currentId)
            ->values();

        $nextId = $linked->first();

        if (! $nextId) {
            // No other linked account, so this is effectively a full logout.
            return $ssoController->logout($request);
        }

        $next = User::find($nextId);

        if (! $next || $next->is_banned) {
            // The next account in the list is no longer valid: remove it from the list and try again.
            session(['linked_account_ids' => $linked->reject(fn ($id) => $id === $nextId)->values()->all()]);

            return $this->logoutCurrent($request, $ssoController);
        }

        Auth::login($next, remember: true);
        $request->session()->regenerate();
        session(['linked_account_ids' => $linked->all()]);

        $default = $next->isAdmin()
            ? route('admin.dashboard', absolute: false)
            : route('dashboard', absolute: false);

        return redirect()->intended($default);
    }
}
