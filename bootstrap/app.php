<?php

use App\Http\Middleware\CheckMenuAccess;
use App\Http\Middleware\EnsureNotBanned;
use App\Http\Middleware\HandleInertiaRequests;
use App\Http\Middleware\LogAdminActivity;
use App\Http\Middleware\SetLocale;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Middleware\AddLinkHeadersForPreloadedAssets;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Symfony\Component\HttpFoundation\Response;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->web(append: [
            SetLocale::class,
            HandleInertiaRequests::class,
            AddLinkHeadersForPreloadedAssets::class,
        ]);

        $middleware->alias([
            'not_banned' => EnsureNotBanned::class,
            'check.menu' => CheckMenuAccess::class,
            'log.admin' => LogAdminActivity::class,
        ]);

        // Default Authenticate middleware calls route('login') to build its
        // redirect before throwing AuthenticationException — that route no
        // longer exists (SSO handles login), which crashed before our
        // exception render below ever ran. Point it at SSO instead.
        $middleware->redirectGuestsTo(fn () => route('sso.redirect'));
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->render(function (AuthenticationException $e, Request $request) {
            return redirect()->route('sso.redirect');
        });

        $exceptions->respond(function (Response $response) {
            if (in_array($response->getStatusCode(), [400, 403, 404, 500, 502, 503])
                && ! app()->runningInConsole()
            ) {
                return Inertia::render('Error', ['status' => $response->getStatusCode()])
                    ->toResponse(request())
                    ->setStatusCode($response->getStatusCode());
            }

            return $response;
        });
    })->create();
