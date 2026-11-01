<?php

use App\Models\AiSetting;
use Illuminate\Database\Migrations\Migration;

return new class extends Migration
{
    public function up(): void
    {
        // Puter.js was removed from the app, so the 'puter' provider is no longer a valid choice. Old rows
        // still set to 'puter' are normalized to 'gemini' (the new default) with no API key.
        // AiFunfactService already falls back to static text when api_key is empty, so
        // behavior stays the same (no real AI calls) until an admin enters a new API key.
        AiSetting::where('provider', 'puter')->update(['provider' => 'gemini']);
    }

    public function down(): void
    {
        // There is no previous state to restore: the Puter feature was removed on purpose.
    }
};
