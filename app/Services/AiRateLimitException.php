<?php

namespace App\Services;

/**
 * Thrown when an AI provider (Gemini/OpenAI/Claude) replies with HTTP 429, usually because the
 * free-tier quota is exhausted. Handled separately from other errors so it can fall back to static text
 * without consuming the user's manual regenerate quota, and so the log does not look
 * like an application bug.
 */
class AiRateLimitException extends \RuntimeException {}
