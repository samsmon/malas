<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Collection extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = [
        'user_id',
        'series_id',
        'condition',
        'acquired_at',
        'notes',
        'personal_rating',
        'personal_review',
    ];

    protected function casts(): array
    {
        return [
            'acquired_at' => 'date',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function series(): BelongsTo
    {
        return $this->belongsTo(Series::class);
    }

    public function collectionVolumes(): HasMany
    {
        return $this->hasMany(CollectionVolume::class);
    }

    public function loans(): HasMany
    {
        return $this->hasMany(Loan::class);
    }

    public function groups(): BelongsToMany
    {
        return $this->belongsToMany(CollectionGroup::class, 'collection_group_items')->withTimestamps();
    }

    /**
     * Route model binding: try to match the Series slug first (collection URLs use the title,
     * not a UUID), scoped to collections owned by the logged-in user, because two users can
     * collect the same series (one Series::slug can "have" many Collections, one per user).
     * Falls back to id if nothing is found (old links, or another user's slug; in that case
     * Policy::view() denies access, not resolveRouteBinding).
     */
    public function resolveRouteBinding($value, $field = null): ?self
    {
        return auth()->user()?->collections()
            ->whereHas('series', fn ($q) => $q->where('slug', $value))
            ->first()
            ?? static::where('id', $value)->first();
    }
}
