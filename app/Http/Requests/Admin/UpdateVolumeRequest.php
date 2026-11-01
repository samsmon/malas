<?php

namespace App\Http\Requests\Admin;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateVolumeRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->can('update', $this->route('volume'));
    }

    public function messages(): array
    {
        return [
            'volume_number.unique' => 'This volume number already exists in this series.',
        ];
    }

    public function rules(): array
    {
        $volume = $this->route('volume');
        $seriesId = $volume?->series_id;

        return [
            'volume_number' => [
                'required', 'integer', 'min:1',
                Rule::unique('volumes', 'volume_number')
                    ->where('series_id', $seriesId)
                    ->ignore($volume?->id),
            ],
            'type' => ['required', Rule::in(['regular', 'digital', 'bind_up'])],
            'isbn' => ['nullable', 'string', 'max:20'],
            'published_at' => ['nullable', 'date'],
        ];
    }
}
