<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Str;

class Series extends Model
{
    use HasFactory, HasUuids, SoftDeletes;

    protected $fillable = [
        'mal_id',
        'anilist_id',
        'ranobedb_id',
        'slug',
        'title_romaji',
        'title_english',
        'title_japanese',
        'synopsis',
        'cover_path',
        'status',
        'type',
        'published_from',
        'published_to',
        'total_volumes',
        'score',
        'rank',
        'genres',
        'authors',
        'illustrators',
        'themes',
        'demographics',
        'tags',
        'tag_categories',
        'is_adult',
    ];

    protected function casts(): array
    {
        return [
            'published_from' => 'date',
            'published_to' => 'date',
            'score' => 'decimal:2',
            'deleted_at' => 'datetime',
            'genres' => 'array',
            'authors' => 'array',
            'illustrators' => 'array',
            'themes' => 'array',
            'demographics' => 'array',
            'tags' => 'array',
            'tag_categories' => 'array',
            'is_adult' => 'boolean',
        ];
    }

    public function volumes(): HasMany
    {
        return $this->hasMany(Volume::class);
    }

    public function collections(): HasMany
    {
        return $this->hasMany(Collection::class);
    }

    public function media(): HasMany
    {
        return $this->hasMany(SeriesMedia::class)->orderBy('sort_order');
    }

    protected static function booted(): void
    {
        static::creating(function (Series $series) {
            if (blank($series->slug) && filled($series->title_romaji)) {
                $series->slug = static::generateUniqueSlug($series->title_romaji);
            }
        });

        static::updating(function (Series $series) {
            if ($series->isDirty('title_romaji') && filled($series->title_romaji)) {
                $series->slug = static::generateUniqueSlug($series->title_romaji, $series->id);
            }
        });
    }

    /**
     * Build a slug from the title. Characters other than letters/digits/spaces (@, !, commas,
     * colons, etc.) are dropped by Str::slug, and the full title is used without truncation. If the
     * resulting slug is already taken by another series, append a numeric suffix (-2, -3, ...) until unique.
     */
    public static function generateUniqueSlug(string $title, ?string $ignoreId = null): string
    {
        // The default Str::slug() dictionary (e.g. '@' => 'at') is deliberately emptied so
        // symbols are dropped outright instead of converted to words.
        $base = Str::slug($title, '-', 'en', []) ?: 'series';
        $slug = $base;
        $suffix = 2;

        while (
            static::withTrashed()
                ->where('slug', $slug)
                ->when($ignoreId, fn ($q) => $q->where('id', '!=', $ignoreId))
                ->exists()
        ) {
            $slug = "{$base}-{$suffix}";
            $suffix++;
        }

        return $slug;
    }

    /**
     * Route model binding: try to match by slug first (catalog URLs use the title slug),
     * fall back to id so old links that still use a uuid keep working.
     */
    public function resolveRouteBinding($value, $field = null): ?self
    {
        return static::where('slug', $value)->first()
            ?? static::where('id', $value)->first();
    }

    /**
     * Case-insensitive title search (romaji, English, Japanese). Postgres `LIKE` is
     * case-sensitive (unlike the SQLite used earlier), so "ryoukai shinpan" would not
     * match "Ryoukai Shinpan". `%`, `_`, and `!` in the input are escaped (escape char `!`, not
     * backslash, because `'\'` confuses the PDO placeholder parser); repeated spaces are collapsed.
     */
    public function scopeSearchTitle(Builder $query, ?string $term): Builder
    {
        $term = trim(preg_replace('/\s+/u', ' ', (string) $term));
        if ($term === '') {
            return $query;
        }

        $like = '%'.str_replace(['!', '%', '_'], ['!!', '!%', '!_'], mb_strtolower($term)).'%';

        return $query->where(function (Builder $q) use ($like) {
            foreach (['title_romaji', 'title_english', 'title_japanese'] as $col) {
                $q->orWhereRaw("LOWER({$col}) LIKE ? ESCAPE '!'", [$like]);
            }
        });
    }
}
