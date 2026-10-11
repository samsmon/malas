<?php

use App\Http\Controllers\Admin\ActivityLogController;
use App\Http\Controllers\Admin\AiSettingController;
use App\Http\Controllers\Admin\AniListController;
use App\Http\Controllers\Admin\AnnouncementController as AdminAnnouncementController;
use App\Http\Controllers\Admin\CollectionController as AdminCollectionController;
use App\Http\Controllers\Admin\CommandSearchController;
use App\Http\Controllers\Admin\DashboardController as AdminDashboardController;
use App\Http\Controllers\Admin\DatabaseBackupController;
use App\Http\Controllers\Admin\ExternalSearchController;
use App\Http\Controllers\Admin\GenreFunfactController;
use App\Http\Controllers\Admin\ImageSearchController;
use App\Http\Controllers\Admin\LoanController as AdminLoanController;
use App\Http\Controllers\Admin\MailSettingController;
use App\Http\Controllers\Admin\MenuController as AdminMenuController;
use App\Http\Controllers\Admin\RanobeDbController;
use App\Http\Controllers\Admin\SeriesController as AdminSeriesController;
use App\Http\Controllers\Admin\SeriesMediaController;
use App\Http\Controllers\Admin\SiteSettingController;
use App\Http\Controllers\Admin\StorageSettingController;
use App\Http\Controllers\Admin\TicketController as AdminTicketController;
use App\Http\Controllers\Admin\UserController as AdminUserController;
use App\Http\Controllers\Admin\VolumeController as AdminVolumeController;
use App\Http\Controllers\AnnouncementController;
use App\Http\Controllers\Auth\AccountController;
use App\Http\Controllers\Auth\SsoController;
use App\Http\Controllers\Auth\SsoFallbackController;
use App\Http\Controllers\SettingsController;
use App\Http\Controllers\User\CollectionController;
use App\Http\Controllers\User\CollectionGroupController;
use App\Http\Controllers\User\DashboardController as UserDashboardController;
use App\Http\Controllers\User\LoanController;
use App\Http\Controllers\User\ProfileController;
use App\Http\Controllers\User\SearchController;
use App\Http\Controllers\User\SeriesController as UserSeriesController;
use App\Http\Controllers\User\TicketController;
use App\Http\Controllers\User\WishlistController;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

Route::get('/health', function () {
    return response()->json(['status' => 'ok', 'service' => 'malas', 'timestamp' => now()->toIso8601String()]);
})->name('health')->middleware('throttle:60,1');

Route::get('/', function () {
    $user = auth()->user();

    if (! $user) {
        return Inertia::render('Landing');
    }

    return redirect($user->isAdmin() ? route('admin.dashboard') : route('dashboard'));
});

// SSO — Yado
Route::get('/auth/redirect', [SsoController::class, 'redirect'])->name('sso.redirect');
Route::get('/auth/callback', [SsoController::class, 'callback'])->name('sso.callback');

// Login via email (magic link) — opsi login setara SSO (dipilih dari modal login), bukan cuma
// jalur darurat. Verifikasi identitas lewat magic link sekali-pakai ke email yang sudah
// tersinkron dari SSO, bukan password lokal. Profil (nama/avatar/username) cuma ikut ke-sync
// pas login lewat SSO — user yang selalu pakai email nggak dapat update profil otomatis.
Route::get('/auth/fallback', [SsoFallbackController::class, 'show'])->name('sso.fallback.show');
Route::post('/auth/fallback', [SsoFallbackController::class, 'send'])
    ->middleware('throttle:5,10')
    ->name('sso.fallback.send');
Route::get('/auth/fallback/{token}', [SsoFallbackController::class, 'consume'])->name('sso.fallback.consume');
Route::middleware('auth')->group(function () {
    // "Keluar dari semua akun" — logout total, termasuk redirect ke SSO buat destroy sesi di sana.
    Route::post('/logout', [SsoController::class, 'logout'])->name('logout');
    // Multi-account switching (session-based, lihat AccountLinkService) — kepake semua user,
    // bukan cuma admin.
    Route::post('/accounts/switch', [AccountController::class, 'switch'])->name('accounts.switch');
    Route::post('/accounts/logout-current', [AccountController::class, 'logoutCurrent'])->name('accounts.logoutCurrent');
});

// Banned page — auth required so ban_reason is available, but not_banned skipped
Route::get('/banned', function () {
    return Inertia::render('Auth/Banned');
})->middleware('auth')->name('banned');

// Profil publik (opt-in) — sengaja di luar grup 'auth' supaya non-login juga bisa lihat
// (read-only, tanpa akses ke fitur internal seperti Katalog). Lihat ProfileController::show().
Route::get('/u/{user}', [ProfileController::class, 'show'])->name('profile.show');

// Grup koleksi publik (opt-in per grup) — sengaja di luar grup 'auth', sama alasannya dengan
// profil publik di atas. Visibilitas (publik/privat) dicek manual di controller, bukan lewat
// middleware, karena guest juga boleh lihat kalau grupnya public. Lihat CollectionGroupController::show().
Route::get('/collection-groups/{group}', [CollectionGroupController::class, 'show'])->name('collection.groups.show');

// User area
Route::middleware(['auth', 'not_banned', 'check.menu'])->group(function () {
    Route::get('/dashboard', [UserDashboardController::class, 'index'])->name('dashboard');
    Route::get('/dashboard/surprise-me', [UserDashboardController::class, 'surpriseMe'])->name('dashboard.surprise-me');
    Route::post('/dashboard/funfact/regenerate', [UserDashboardController::class, 'regenerateFunfact'])->name('dashboard.funfact.regenerate');
    Route::get('/dashboard/genre-detail', [UserDashboardController::class, 'genreDetail'])->name('dashboard.genre-detail');
    Route::get('/search', [SearchController::class, 'search'])->name('search');

    // Katalog (baca saja)
    Route::get('/catalog', [UserSeriesController::class, 'index'])->name('catalog.index');
    Route::get('/catalog/search', [UserSeriesController::class, 'search'])->name('catalog.search');
    Route::get('/catalog/{series}', [UserSeriesController::class, 'show'])->name('catalog.show');

    // Koleksi pribadi
    Route::get('/my-collection', [CollectionController::class, 'index'])->name('collection.index');
    Route::post('/my-collection', [CollectionController::class, 'store'])->name('collection.store');
    Route::patch('/my-collection/undo-store', [CollectionController::class, 'undoStore'])->name('collection.undo-store');
    Route::patch('/my-collection/undo-destroy', [CollectionController::class, 'undoDestroy'])->name('collection.undo-destroy');
    Route::get('/my-collection/export', [CollectionController::class, 'export'])->name('collection.export');
    Route::post('/my-collection/import', [CollectionController::class, 'import'])->name('collection.import');
    Route::get('/my-collection/{collection}', [CollectionController::class, 'show'])->name('collection.show');
    Route::delete('/my-collection/{collection}', [CollectionController::class, 'destroy'])->name('collection.destroy');
    Route::patch('/my-collection/{collection}/condition', [CollectionController::class, 'updateCondition'])->name('collection.condition.update');
    Route::patch('/my-collection/{collection}/review', [CollectionController::class, 'updateReview'])->name('collection.review.update');
    Route::post('/my-collection/{collection}/volumes', [CollectionController::class, 'storeVolumes'])->name('collection.volumes.store');
    Route::delete('/my-collection/{collection}/volumes/bulk', [CollectionController::class, 'destroyVolumes'])->name('collection.volumes.destroyBulk');
    Route::delete('/my-collection/{collection}/volumes/{collectionVolume}', [CollectionController::class, 'destroyVolume'])->name('collection.volumes.destroy');
    Route::patch('/my-collection/{collection}/volumes/{collectionVolume}/read', [CollectionController::class, 'toggleVolumeRead'])->name('collection.volumes.toggleRead');
    Route::patch('/my-collection/{collection}/volumes/{collectionVolume}/format', [CollectionController::class, 'updateVolumeFormat'])->name('collection.volumes.updateFormat');
    Route::patch('/my-collection/{collection}/volumes/format-bulk', [CollectionController::class, 'updateVolumesFormat'])->name('collection.volumes.updateFormatBulk');
    Route::patch('/my-collection/{collection}/volumes/read-all', [CollectionController::class, 'markAllVolumesRead'])->name('collection.volumes.readAll');
    Route::patch('/my-collection/{collection}/volumes/unmark-read', [CollectionController::class, 'unmarkVolumesRead'])->name('collection.volumes.unmarkRead');
    Route::patch('/my-collection/{collection}/volumes/restore', [CollectionController::class, 'restoreVolumes'])->name('collection.volumes.restore');
    Route::patch('/my-collection/{collection}/volumes/read-progress', [CollectionController::class, 'advanceReadProgress'])->name('collection.volumes.readProgress');
    Route::patch('/my-collection/{collection}/volumes/quick-count', [CollectionController::class, 'quickAdjustCount'])->name('collection.volumes.quickCount');

    // Grup koleksi custom (ala MDList MangaDex) — many-to-many, path terpisah dari
    // /my-collection/{collection} biar nggak tabrakan sama route model binding.
    Route::get('/collection-groups', [CollectionGroupController::class, 'index'])->name('collection.groups.index');
    Route::post('/collection-groups', [CollectionGroupController::class, 'store'])->name('collection.groups.store');
    Route::patch('/collection-groups/{group}', [CollectionGroupController::class, 'update'])->name('collection.groups.update');
    Route::patch('/collection-groups/{group}/visibility', [CollectionGroupController::class, 'updateVisibility'])->name('collection.groups.visibility.update');
    Route::delete('/collection-groups/{group}', [CollectionGroupController::class, 'destroy'])->name('collection.groups.destroy');
    Route::post('/collection-groups/{group}/items', [CollectionGroupController::class, 'addItems'])->name('collection.groups.items.add');
    Route::delete('/collection-groups/{group}/items/{collection}', [CollectionGroupController::class, 'removeItem'])->name('collection.groups.items.remove');
    Route::patch('/collection-groups/{group}/items/undo-remove', [CollectionGroupController::class, 'undoRemoveItem'])->name('collection.groups.items.undoRemove');

    // Pinjaman user
    Route::get('/my-loans', [LoanController::class, 'index'])->name('loans.index');
    Route::post('/my-collection/{collection}/loans', [LoanController::class, 'store'])->name('loans.store');
    Route::put('/loans/{loan}/return', [LoanController::class, 'markReturned'])->name('loans.return');

    // Dismiss pengumuman
    Route::post('/announcements/{announcement}/dismiss', [AnnouncementController::class, 'dismiss'])->name('announcements.dismiss');

    // Tiket ke superadmin
    Route::get('/tickets', [TicketController::class, 'index'])->name('tickets.index');
    Route::get('/tickets/create', [TicketController::class, 'create'])->name('tickets.create');
    Route::post('/tickets', [TicketController::class, 'store'])->name('tickets.store');
    Route::get('/tickets/{ticket}', [TicketController::class, 'show'])->name('tickets.show');

    // Wishlist — series yang belum dimiliki tapi mau dibaca
    Route::get('/wishlist', [WishlistController::class, 'index'])->name('wishlist.index');
    Route::post('/wishlist', [WishlistController::class, 'store'])->name('wishlist.store');
    Route::delete('/wishlist/{wishlistItem}', [WishlistController::class, 'destroy'])->name('wishlist.destroy');
    Route::patch('/wishlist/restore', [WishlistController::class, 'restore'])->name('wishlist.restore');

    // Direktori pengguna (butuh login, untuk follow)
    Route::get('/directory', [ProfileController::class, 'directory'])->name('directory.index');
    Route::post('/u/{user}/follow', [ProfileController::class, 'follow'])->name('profile.follow');
    Route::delete('/u/{user}/follow', [ProfileController::class, 'unfollow'])->name('profile.unfollow');

    // Pengaturan akun (semua role) — profil dikelola di SSO, ini hanya tampilan read-only
    Route::get('/settings', [SettingsController::class, 'index'])->name('settings.index');
    Route::patch('/settings/profile-visibility', [SettingsController::class, 'updateProfileVisibility'])->name('settings.profile-visibility.update');
    Route::patch('/settings/locale', [SettingsController::class, 'updateLocale'])->name('settings.locale.update');
    Route::patch('/settings/theme', [SettingsController::class, 'updateTheme'])->name('settings.theme.update');
});

// Admin area
Route::prefix('admin')->name('admin.')->middleware(['auth', 'not_banned', 'check.menu', 'log.admin'])->group(function () {
    Route::get('/dashboard', [AdminDashboardController::class, 'index'])->name('dashboard');

    Route::get('/collections', [AdminCollectionController::class, 'index'])->name('collections.index');
    Route::get('/collections/{user}', [AdminCollectionController::class, 'show'])->name('collections.show');
    Route::get('/loans', [AdminLoanController::class, 'index'])->name('loans.index');
    Route::get('/search-external', [ExternalSearchController::class, 'index'])->name('search-external.index');
    Route::get('/anilist', [AniListController::class, 'index'])->name('anilist.index');
    Route::get('/anilist/search', [AniListController::class, 'searchJson'])->name('anilist.search');
    Route::get('/anilist/status', [AniListController::class, 'statusPage'])->name('anilist.status.page');
    Route::get('/anilist/status/check', [AniListController::class, 'statusCheck'])->name('anilist.status');
    Route::get('/images/search', [ImageSearchController::class, 'search'])->name('images.search');
    Route::get('/command-search', [CommandSearchController::class, 'search'])->name('command-search');
    Route::post('/anilist/import', [AniListController::class, 'import'])->name('anilist.import');
    Route::post('/anilist/bulk-import', [AniListController::class, 'bulkImport'])->name('anilist.bulk-import');
    Route::get('/ranobedb', [RanobeDbController::class, 'index'])->name('ranobedb.index');
    Route::get('/ranobedb/search', [RanobeDbController::class, 'searchJson'])->name('ranobedb.search');
    Route::get('/ranobedb/detail', [RanobeDbController::class, 'detailJson'])->name('ranobedb.detail');
    Route::post('/ranobedb/import', [RanobeDbController::class, 'import'])->name('ranobedb.import');
    Route::delete('/series/bulk', [AdminSeriesController::class, 'bulkDestroy'])->name('series.bulk-destroy');
    Route::patch('/series/restore-bulk', [AdminSeriesController::class, 'restoreBulk'])->name('series.restore-bulk');
    Route::patch('/series/{id}/restore', [AdminSeriesController::class, 'restore'])->name('series.restore');
    Route::resource('series', AdminSeriesController::class);
    Route::post('series/{series}/volumes/generate', [AdminVolumeController::class, 'generate'])->name('series.volumes.generate');
    Route::post('series/{series}/media', [SeriesMediaController::class, 'store'])->name('series.media.store');
    Route::delete('series/media/{seriesMedia}', [SeriesMediaController::class, 'destroy'])->name('series.media.destroy');
    Route::patch('volumes/{volume}/restore', [AdminVolumeController::class, 'restore'])->name('volumes.restore');
    Route::resource('series.volumes', AdminVolumeController::class)
        ->shallow()
        ->except(['index', 'show', 'create']);
    Route::patch('announcements/restore', [AdminAnnouncementController::class, 'restore'])->name('announcements.restore');
    Route::resource('announcements', AdminAnnouncementController::class)
        ->except(['show']);

    // Users
    Route::get('/users', [AdminUserController::class, 'index'])->name('users.index');
    Route::get('/users/{user}', [AdminUserController::class, 'show'])->name('users.show');
    Route::patch('/users/{user}/ban', [AdminUserController::class, 'ban'])->name('users.ban');
    Route::patch('/users/{user}/unban', [AdminUserController::class, 'unban'])->name('users.unban');
    Route::patch('/users/{user}/role', [AdminUserController::class, 'changeRole'])->name('users.role');

    // Menus
    Route::get('/menus', [AdminMenuController::class, 'index'])->name('menus.index');
    Route::get('/menus/user', [AdminMenuController::class, 'userSidebar'])->name('menus.user-sidebar');
    Route::patch('/menus/reorder', [AdminMenuController::class, 'reorder'])->name('menus.reorder');
    Route::get('/menus/{menu}/edit', [AdminMenuController::class, 'edit'])->name('menus.edit');
    Route::match(['put', 'patch'], '/menus/{menu}', [AdminMenuController::class, 'update'])->name('menus.update');

    // Log aktivitas admin
    Route::get('/activity-logs', [ActivityLogController::class, 'index'])->name('activity-logs.index');

    // Kuota AI Funfact
    Route::get('/funfact-quota', [GenreFunfactController::class, 'index'])->name('funfact-quota.index');
    Route::patch('/funfact-quota/{user}/reset', [GenreFunfactController::class, 'reset'])->name('funfact-quota.reset');
    Route::patch('/funfact-quota/{user}/override', [GenreFunfactController::class, 'override'])->name('funfact-quota.override');

    // Tiket dari user
    Route::get('/tickets', [AdminTicketController::class, 'index'])->name('tickets.index');
    Route::get('/tickets/{ticket}', [AdminTicketController::class, 'show'])->name('tickets.show');
    Route::patch('/tickets/{ticket}/respond', [AdminTicketController::class, 'respond'])->name('tickets.respond');

    // Pengaturan — satu halaman, tab Penyimpanan + Database + Konten (super_admin only, ditegakkan lewat role_access menu + Policy)
    Route::get('/settings', [StorageSettingController::class, 'edit'])->name('settings.index');
    Route::put('/settings/storage', [StorageSettingController::class, 'update'])->name('settings.storage.update');
    Route::post('/settings/storage/test', [StorageSettingController::class, 'testConnection'])->name('settings.storage.test');
    Route::put('/settings/content', [SiteSettingController::class, 'update'])->name('settings.content.update');
    Route::put('/settings/ai', [AiSettingController::class, 'update'])->name('settings.ai.update');
    Route::put('/settings/mail', [MailSettingController::class, 'update'])->name('settings.mail.update');

    // Backup & import database (super_admin only)
    Route::get('/settings/database/download', [DatabaseBackupController::class, 'download'])->name('settings.db.download');
    Route::post('/settings/database/import', [DatabaseBackupController::class, 'import'])->name('settings.db.import');
});
