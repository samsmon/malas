<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Str;

class SsoFallbackToken extends Model
{
    use HasUuids;

    private const TTL_MINUTES = 15;

    protected $fillable = [
        'user_id',
        'token_hash',
        'expires_at',
        'used_at',
    ];

    protected function casts(): array
    {
        return [
            'expires_at' => 'datetime',
            'used_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * Issue a new token for the user and return the RAW token (it exists only now, stored in the
     * email link). Only its hash is stored in the DB, like Laravel's password_reset_tokens.
     */
    public static function issueFor(User $user): string
    {
        $raw = Str::random(64);

        static::create([
            'user_id' => $user->id,
            'token_hash' => hash('sha256', $raw),
            'expires_at' => now()->addMinutes(self::TTL_MINUTES),
        ]);

        return $raw;
    }

    /** Find a valid token (not expired, not yet used) from the raw token in the URL. */
    public static function findValid(string $rawToken): ?self
    {
        return static::query()
            ->where('token_hash', hash('sha256', $rawToken))
            ->whereNull('used_at')
            ->where('expires_at', '>', now())
            ->first();
    }

    public function markUsed(): void
    {
        $this->update(['used_at' => now()]);
    }
}
