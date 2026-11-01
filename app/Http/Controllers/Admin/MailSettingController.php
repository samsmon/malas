<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\MailSetting;
use App\Services\MailSettingsService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class MailSettingController extends Controller
{
    public function __construct(private MailSettingsService $mail) {}

    public function update(Request $request): RedirectResponse
    {
        abort_unless(auth()->user()->isSuperAdmin(), 403);

        $data = $request->validate([
            'provider' => ['required', Rule::in(['resend'])],
            'api_key' => ['nullable', 'string'],
            'from_address' => ['nullable', 'email'],
            'from_name' => ['nullable', 'string', 'max:255'],
        ]);

        $setting = MailSetting::first() ?? new MailSetting(['provider' => 'resend']);

        // Keep the existing encrypted key if the admin left it blank (e.g. only changing from-name).
        if (blank($data['api_key'] ?? null)) {
            unset($data['api_key']);
        }

        $setting->fill($data)->save();
        $this->mail->forgetCache();

        ActivityLog::record('mail_settings.update', "Updated Email settings (provider: {$setting->provider}).");

        return redirect()->back()->with('success', __('flash.mail_settings.saved'));
    }
}
