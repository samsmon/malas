<?php

namespace App\Services;

use App\Models\AiSetting;
use Illuminate\Support\Facades\Http;

class AiFunfactService
{
    /**
     * @param  array{top_genres: array<int, array{genre: string, count: int, percent: float}>, comparison: array{genre: string, multiplier: float}|null}  $context
     */
    public function generate(array $context): string
    {
        $setting = AiSetting::first();

        if (! $setting || blank($setting->api_key)) {
            return $this->fallbackText($context);
        }

        $prompt = $this->buildPrompt($context);

        return match ($setting->provider) {
            'openai' => $this->viaOpenAi($setting->api_key, $prompt),
            'claude' => $this->viaClaude($setting->api_key, $prompt),
            default => $this->viaGemini($setting->api_key, $prompt),
        };
    }

    public function buildPrompt(array $context): string
    {
        $topGenres = collect($context['top_genres'])
            ->map(fn ($g) => "{$g['genre']} ({$g['percent']}%)")
            ->implode(', ');

        $comparisonLine = $context['comparison']
            ? "Compared with the average of other users, they collect the {$context['comparison']['genre']} genre {$context['comparison']['multiplier']}x more often."
            : '';

        return <<<PROMPT
            You are an assistant that writes short, fun "funfacts" about the genre taste in a user's manga/light novel collection, for an app called Malas.

            This user's collection genre data (percentage of the total genres in their collection): {$topGenres}.
            {$comparisonLine}

            Write ONE funfact in English, casual and playful, at most 2 short sentences, a few emoji are fine. Do not use markdown formatting. Write just the funfact, with no opening pleasantries.
            PROMPT;
    }

    public function fallbackText(array $context): string
    {
        $top = $context['top_genres'][0] ?? null;

        if (! $top) {
            return 'Your collection has too few genres to draw a conclusion yet. Add more to reveal your taste!';
        }

        $text = "Your favorite genre is {$top['genre']}, at {$top['percent']}% of your collection!";

        if ($context['comparison']) {
            $text .= " You like {$context['comparison']['genre']} {$context['comparison']['multiplier']}x more than the average of other users.";
        }

        return $text;
    }

    private function viaGemini(string $apiKey, string $prompt): string
    {
        $response = Http::timeout(20)
            ->retry(2, 500, throw: false)
            ->post("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={$apiKey}", [
                'contents' => [
                    ['parts' => [['text' => $prompt]]],
                ],
            ]);

        $this->assertSuccessful($response, 'Gemini');

        $text = data_get($response->json(), 'candidates.0.content.parts.0.text');

        return $this->cleanText($text);
    }

    private function viaOpenAi(string $apiKey, string $prompt): string
    {
        $response = Http::timeout(20)
            ->retry(2, 500, throw: false)
            ->withToken($apiKey)
            ->post('https://api.openai.com/v1/chat/completions', [
                'model' => 'gpt-4o-mini',
                'messages' => [
                    ['role' => 'user', 'content' => $prompt],
                ],
            ]);

        $this->assertSuccessful($response, 'OpenAI');

        $text = data_get($response->json(), 'choices.0.message.content');

        return $this->cleanText($text);
    }

    private function viaClaude(string $apiKey, string $prompt): string
    {
        $response = Http::timeout(20)
            ->retry(2, 500, throw: false)
            ->withHeaders([
                'x-api-key' => $apiKey,
                'anthropic-version' => '2023-06-01',
            ])
            ->post('https://api.anthropic.com/v1/messages', [
                'model' => 'claude-haiku-4-5-20251001',
                'max_tokens' => 300,
                'messages' => [
                    ['role' => 'user', 'content' => $prompt],
                ],
            ]);

        $this->assertSuccessful($response, 'Claude');

        $text = data_get($response->json(), 'content.0.text');

        return $this->cleanText($text);
    }

    private function assertSuccessful($response, string $provider): void
    {
        if ($response->status() === 429) {
            throw new AiRateLimitException("Rate limit reached for {$provider} (HTTP 429): {$response->body()}");
        }

        if (! $response->successful()) {
            throw new \Exception("Failed to generate funfact from {$provider} (HTTP {$response->status()}): {$response->body()}");
        }
    }

    private function cleanText(?string $text): string
    {
        $text = trim((string) $text);

        if ($text === '') {
            throw new \Exception('AI response was empty.');
        }

        return $text;
    }
}
