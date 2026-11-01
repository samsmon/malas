<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Spatie\Permission\Traits\HasRoles;

class User extends Authenticatable
{
    use HasFactory, HasRoles, HasUuids, Notifiable, SoftDeletes;

    protected $fillable = [
        'sso_id',
        'name',
        'username',
        'email',
        'avatar',
        'password',
        'role',
        'is_banned',
        'ban_reason',
        'banned_at',
        'is_profile_public',
        'locale',
        'theme',
    ];

    protected $hidden = [
        'password',
        'remember_token',
    ];

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'is_banned' => 'boolean',
            'banned_at' => 'datetime',
            'deleted_at' => 'datetime',
            'is_profile_public' => 'boolean',
        ];
    }

    public function isAdmin(): bool
    {
        return in_array($this->role, ['admin', 'super_admin'], true);
    }

    public function isSuperAdmin(): bool
    {
        return $this->role === 'super_admin';
    }

    public function collections(): HasMany
    {
        return $this->hasMany(Collection::class);
    }

    public function collectionGroups(): HasMany
    {
        return $this->hasMany(CollectionGroup::class);
    }

    public function wishlistItems(): HasMany
    {
        return $this->hasMany(WishlistItem::class);
    }

    public function genreFunfact(): HasOne
    {
        return $this->hasOne(GenreFunfact::class);
    }

    public function activityLogs(): HasMany
    {
        return $this->hasMany(ActivityLog::class);
    }

    public function tickets(): HasMany
    {
        return $this->hasMany(Ticket::class);
    }

    public function dismissedAnnouncements(): BelongsToMany
    {
        return $this->belongsToMany(Announcement::class, 'announcement_user')
            ->withPivot('dismissed_at');
    }

    public function followers(): HasMany
    {
        return $this->hasMany(Follow::class, 'following_id');
    }

    public function following(): HasMany
    {
        return $this->hasMany(Follow::class, 'follower_id');
    }

    public function isFollowing(string $userId): bool
    {
        return $this->following()->where('following_id', $userId)->exists();
    }

    /**
     * Route model binding: try to match by username first (public profile URLs use the
     * username), fall back to id because not every user (e.g. one not yet synced
     * from SSO) has a username.
     */
    public function resolveRouteBinding($value, $field = null): ?self
    {
        return static::where('username', $value)->first()
            ?? static::where('id', $value)->first();
    }
}
