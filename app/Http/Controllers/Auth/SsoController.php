<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\AccountLinkService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Log;
use Inertia\Inertia;
use Symfony\Component\HttpFoundation\Response;

class SsoController extends Controller
{
    public function __construct(private AccountLinkService $accountLink) {}

    public function redirect(Request $request): Response
    {
        $codeVerifier = bin2hex(random_bytes(32));
        $codeChallenge = rtrim(
            strtr(base64_encode(hash('sha256', $codeVerifier, true)), '+/', '-_'),
            '='
        );
        $state = bin2hex(random_bytes(16));

        session([
            'sso_code_verifier' => $codeVerifier,
            'sso_state' => $state,
        ]);

        $params = [
            'response_type' => 'code',
            'client_id' => config('sso.client_id'),
            'redirect_uri' => config('sso.redirect_uri'),
            'scope' => 'profile:read',
            'code_challenge' => $codeChallenge,
            'code_challenge_method' => 'S256',
            'state' => $state,
        ];

        if ($request->query('prompt') === 'login' || $request->query('mode') === 'link') {
            $params['prompt'] = 'login';
        }

        $query = http_build_query($params);

        // Inertia::location() forces a real browser navigation instead of an
        // XHR follow, which would fail cross-origin (CORS) when this route
        // is reached via an Inertia request (e.g. expired-session redirect).
        return Inertia::location(config('sso.base_url').'/oauth/authorize?'.$query);
    }

    public function callback(Request $request): RedirectResponse
    {
        abort_if(! $request->filled('code'), 400, 'Missing authorization code');
        abort_if($request->state !== session('sso_state'), 403, 'Invalid state');

        $tokenResult = $this->curlRequest('POST', config('sso.base_url').'/oauth/token', [
            'grant_type' => 'authorization_code',
            'code' => $request->code,
            'redirect_uri' => config('sso.redirect_uri'),
            'client_id' => config('sso.client_id'),
            'client_secret' => config('sso.client_secret'),
            'code_verifier' => session('sso_code_verifier'),
        ]);

        abort_if($tokenResult === null, 502, 'Unable to reach the SSO server.');
        abort_if($tokenResult['status'] >= 400, 502, 'SSO token exchange failed');

        $tokenResponse = json_decode($tokenResult['body'], true);

        abort_if(empty($tokenResponse['access_token']), 502, 'SSO token exchange returned no access token');

        $profileResult = $this->curlRequest('GET', config('sso.base_url').'/api/user', [], [
            'Authorization: Bearer '.$tokenResponse['access_token'],
        ]);

        abort_if($profileResult === null, 502, 'Unable to reach the SSO server.');
        abort_if($profileResult['status'] >= 400, 502, 'Failed to fetch profile from SSO');

        $profile = json_decode($profileResult['body'], true);

        /** @var User $user */
        $user = User::query()->firstOrNew(['sso_id' => $profile['id']]);
        $isNew = ! $user->exists;

        $user->fill([
            'name' => $profile['name'],
            'username' => $profile['username'],
            'email' => $profile['email'],
            'avatar' => $profile['avatar'],
        ]);

        if ($isNew) {
            $user->role = ($profile['role']['slug'] ?? null) === 'superadmin' ? 'super_admin' : 'user';
        }

        $user->save();

        session()->forget(['sso_code_verifier', 'sso_state']);
        session([
            'sso_access_token' => $tokenResponse['access_token'],
            'sso_refresh_token' => $tokenResponse['refresh_token'],
        ]);

        $this->accountLink->loginAs($user);

        if ($user->is_banned) {
            return redirect()->route('banned');
        }

        $default = $user->isAdmin()
            ? route('admin.dashboard', absolute: false)
            : route('dashboard', absolute: false);

        return redirect()->intended($default);
    }

    public function logout(Request $request): Response
    {
        // The local session is destroyed first regardless of SSO status; logout must still
        // succeed locally even when SSO is unreachable.
        Auth::guard('web')->logout();

        $request->session()->invalidate();
        $request->session()->regenerateToken();

        if (! $this->ssoReachable()) {
            // SSO is unreachable: do not force the browser to navigate to a dead domain
            // (it could hang for a long time waiting for a timeout). The local session is already clean, so just go back home.
            return Inertia::location('/');
        }

        // redirect_uri tells SSO where to send the browser back after it
        // destroys its own session — without it, the SSO session survives
        // and the next login silently succeeds without showing the login form.
        $redirectUri = urlencode(url('/'));

        // Inertia's XHR-based router.post() can't follow a redirect to a
        // different origin (CORS). Inertia::location() forces the client
        // to do a real browser navigation instead.
        return Inertia::location(config('sso.base_url')."/logout?redirect_uri={$redirectUri}");
    }

    /**
     * Quick check whether SSO is reachable before telling the browser to navigate to its domain.
     * Short timeout (3 seconds) so logout does not feel hung when SSO is down/under maintenance.
     */
    private function ssoReachable(): bool
    {
        $ch = curl_init(config('sso.base_url'));
        curl_setopt($ch, CURLOPT_NOBODY, true);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 3);
        curl_setopt($ch, CURLOPT_TIMEOUT, 3);
        curl_exec($ch);
        $errno = curl_errno($ch);
        curl_close($ch);

        return $errno === 0;
    }

    /**
     * Plain curl_exec request. The Guzzle-based Http facade intermittently
     * hangs on this environment's PHP-FPM (curl_multi never completes),
     * while a blocking curl_exec has been reliable — see SsoController
     * connectivity investigation.
     *
     * @return array{status: int, body: string}|null null on transport failure
     */
    private function curlRequest(string $method, string $url, array $formFields = [], array $headers = []): ?array
    {
        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 10);
        curl_setopt($ch, CURLOPT_TIMEOUT, 10);

        if ($method === 'POST') {
            curl_setopt($ch, CURLOPT_POST, true);
            curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query($formFields));
        }

        if ($headers) {
            curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
        }

        $body = curl_exec($ch);
        $errno = curl_errno($ch);
        $error = curl_error($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($errno !== 0 || $body === false) {
            Log::error("SSO request to {$url} failed: [{$errno}] {$error}");

            return null;
        }

        return ['status' => $status, 'body' => $body];
    }
}
