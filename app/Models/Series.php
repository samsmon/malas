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
     * Bikin slug dari judul — hilangkan karakter selain huruf/angka/spasi (@, !, koma, titik dua,
     * dll ikut kebuang lewat Str::slug), full judul dipakai apa adanya tanpa dipotong. Kalau slug
     * hasilnya sudah dipakai series lain, tambah suffix angka (-2, -3, dst) sampai unik.
     */
    public static function generateUniqueSlug(string $title, ?string $ignoreId = null): string
    {
        // Dictionary default Str::slug() (mis. '@' => 'at') sengaja dikosongkan supaya karakter
        // simbol dibuang langsung, bukan dikonversi jadi kata.
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
     * Route model binding: coba cocokkan lewat slug dulu (URL katalog pakai slug dari judul),
     * fallback ke id — supaya link lama yang masih pakai uuid tetap jalan.
     */
    public function resolveRouteBinding($value, $field = null): ?self
    {
        return static::where('slug', $value)->first()
            ?? static::where('id', $value)->first();
    }

    /**
     * Cari judul (romaji, Inggris, Jepang) tanpa membedakan huruf besar/kecil. Postgres `LIKE`
     * itu case-sensitive (beda dengan SQLite yang dulu dipakai), jadi "ryoukai shinpan" tidak
     * ketemu "Ryoukai Shinpan". `%`, `_`, dan `!` dari input di-escape (escape char `!`, bukan
     * backslash, karena `'\'` membingungkan parser placeholder PDO); spasi berulang dirapikan.
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
