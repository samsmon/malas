<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class GenreFunfact extends Model
{
    use HasUuids;

    // Default limit for manual regenerations per week; can be overridden per user via the quota_override column.
    public const DEFAULT_MANUAL_QUOTA = 5;

    protected $fillable = [
        'user_id',
        'provider',
        'content',
        'generated_at',
        'collections_count_at_generation',
        'manual_regenerate_count',
        'manual_regenerate_window_started_at',
        'quota_override',
    ];

    protected function casts(): array
    {
        return [
            'generated_at' => 'datetime',
            'manual_regenerate_window_started_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
