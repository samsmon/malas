<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\AiSetting;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class AiSettingController extends Controller
{
    public function update(Request $request): RedirectResponse
    {
        abort_unless(auth()->user()->isSuperAdmin(), 403);

        $data = $request->validate([
            'provider' => ['required', Rule::in(['gemini', 'openai', 'claude'])],
            'api_key' => ['nullable', 'string'],
        ]);

        $setting = AiSetting::first() ?? new AiSetting(['provider' => 'gemini']);

        // Keep the existing encrypted key if the admin left it blank (e.g. only switching provider).
        if (blank($data['api_key'] ?? null)) {
            unset($data['api_key']);
        }

        $setting->fill($data)->save();

        ActivityLog::record('ai_settings.update', "Updated AI settings (provider: {$setting->provider}).");

        return redirect()->back()->with('success', __('flash.ai_settings.saved'));
    }
}
