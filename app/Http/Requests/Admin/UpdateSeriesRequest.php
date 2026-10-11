<?php

namespace App\Http\Requests\Admin;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateSeriesRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->can('update', $this->route('series'));
    }

    public function rules(): array
    {
        return [
            'title_romaji' => ['required', 'string', 'max:255'],
            'title_english' => ['nullable', 'string', 'max:255'],
            'title_japanese' => ['nullable', 'string', 'max:500'],
            'synopsis' => ['nullable', 'string'],
            'status' => ['required', Rule::in(['publishing', 'finished', 'on_hiatus', 'discontinued', 'not_yet_published'])],
            'type' => ['required', Rule::in(['manga', 'novel', 'one_shot', 'doujinshi', 'other'])],
            'cover' => ['nullable', 'mimes:jpeg,jpg,png,webp', 'max:10240'],
            'cover_url' => ['nullable', 'url', 'max:2048'],
            'published_from' => ['nullable', 'date'],
            'published_to' => ['nullable', 'date', 'after_or_equal:published_from'],
            'total_volumes' => ['nullable', 'integer', 'min:1'],
            'score' => ['nullable', 'numeric', 'min:0', 'max:10'],
            'rank' => ['nullable', 'integer', 'min:1'],
            'genres' => ['nullable', 'array'],
            // nullable di sini penting: ConvertEmptyStringsToNull middleware (global Laravel 12)
            // ngubah sentinel string kosong (genres[]='') jadi null sebelum validasi jalan.
            'genres.*' => ['nullable', 'string', 'max:100'],
            'authors' => ['nullable', 'array'],
            'authors.*' => ['nullable', 'string', 'max:150'],
            'illustrators' => ['nullable', 'array'],
            'illustrators.*' => ['nullable', 'string', 'max:150'],
            'themes' => ['nullable', 'array'],
            'themes.*' => ['nullable', 'string', 'max:100'],
            'demographics' => ['nullable', 'array'],
            'demographics.*' => ['nullable', 'string', 'max:100'],
        ];
    }

    public function messages(): array
    {
        return [
            'cover.max' => 'Ukuran cover maksimal 10 MB.',
            'cover.mimes' => 'Format cover harus JPG, PNG, atau WebP.',
            'cover.uploaded' => 'Cover gagal diunggah. Coba file yang lebih kecil dari 10 MB.',
            'published_to.after_or_equal' => 'Tanggal selesai tidak boleh lebih awal dari tanggal mulai.',
            'score.max' => 'Skor maksimal 10.',
        ];
    }
}
