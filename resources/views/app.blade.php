<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}">
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">

        {{-- Prevent dark mode FOUC: apply the "dark" class synchronously before first paint, before the CSS
             is attached. The dark class in useTheme.ts is only applied in useEffect (after the first
             paint), so without this dark-mode users would see a white flash on every full
             page load. Read localStorage first (source of truth per useTheme.ts), fall back to the user's
             theme from the server for the first login on a new device before localStorage is filled. --}}
        <script>
            (function () {
                try {
                    var theme = localStorage.getItem('theme') || @json(auth()->user()->theme ?? 'system');
                    var isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
                    if (isDark) document.documentElement.classList.add('dark');
                } catch (e) {}
            })();
        </script>

        <title inertia>{{ config('app.name', 'MALAS') }}</title>

        <!-- Favicon -->
        <link rel="icon" type="image/svg+xml" href="{{ asset('images/favicon/favicon.svg') }}" media="(prefers-color-scheme: light)">
        <link rel="icon" type="image/svg+xml" href="{{ asset('images/favicon/favicon-dark.svg') }}" media="(prefers-color-scheme: dark)">
        <link rel="icon" type="image/png" sizes="32x32" href="{{ asset('images/favicon/favicon-32.png') }}">
        <link rel="icon" type="image/png" sizes="16x16" href="{{ asset('images/favicon/favicon-16.png') }}">
        <link rel="apple-touch-icon" sizes="180x180" href="{{ asset('images/favicon/favicon-180.png') }}">
        <link rel="manifest" href="{{ asset('site.webmanifest') }}">

        <!-- Fonts -->
        <link rel="preconnect" href="https://fonts.bunny.net">
        <link href="https://fonts.bunny.net/css?family=figtree:400,500,600&display=swap" rel="stylesheet" />

        <!-- Scripts -->
        @routes
        @viteReactRefresh
        @vite(['resources/js/app.tsx', "resources/js/Pages/{$page['component']}.tsx"])
        @inertiaHead
    </head>
    <body class="font-sans antialiased">
        @inertia
    </body>
</html>
