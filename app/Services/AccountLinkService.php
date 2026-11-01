<?php

namespace App\Services;

use App\Models\User;
use Illuminate\Support\Facades\Auth;

/**
 * Multi-account switching: session-based, NO permanent link in the DB. This is deliberate:
 * switching accounts always requires real proof of control (re-login) of the target account, so storing
 * a permanent link would not reduce any security step, only add complexity. The list of
 * "linked" accounts lives only in the session (`linked_account_ids`); change browser/device and it
 * is gone, so you have to link again from scratch.
 */
class AccountLinkService
{
    /**
     * Log in as $user. If ANOTHER user is currently logged in on this session, that user is
     * automatically added to the linked-accounts list (not replaced or lost) so the user can switch
     * back without re-auth. This is DELIBERATELY based on the current login state (`auth()->check()`),
     * not an explicit UI flag ("Add Account" vs a normal login), because magic links issued
     * via CLI (`sso:emergency-login`) or clicked from an email never pass through the
     * "Add Account" modal, so any flag sent from there would never be set. If the
     * user wants to log out first and then log in to another account, that is handled by
     * AccountController's logoutCurrent()/full logout, not by this method.
     */
    public function loginAs(User $user): void
    {
        $linked = collect(session('linked_account_ids', []));

        if (auth()->check() && auth()->id() !== $user->id) {
            $linked->push(auth()->id());
        }

        $linked->push($user->id);

        Auth::login($user, remember: true);
        request()->session()->regenerate();

        session(['linked_account_ids' => $linked->unique()->values()->all()]);
    }
}
