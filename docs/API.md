# Malas — Route/API Reference

> This document catalogs **all Laravel routes** in this application. It is not a formal OpenAPI/REST API specification, because Malas is an Inertia.js application (server-side rendering to React, not a JSON API for external consumers). The "Response Type" column shows what each route actually returns:
>
> - **Page (Inertia)**: renders a React component via Inertia, a normal HTML response (or a partial reload if the request comes from Inertia itself)
> - **JSON**: internal AJAX endpoints (search, autocomplete, status check) called with `fetch()` from the frontend, returning plain JSON
> - **Redirect (flash)**: mutation actions (create/update/delete) that return `redirect()->with(...)`, caught by Inertia as a flash message + reload of the originating page
> - **Redirect (external)**: `Inertia::location()`, a forced full-page navigation to an outside URL (used to redirect to the Yado SSO authorize page)
> - **File download**: a `streamDownload()` response
>
> Built-in framework routes (`sanctum/csrf-cookie`, `storage/{path}`, `up`) are deliberately skipped because they are not part of the application's features.
>
> **Access column:**
> - **Guest**: no login required
> - **User (login)**: requires login (`auth`); access to its own menu is controlled granularly through the `role_access` column in the `menus` table (see the `CheckMenuAccess` middleware). Not every "User" route is automatically open to a plain `user` role; some are restricted, check `MenuSeeder.php` for per-menu details
> - **Admin**: `/admin/*` prefix, requires login + role_access covering `admin`/`super_admin` (some Admin routes are even super_admin-only via an explicit `abort_unless()` in the controller, not just the menu; see the "Sistem Otorisasi" section of CLAUDE.md)

Auto-generated from `php artisan route:list`. If there is a new route, regenerate it (the script is in this document's commit history, or run it manually and adjust the table).

---

## Auth & Landing

| Method | Path | Route Name | Controller@Action | Access | Response Type |
|---|---|---|---|---|---|
| GET | `/` | `-` | `Closure` | Guest | Page (Inertia) |
| POST | `/accounts/logout-current` | `accounts.logoutCurrent` | `Auth\AccountController@logoutCurrent` | User (login) | Redirect (flash) |
| POST | `/accounts/switch` | `accounts.switch` | `Auth\AccountController@switch` | User (login) | Redirect (flash) |
| GET | `/auth/callback` | `sso.callback` | `Auth\SsoController@callback` | Guest | Redirect (flash) |
| GET | `/auth/fallback` | `sso.fallback.show` | `Auth\SsoFallbackController@show` | Guest | Page (Inertia) |
| POST | `/auth/fallback` | `sso.fallback.send` | `Auth\SsoFallbackController@send` | Guest | Redirect (flash) |
| GET | `/auth/fallback/{token}` | `sso.fallback.consume` | `Auth\SsoFallbackController@consume` | Guest | Redirect (flash) |
| GET | `/auth/redirect` | `sso.redirect` | `Auth\SsoController@redirect` | Guest | Redirect (external) |
| GET | `/banned` | `banned` | `Closure` | User (login) | Page (Inertia) |
| POST | `/logout` | `logout` | `Auth\SsoController@logout` | User (login) | Redirect (external) |


---

## User (login required)

| Method | Path | Route Name | Controller@Action | Access | Response Type |
|---|---|---|---|---|---|
| POST | `/announcements/{announcement}/dismiss` | `announcements.dismiss` | `AnnouncementController@dismiss` | User (login) | Redirect (flash) |
| GET | `/catalog` | `catalog.index` | `User\SeriesController@index` | User (login) | Page (Inertia) |
| GET | `/catalog/{series}` | `catalog.show` | `User\SeriesController@show` | User (login) | Page (Inertia) |
| GET | `/catalog/search` | `catalog.search` | `User\SeriesController@search` | User (login) | JSON |
| GET | `/collection-groups` | `collection.groups.index` | `User\CollectionGroupController@index` | User (login) | Page (Inertia) |
| POST | `/collection-groups` | `collection.groups.store` | `User\CollectionGroupController@store` | User (login) | Redirect (flash) |
| DELETE | `/collection-groups/{group}` | `collection.groups.destroy` | `User\CollectionGroupController@destroy` | User (login) | Redirect (flash) |
| GET | `/collection-groups/{group}` | `collection.groups.show` | `User\CollectionGroupController@show` | Guest | Page (Inertia) |
| PATCH | `/collection-groups/{group}` | `collection.groups.update` | `User\CollectionGroupController@update` | User (login) | Redirect (flash) |
| POST | `/collection-groups/{group}/items` | `collection.groups.items.add` | `User\CollectionGroupController@addItems` | User (login) | Redirect (flash) |
| DELETE | `/collection-groups/{group}/items/{collection}` | `collection.groups.items.remove` | `User\CollectionGroupController@removeItem` | User (login) | Redirect (flash) |
| PATCH | `/collection-groups/{group}/items/undo-remove` | `collection.groups.items.undoRemove` | `User\CollectionGroupController@undoRemoveItem` | User (login) | Redirect (flash) |
| PATCH | `/collection-groups/{group}/visibility` | `collection.groups.visibility.update` | `User\CollectionGroupController@updateVisibility` | User (login) | Redirect (flash) |
| GET | `/dashboard` | `dashboard` | `User\DashboardController@index` | User (login) | Page (Inertia) |
| POST | `/dashboard/funfact/regenerate` | `dashboard.funfact.regenerate` | `User\DashboardController@regenerateFunfact` | User (login) | Redirect (flash) |
| GET | `/dashboard/genre-detail` | `dashboard.genre-detail` | `User\DashboardController@genreDetail` | User (login) | JSON |
| GET | `/dashboard/surprise-me` | `dashboard.surprise-me` | `User\DashboardController@surpriseMe` | User (login) | JSON |
| GET | `/directory` | `directory.index` | `User\ProfileController@directory` | User (login) | Page (Inertia) |
| PUT | `/loans/{loan}/return` | `loans.return` | `User\LoanController@markReturned` | User (login) | Redirect (flash) |
| GET | `/my-collection` | `collection.index` | `User\CollectionController@index` | User (login) | Page (Inertia) |
| POST | `/my-collection` | `collection.store` | `User\CollectionController@store` | User (login) | Redirect (flash) |
| DELETE | `/my-collection/{collection}` | `collection.destroy` | `User\CollectionController@destroy` | User (login) | Redirect (flash) |
| GET | `/my-collection/{collection}` | `collection.show` | `User\CollectionController@show` | User (login) | Page (Inertia) |
| PATCH | `/my-collection/{collection}/condition` | `collection.condition.update` | `User\CollectionController@updateCondition` | User (login) | Redirect (flash) |
| POST | `/my-collection/{collection}/loans` | `loans.store` | `User\LoanController@store` | User (login) | Redirect (flash) |
| PATCH | `/my-collection/{collection}/review` | `collection.review.update` | `User\CollectionController@updateReview` | User (login) | Redirect (flash) |
| POST | `/my-collection/{collection}/volumes` | `collection.volumes.store` | `User\CollectionController@storeVolumes` | User (login) | Redirect (flash) |
| DELETE | `/my-collection/{collection}/volumes/{collectionVolume}` | `collection.volumes.destroy` | `User\CollectionController@destroyVolume` | User (login) | Redirect (flash) |
| PATCH | `/my-collection/{collection}/volumes/{collectionVolume}/format` | `collection.volumes.updateFormat` | `User\CollectionController@updateVolumeFormat` | User (login) | Redirect (flash) |
| PATCH | `/my-collection/{collection}/volumes/{collectionVolume}/read` | `collection.volumes.toggleRead` | `User\CollectionController@toggleVolumeRead` | User (login) | Redirect (flash) |
| DELETE | `/my-collection/{collection}/volumes/bulk` | `collection.volumes.destroyBulk` | `User\CollectionController@destroyVolumes` | User (login) | Redirect (flash) |
| PATCH | `/my-collection/{collection}/volumes/format-bulk` | `collection.volumes.updateFormatBulk` | `User\CollectionController@updateVolumesFormat` | User (login) | Redirect (flash) |
| PATCH | `/my-collection/{collection}/volumes/quick-count` | `collection.volumes.quickCount` | `User\CollectionController@quickAdjustCount` | User (login) | Redirect (flash) |
| PATCH | `/my-collection/{collection}/volumes/read-all` | `collection.volumes.readAll` | `User\CollectionController@markAllVolumesRead` | User (login) | Redirect (flash) |
| PATCH | `/my-collection/{collection}/volumes/read-progress` | `collection.volumes.readProgress` | `User\CollectionController@advanceReadProgress` | User (login) | Redirect (flash) |
| PATCH | `/my-collection/{collection}/volumes/restore` | `collection.volumes.restore` | `User\CollectionController@restoreVolumes` | User (login) | Redirect (flash) |
| PATCH | `/my-collection/{collection}/volumes/unmark-read` | `collection.volumes.unmarkRead` | `User\CollectionController@unmarkVolumesRead` | User (login) | Redirect (flash) |
| GET | `/my-collection/export` | `collection.export` | `User\CollectionController@export` | User (login) | File download |
| POST | `/my-collection/import` | `collection.import` | `User\CollectionController@import` | User (login) | Redirect (flash) |
| PATCH | `/my-collection/undo-destroy` | `collection.undo-destroy` | `User\CollectionController@undoDestroy` | User (login) | Redirect (flash) |
| PATCH | `/my-collection/undo-store` | `collection.undo-store` | `User\CollectionController@undoStore` | User (login) | Redirect (flash) |
| GET | `/my-loans` | `loans.index` | `User\LoanController@index` | User (login) | Page (Inertia) |
| GET | `/search` | `search` | `User\SearchController@search` | User (login) | JSON |
| GET | `/settings` | `settings.index` | `SettingsController@index` | User (login) | Page (Inertia) |
| PATCH | `/settings/locale` | `settings.locale.update` | `SettingsController@updateLocale` | User (login) | Redirect (flash) |
| PATCH | `/settings/profile-visibility` | `settings.profile-visibility.update` | `SettingsController@updateProfileVisibility` | User (login) | Redirect (flash) |
| PATCH | `/settings/theme` | `settings.theme.update` | `SettingsController@updateTheme` | User (login) | Redirect (flash) |
| GET | `/tickets` | `tickets.index` | `User\TicketController@index` | User (login) | Page (Inertia) |
| POST | `/tickets` | `tickets.store` | `User\TicketController@store` | User (login) | Redirect (flash) |
| GET | `/tickets/{ticket}` | `tickets.show` | `User\TicketController@show` | User (login) | Page (Inertia) |
| GET | `/tickets/create` | `tickets.create` | `User\TicketController@create` | User (login) | Page (Inertia) |
| GET | `/u/{user}` | `profile.show` | `User\ProfileController@show` | Guest | Page (Inertia) |
| DELETE | `/u/{user}/follow` | `profile.unfollow` | `User\ProfileController@unfollow` | User (login) | Redirect (flash) |
| POST | `/u/{user}/follow` | `profile.follow` | `User\ProfileController@follow` | User (login) | Redirect (flash) |
| GET | `/wishlist` | `wishlist.index` | `User\WishlistController@index` | User (login) | Page (Inertia) |
| POST | `/wishlist` | `wishlist.store` | `User\WishlistController@store` | User (login) | Redirect (flash) |
| DELETE | `/wishlist/{wishlistItem}` | `wishlist.destroy` | `User\WishlistController@destroy` | User (login) | Redirect (flash) |
| PATCH | `/wishlist/restore` | `wishlist.restore` | `User\WishlistController@restore` | User (login) | Redirect (flash) |


---

## Admin

| Method | Path | Route Name | Controller@Action | Access | Response Type |
|---|---|---|---|---|---|
| GET | `/admin/activity-logs` | `admin.activity-logs.index` | `Admin\ActivityLogController@index` | Admin | Page (Inertia) |
| GET | `/admin/anilist` | `admin.anilist.index` | `Admin\AniListController@index` | Admin | Page (Inertia) |
| POST | `/admin/anilist/bulk-import` | `admin.anilist.bulk-import` | `Admin\AniListController@bulkImport` | Admin | Redirect (flash) |
| POST | `/admin/anilist/import` | `admin.anilist.import` | `Admin\AniListController@import` | Admin | Redirect (flash) |
| GET | `/admin/anilist/search` | `admin.anilist.search` | `Admin\AniListController@searchJson` | Admin | JSON |
| GET | `/admin/anilist/status` | `admin.anilist.status.page` | `Admin\AniListController@statusPage` | Admin | Page (Inertia) |
| GET | `/admin/anilist/status/check` | `admin.anilist.status` | `Admin\AniListController@statusCheck` | Admin | JSON |
| GET | `/admin/announcements` | `admin.announcements.index` | `Admin\AnnouncementController@index` | Admin | Page (Inertia) |
| POST | `/admin/announcements` | `admin.announcements.store` | `Admin\AnnouncementController@store` | Admin | Redirect (flash) |
| DELETE | `/admin/announcements/{announcement}` | `admin.announcements.destroy` | `Admin\AnnouncementController@destroy` | Admin | Redirect (flash) |
| PUT|PATCH | `/admin/announcements/{announcement}` | `admin.announcements.update` | `Admin\AnnouncementController@update` | Admin | Redirect (flash) |
| GET | `/admin/announcements/{announcement}/edit` | `admin.announcements.edit` | `Admin\AnnouncementController@edit` | Admin | Page (Inertia) |
| GET | `/admin/announcements/create` | `admin.announcements.create` | `Admin\AnnouncementController@create` | Admin | Page (Inertia) |
| PATCH | `/admin/announcements/restore` | `admin.announcements.restore` | `Admin\AnnouncementController@restore` | Admin | Redirect (flash) |
| GET | `/admin/collections` | `admin.collections.index` | `Admin\CollectionController@index` | Admin | Page (Inertia) |
| GET | `/admin/collections/{user}` | `admin.collections.show` | `Admin\CollectionController@show` | Admin | Page (Inertia) |
| GET | `/admin/command-search` | `admin.command-search` | `Admin\CommandSearchController@search` | Admin | JSON |
| GET | `/admin/dashboard` | `admin.dashboard` | `Admin\DashboardController@index` | Admin | Page (Inertia) |
| GET | `/admin/funfact-quota` | `admin.funfact-quota.index` | `Admin\GenreFunfactController@index` | Admin | Page (Inertia) |
| PATCH | `/admin/funfact-quota/{user}/override` | `admin.funfact-quota.override` | `Admin\GenreFunfactController@override` | Admin | Redirect (flash) |
| PATCH | `/admin/funfact-quota/{user}/reset` | `admin.funfact-quota.reset` | `Admin\GenreFunfactController@reset` | Admin | Redirect (flash) |
| GET | `/admin/images/search` | `admin.images.search` | `Admin\ImageSearchController@search` | Admin | JSON |
| GET | `/admin/loans` | `admin.loans.index` | `Admin\LoanController@index` | Admin | Page (Inertia) |
| GET | `/admin/menus` | `admin.menus.index` | `Admin\MenuController@index` | Admin | Page (Inertia) |
| PUT|PATCH | `/admin/menus/{menu}` | `admin.menus.update` | `Admin\MenuController@update` | Admin | Redirect (flash) |
| GET | `/admin/menus/{menu}/edit` | `admin.menus.edit` | `Admin\MenuController@edit` | Admin | Page (Inertia) |
| PATCH | `/admin/menus/reorder` | `admin.menus.reorder` | `Admin\MenuController@reorder` | Admin | Redirect (flash) |
| GET | `/admin/menus/user` | `admin.menus.user-sidebar` | `Admin\MenuController@userSidebar` | Admin | Page (Inertia) |
| GET | `/admin/ranobedb` | `admin.ranobedb.index` | `Admin\RanobeDbController@index` | Admin | Page (Inertia) |
| GET | `/admin/ranobedb/detail` | `admin.ranobedb.detail` | `Admin\RanobeDbController@detailJson` | Admin | JSON |
| POST | `/admin/ranobedb/import` | `admin.ranobedb.import` | `Admin\RanobeDbController@import` | Admin | Redirect (flash) |
| GET | `/admin/ranobedb/search` | `admin.ranobedb.search` | `Admin\RanobeDbController@searchJson` | Admin | JSON |
| GET | `/admin/search-external` | `admin.search-external.index` | `Admin\ExternalSearchController@index` | Admin | Page (Inertia) |
| GET | `/admin/series` | `admin.series.index` | `Admin\SeriesController@index` | Admin | Page (Inertia) |
| POST | `/admin/series` | `admin.series.store` | `Admin\SeriesController@store` | Admin | Redirect (flash) |
| PATCH | `/admin/series/{id}/restore` | `admin.series.restore` | `Admin\SeriesController@restore` | Admin | Redirect (flash) |
| DELETE | `/admin/series/{series}` | `admin.series.destroy` | `Admin\SeriesController@destroy` | Admin | Redirect (flash) |
| GET | `/admin/series/{series}` | `admin.series.show` | `Admin\SeriesController@show` | Admin | Page (Inertia) |
| PUT|PATCH | `/admin/series/{series}` | `admin.series.update` | `Admin\SeriesController@update` | Admin | Redirect (flash) |
| GET | `/admin/series/{series}/edit` | `admin.series.edit` | `Admin\SeriesController@edit` | Admin | Page (Inertia) |
| POST | `/admin/series/{series}/media` | `admin.series.media.store` | `Admin\SeriesMediaController@store` | Admin | Redirect (flash) |
| POST | `/admin/series/{series}/volumes` | `admin.series.volumes.store` | `Admin\VolumeController@store` | Admin | Redirect (flash) |
| POST | `/admin/series/{series}/volumes/generate` | `admin.series.volumes.generate` | `Admin\VolumeController@generate` | Admin | Redirect (flash) |
| DELETE | `/admin/series/bulk` | `admin.series.bulk-destroy` | `Admin\SeriesController@bulkDestroy` | Admin | Redirect (flash) |
| GET | `/admin/series/create` | `admin.series.create` | `Admin\SeriesController@create` | Admin | Page (Inertia) |
| DELETE | `/admin/series/media/{seriesMedia}` | `admin.series.media.destroy` | `Admin\SeriesMediaController@destroy` | Admin | Redirect (flash) |
| PATCH | `/admin/series/restore-bulk` | `admin.series.restore-bulk` | `Admin\SeriesController@restoreBulk` | Admin | Redirect (flash) |
| GET | `/admin/settings` | `admin.settings.index` | `Admin\StorageSettingController@edit` | Admin | Page (Inertia) |
| PUT | `/admin/settings/ai` | `admin.settings.ai.update` | `Admin\AiSettingController@update` | Admin | Redirect (flash) |
| PUT | `/admin/settings/content` | `admin.settings.content.update` | `Admin\SiteSettingController@update` | Admin | Redirect (flash) |
| GET | `/admin/settings/database/download` | `admin.settings.db.download` | `Admin\DatabaseBackupController@download` | Admin | File download |
| POST | `/admin/settings/database/import` | `admin.settings.db.import` | `Admin\DatabaseBackupController@import` | Admin | Redirect (flash) |
| PUT | `/admin/settings/mail` | `admin.settings.mail.update` | `Admin\MailSettingController@update` | Admin | Redirect (flash) |
| PUT | `/admin/settings/storage` | `admin.settings.storage.update` | `Admin\StorageSettingController@update` | Admin | Redirect (flash) |
| POST | `/admin/settings/storage/test` | `admin.settings.storage.test` | `Admin\StorageSettingController@testConnection` | Admin | JSON |
| GET | `/admin/tickets` | `admin.tickets.index` | `Admin\TicketController@index` | Admin | Page (Inertia) |
| GET | `/admin/tickets/{ticket}` | `admin.tickets.show` | `Admin\TicketController@show` | Admin | Page (Inertia) |
| PATCH | `/admin/tickets/{ticket}/respond` | `admin.tickets.respond` | `Admin\TicketController@respond` | Admin | Redirect (flash) |
| GET | `/admin/users` | `admin.users.index` | `Admin\UserController@index` | Admin | Page (Inertia) |
| GET | `/admin/users/{user}` | `admin.users.show` | `Admin\UserController@show` | Admin | Page (Inertia) |
| PATCH | `/admin/users/{user}/ban` | `admin.users.ban` | `Admin\UserController@ban` | Admin | Redirect (flash) |
| PATCH | `/admin/users/{user}/role` | `admin.users.role` | `Admin\UserController@changeRole` | Admin | Redirect (flash) |
| PATCH | `/admin/users/{user}/unban` | `admin.users.unban` | `Admin\UserController@unban` | Admin | Redirect (flash) |
| DELETE | `/admin/volumes/{volume}` | `admin.volumes.destroy` | `Admin\VolumeController@destroy` | Admin | Redirect (flash) |
| PUT|PATCH | `/admin/volumes/{volume}` | `admin.volumes.update` | `Admin\VolumeController@update` | Admin | Redirect (flash) |
| GET | `/admin/volumes/{volume}/edit` | `admin.volumes.edit` | `Admin\VolumeController@edit` | Admin | Page (Inertia) |
| PATCH | `/admin/volumes/{volume}/restore` | `admin.volumes.restore` | `Admin\VolumeController@restore` | Admin | Redirect (flash) |


