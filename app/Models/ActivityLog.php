<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ActivityLog extends Model
{
    use HasUuids;

    public $timestamps = false;

    /** True once record() ran in this request; LogAdminActivity uses it to avoid double entries. */
    public static bool $recorded = false;

    protected $fillable = [
        'user_id',
        'action',
        'description',
        'subject_type',
        'subject_id',
        'created_at',
    ];

    protected function casts(): array
    {
        return [
            'created_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * If no user is logged in (e.g. a guest's non-SSO login request) but the subject
     * is a User, attribute the log to that account. user_id on this table is NOT NULL, so we need
     * a fallback besides auth()->id() so guest-triggered actions can still be recorded.
     */
    public static function record(string $action, string $description, ?Model $subject = null): void
    {
        static::$recorded = true;

        static::create([
            'user_id' => auth()->id() ?? ($subject instanceof User ? $subject->id : null),
            'action' => $action,
            'description' => $description,
            'subject_type' => $subject?->getMorphClass(),
            'subject_id' => $subject?->getKey(),
            'created_at' => now(),
        ]);
    }
}
