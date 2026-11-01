<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\SiteSetting;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;

class SiteSettingController extends Controller
{
    public function update(Request $request): RedirectResponse
    {
        abort_unless(auth()->user()->isSuperAdmin(), 403);

        $request->validate([
            'blur_adult_content' => ['required', 'boolean'],
        ]);

        $setting = SiteSetting::first() ?? new SiteSetting;
        $setting->fill($request->only('blur_adult_content'))->save();

        Cache::forget('site_settings.blur_adult_content');

        $state = $request->boolean('blur_adult_content') ? 'aktif' : 'nonaktif';
        ActivityLog::record('site_settings.update', "Changed the 18+ content blur setting to {$state}.");

        return redirect()->back()->with('success', __('flash.site_settings.saved'));
    }
}
