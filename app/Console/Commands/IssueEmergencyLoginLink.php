<?php

namespace App\Console\Commands;

use App\Models\ActivityLog;
use App\Models\SsoFallbackToken;
use App\Models\User;
use Illuminate\Console\Command;

class IssueEmergencyLoginLink extends Command
{
    /**
     * The identifier may be a role keyword (super_admin/admin/user, with or without underscore)
     * or a specific email/username. Defaults to super_admin because that is the account most
     * often needed when SSO is down: the highest account must always be able to get in.
     */
    protected $signature = 'sso:emergency-login {identifier=super_admin : Role (super_admin/admin/user) or a specific email/username}';

    protected $description = 'Issue a one-time login link that bypasses SSO, for when Yado is completely unreachable. Requires CLI/SSH access to the server.';

    private const ROLE_ALIASES = [
        'super_admin' => 'super_admin',
        'superadmin' => 'super_admin',
        'admin' => 'admin',
        'user' => 'user',
    ];

    public function handle(): int
    {
        $identifier = strtolower(trim((string) $this->argument('identifier')));

        $user = self::ROLE_ALIASES[$identifier] ?? null
            ? $this->resolveByRole(self::ROLE_ALIASES[$identifier])
            : $this->resolveByIdentifier($identifier);

        if (! $user) {
            $this->error("No active (not banned) user matches \"{$identifier}\".");

            return self::FAILURE;
        }

        $this->info('About to issue an emergency login link for:');
        $this->line("  Name     : {$user->name}");
        $this->line("  Email    : {$user->email}");
        $this->line('  Role     : '.$user->role);

        if (! $this->confirm('Lanjutkan?', true)) {
            $this->comment('Cancelled.');

            return self::SUCCESS;
        }

        $token = SsoFallbackToken::issueFor($user);
        $url = route('sso.fallback.consume', ['token' => $token]);

        ActivityLog::record(
            'auth.emergency_login_issued',
            "Emergency login link (CLI, no SSO) issued for {$user->name}.",
            $user,
        );

        $this->newLine();
        $this->info('Login link (valid for 15 minutes, single use):');
        $this->line($url);
        $this->newLine();
        $this->comment('Open this link in a browser to log in directly as the user above.');

        return self::SUCCESS;
    }

    private function resolveByRole(string $role): ?User
    {
        $candidates = User::where('role', $role)
            ->where('is_banned', false)
            ->orderBy('name')
            ->get(['id', 'name', 'email', 'role']);

        if ($candidates->isEmpty()) {
            return null;
        }

        if ($candidates->count() === 1) {
            return $candidates->first();
        }

        $choice = $this->choice(
            "There are {$candidates->count()} users with role {$role}. Pick one:",
            $candidates->map(fn ($u) => "{$u->name} ({$u->email})")->all(),
        );

        $index = array_search($choice, $candidates->map(fn ($u) => "{$u->name} ({$u->email})")->all(), true);

        return $candidates->get($index);
    }

    private function resolveByIdentifier(string $identifier): ?User
    {
        return User::where('is_banned', false)
            ->where(fn ($q) => $q->where('email', $identifier)->orWhere('username', $identifier))
            ->first();
    }
}
