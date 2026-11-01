<?php

namespace App\Http\Requests\Admin;

use App\Models\Volume;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreVolumeRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->can('create', Volume::class);
    }

    public function messages(): array
    {
        return [
            'volume_number.unique' => 'This volume number already exists in this series.',
        ];
    }

    public function rules(): array
    {
        $seriesId = $this->route('series')?->id;

        return [
            'volume_number' => [
                'required', 'integer', 'min:1',
                Rule::unique('volumes', 'volume_number')->where('series_id', $seriesId),
            ],
            'type' => ['required', Rule::in(['regular', 'digital', 'bind_up'])],
            'isbn' => ['nullable', 'string', 'max:20'],
            'published_at' => ['nullable', 'date'],
        ];
    }
}
