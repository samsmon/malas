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
     * Kalau tidak ada user yang login (mis. request login-tanpa-SSO dari guest) tapi subject-nya
     * adalah User, atribusikan log ke akun itu — user_id di tabel ini NOT NULL, jadi butuh
     * fallback selain auth()->id() supaya aksi yang dipicu guest tetap bisa dicatat.
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
