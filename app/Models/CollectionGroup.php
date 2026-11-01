<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Support\Str;

class CollectionGroup extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = [
        'user_id',
        'name',
        'slug',
        'is_public',
    ];

    protected function casts(): array
    {
        return [
            'is_public' => 'boolean',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function collections(): BelongsToMany
    {
        return $this->belongsToMany(Collection::class, 'collection_group_items')->withTimestamps();
    }

    protected static function booted(): void
    {
        static::creating(function (CollectionGroup $group) {
            if (blank($group->slug) && filled($group->name)) {
                $group->slug = static::generateUniqueSlug($group->user, $group->name);
            }
        });

        static::updating(function (CollectionGroup $group) {
            if ($group->isDirty('name') && filled($group->name)) {
                $group->slug = static::generateUniqueSlug($group->user, $group->name, $group->id);
            }
        });
    }

    /**
     * Slug = username + group name, so URLs avoid a random string (uuid) and are easy to read
     * when a group is shared (e.g. via the public profile). Falls back to the user id if the
     * username has not been synced from SSO yet. Same fallback pattern as User::resolveRouteBinding().
     */
    public static function generateUniqueSlug(User $user, string $name, ?string $ignoreId = null): string
    {
        $prefix = Str::slug($user->username ?: $user->name, '-', 'en', []) ?: $user->id;
        $base = $prefix.'-'.(Str::slug($name, '-', 'en', []) ?: 'group');
        $slug = $base;
        $suffix = 2;

        while (
            static::where('slug', $slug)
                ->when($ignoreId, fn ($q) => $q->where('id', '!=', $ignoreId))
                ->exists()
        ) {
            $slug = "{$base}-{$suffix}";
            $suffix++;
        }

        return $slug;
    }

Route model binding: try to match by slug first, fall back to id. Same pattern as
Series::resolveRouteBinding() / User::resolveRouteBinding().
     */
    public function resolveRouteBinding($value, $field = null): ?self
    {
        return static::where('slug', $value)->first()
            ?? static::where('id', $value)->first();
    }
}
