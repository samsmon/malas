<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Mail\SsoFallbackLoginMail;
use App\Models\ActivityLog;
use App\Models\SsoFallbackToken;
use App\Models\User;
use App\Services\AccountLinkService;
use App\Services\MailSettingsService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Inertia\Inertia;
use Inertia\Response;

class SsoFallbackController extends Controller
{
    public function __construct(private MailSettingsService $mail, private AccountLinkService $accountLink) {}

    public function show(): Response
    {
        return Inertia::render('Auth/SsoFallback');
    }

    /**
     * Always reply with the same generic message whether or not the email is registered, so this endpoint
     * cannot be used to enumerate valid user emails.
     */
    public function send(Request $request): RedirectResponse
    {
        $request->validate([
            'email' => ['required', 'email'],
        ]);

        $user = User::where('email', $request->email)->where('is_banned', false)->first();

        if ($user && $this->mail->isConfigured()) {
            $token = SsoFallbackToken::issueFor($user);
            $loginUrl = route('sso.fallback.consume', ['token' => $token]);

            // A mail provider failure (wrong key, Resend down, etc.) must not make this request
            // return a 500. Still reply with the same generic message and only log it for admins.
            try {
                $this->mail->send($user->email, new SsoFallbackLoginMail($user, $loginUrl));
                ActivityLog::record('auth.fallback_requested', "Login link without SSO requested for {$user->name}.", $user);
            } catch (\Throwable $e) {
                report($e);
                Log::error("Failed to send fallback login email for {$user->email}: {$e->getMessage()}");
                ActivityLog::record('auth.fallback_mail_error', "Failed to send no-SSO login link for {$user->name}: {$e->getMessage()}", $user);
            }
        }

        return redirect()->back()->with('success', __('flash.sso_fallback.link_sent'));
    }

    public function consume(string $token): RedirectResponse
    {
        $record = SsoFallbackToken::findValid($token);

        abort_if(! $record, 400, 'This link is no longer valid: it was already used, has expired, or is wrong. Request a new link.');

        $user = $record->user;
        abort_if(! $user || $user->is_banned, 403);

        $record->markUsed();

        $this->accountLink->loginAs($user);

        ActivityLog::record('auth.fallback_login', "{$user->name} logged in without SSO (fallback).", $user);

        $default = $user->isAdmin()
            ? route('admin.dashboard', absolute: false)
            : route('dashboard', absolute: false);

        return redirect()->intended($default);
    }
}
