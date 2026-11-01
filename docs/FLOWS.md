# FLOWS — Malas v2

**Version:** 2.5
**Date:** 2026-06-26, updated 2026-08-03

Note: quoted button, menu, and message texts are the literal Indonesian UI strings (the default locale is `id`), with an English gloss added where helpful.

---

## 1. Navigation Map

### Admin Sidebar
```
Dashboard             /admin/dashboard      (stat cards + charts)
├── Katalog (Catalog)
│   ├── Series        /admin/series         (bulk delete, hover card, context menu, ⌘K)
│   └── Volume        (nested in the series detail page, not its own route)
├── Koleksi (Collections)   /admin/collections    (per user, drill-down)
├── Peminjaman (Loans)      /admin/loans
├── Pengguna (Users)        /admin/users
├── Tiket (Tickets)         /admin/tickets
├── Kuota AI Funfact  /admin/funfact-quota  (per-user Genre Taste regenerate quota)
├── Log Aktivitas (Activity Log)     /admin/activity-logs
├── Sistem (System)
│   ├── Menu          /admin/menus          (drag-drop reorder, preview /admin/menus/user)
│   └── Pengumuman (Announcements)    /admin/announcements
├── AniList Search    /admin/anilist
├── RanobeDB Search   /admin/ranobedb       (light novels, parallel to AniList)
├── Search Gabungan (Combined Search)   /admin/search-external (AniList + RanobeDB at once)
└── Pengaturan (Settings)        /admin/settings       (Storage/Database/Content/AI tabs, super_admin only)
```

Note: there is no separate `/admin/roles`. Role management is part of the user detail page (`/admin/users/{id}`). The Command Palette (⌘K/Ctrl+K) is available on all admin pages through a button in the sidebar. The language switch button (id/en/ja) and the ThemeSwitcher (Light/Dark/System) sit side by side in the sidebar footer.

### User Sidebar
```
Dashboard             /dashboard            (stat cards, charts, recommendations Carousel, Genre Taste)
Katalog (Catalog)               /catalog              (browse series, read-only, collector avatars)
Koleksiku (My Collection)             /my-collection        (own collection, poster grid/table)
Wishlist              /wishlist             (series the user wants to read, not yet collected)
Pinjaman Saya (My Loans)         /my-loans
Direktori (Directory)             /directory            (find & follow other users with public profiles)
Tiket (Tickets)                 /tickets
```

Global Search (⌘K/Ctrl+K, or the header search bar on desktop / icon on mobile) is available on all user pages: search titles in Catalog/My Collection or navigate quickly. The language switch button (id/en/ja) and the ThemeSwitcher (Light/Dark/System) sit side by side in the sidebar footer.

The public profile (`/u/{username-or-id}`) is **not in the sidebar**; it is reached through the Directory, share links, or directly from the URL. It can be accessed without login (see §2 Guest Flow).

---

## 2. Auth Flows

### Login — Login Method Modal
```
Landing page → click the "Login" button (header or hero)
  └─ LoginMethodDialog opens — 2 equal options:
        ├─ "Login dengan Yado" (Login with Yado) → continues to SSO Login below
        └─ "Login dengan Email" (Login with Email) → inline email form in the same modal
              → continues to Login with Email (Magic Link) below
```

The same dialog will later also host the "Tambah Akun" (Add Account) feature (multi-account, planned; see backlog).

### SSO Login (Yado)
```
GET /auth/redirect
  └─ Redirect to Yado with a PKCE code_challenge
        └─ User logs in at Yado (outside Malas)
              └─ Redirect back to GET /auth/callback
                    ├─ Exchange code → token, fetch user claims (sso_id, name, username, email, avatar)
                    ├─ New user → created automatically (default role `user`)
                    ├─ Existing user → data updated from the latest SSO claims (name/username/email/avatar
                    │   get refreshed; the only path that re-syncs the profile)
                    └─ Session created → redirect based on role:
                          ├─ admin / super_admin → /admin/dashboard
                          └─ user → /dashboard
```

There is no local register/password form; all accounts (including admins) are managed through SSO. Login with Email (below) is an equal second option, not a replacement.

### Guest Access — Public Profile
```
GET /u/{username-or-id}  (outside the 'auth' middleware group, so accessed without login)
  └─ ProfileController@show
        ├─ Viewer null (guest) → is_guest = true, is_owner = false, is_following = false
        └─ Viewer logged in → is_owner checks $viewer->id === $user->id, is_following checks the Follow relation

Frontend (Profile/Show.tsx):
  ├─ is_guest = true  → renders PublicShell (minimal "Malas" header + a Login button that opens
  │                      LoginMethodDialog, no sidebar)
  │                      The user's collection grid: cover + title only, NOT clickable to /catalog/{slug}
  │                      (because the catalog requires login). The Follow button is replaced by a "Login untuk follow" (Log in to follow) link.
  └─ is_guest = false → renders the normal UserLayout, collection is clickable, Follow button active
```

The `follow`/`unfollow`/`/directory` routes stay inside the `auth` middleware group; guests can view profiles but cannot follow or access the directory without logging in.

### Login with Email (Magic Link)

Originally built as an emergency fallback ("Can't reach SSO?", a small hidden link),
now promoted to an everyday login option equal to SSO, chosen from `LoginMethodDialog`.
The backend mechanism is unchanged; only the entry point changed.

```
LoginMethodDialog → choose "Login dengan Email" → inline email form in the modal
  (or go directly to the standalone page GET /auth/fallback — this link still exists,
   and is also used as the basis for the CLI sso:emergency-login)
        └─ POST /auth/fallback (throttle:5,10)
              ├─ Email matches an existing user AND mail_settings is configured
              │     └─ Issue SsoFallbackToken (SHA-256 hash, TTL 15 minutes, single-use)
              │           └─ Send SsoFallbackLoginMail via Resend
              │                 ├─ Send fails (wrong API key, provider down) → caught by
              │                 │     try/catch, recorded to ActivityLog, NO 500
              │                 └─ Send succeeds → ActivityLog 'auth.fallback_requested'
              └─ Email doesn't match / mail not configured → silently skipped
        The response is ALWAYS the same generic message in both cases (anti email-enumeration)

User clicks the link in the email → GET /auth/fallback/{token}
  ├─ Token invalid/expired/already used → 400, message "link tidak berlaku" (link is not valid)
  └─ Token valid → set used_at, Auth::login(), redirect by role
        (admin → /admin/dashboard, user → /dashboard); SAME as SSO login,
        DIFFERENCE: the profile (name/avatar/username) is NOT re-synced (only SSO syncs)
```

### Emergency Login via CLI
```
Operator SSHes into the server → php artisan sso:emergency-login {role-or-email}
  └─ Resolve identifier: role keyword (super_admin/admin/user) or a specific email/username
        ├─ More than one candidate (same role) → interactive choice
        └─ No match → error, exit 1
  └─ Show who will be granted access → confirmation (y/N)
        └─ If "yes" → SsoFallbackToken::issueFor() (exactly the same token as the email path)
              → print the full URL to the terminal, the operator opens it manually in a browser
```

The only requirement: SSH access to the server (equivalent to direct database access); there is no
public route that issues tokens this easily.

### Protected Route Access
```
Request comes in
  └─ auth middleware
        ├─ Not logged in → redirect /login
        └─ Logged in
              └─ EnsureNotBanned
                    ├─ is_banned = true → redirect /banned (ban info page)
                    └─ Continue
                          └─ CheckMenuAccess
                                ├─ is_maintenance = true (and not admin)
                                │     └─ render Maintenance.tsx with the message
                                ├─ Role not in role_access
                                │     └─ abort(403)
                                └─ Continue to the Controller
```

---

## 3. Admin Flows

### F-A1: Add Series Manually
```
/admin/series → click "Tambah Series" (Add Series)
  └─ Form: title, status, type, cover (upload), synopsis, score, total volumes
        └─ Submit → SeriesController@store
              ├─ Validation fails → back to the form, inline error per field
              └─ Success → redirect /admin/series/{id} + toast "Series berhasil disimpan" (Series saved successfully)
```

### F-A2: Import Series from AniList
```
/admin/anilist → type a title in search
  └─ Debounce → GET /admin/anilist/search?q=...
        ├─ AniList timeout/error → show an error message
        └─ Results appear as overlay cards (cover, title, year, status, 18+ badge if applicable)
              └─ Click "Import"
                    ├─ AniList ID already exists → info toast "Sudah ada di katalog" (Already in the catalog) + view button
                    └─ Not yet present → import (genres/authors/themes/demographics are saved too)
                          stays on the search page, doesn't navigate away
```

Re-syncing AniList metadata to an existing series is available from the "Sync AniList" Popover on the Edit Series page.

### F-A2b: AniList Batch Import (Genre/Year/Popularity)
```
/admin/anilist → choose Genre (dropdown) and/or Year, or turn on "Urutkan Popularitas" (Sort by Popularity)
  (you may browse using only these filters, without typing any title)
        └─ GET /admin/anilist?genre=...&year=...&sort_popularity=1
              └─ Results appear as a grid; items not yet in the catalog get a checkbox
                    in the top-left corner of the card
        └─ Check several items (or click "Pilih Semua" / Select All)
              └─ Click "Import N Series" → POST /admin/anilist/bulk-import { anilist_ids: [...] }
                    └─ AniListService::getMangaBatch() — ONE GraphQL request (id_in) for
                        all selected IDs, not N separate requests
                          └─ Toast: "N series baru, M diperbarui" (N new series, M updated) (+ "K gagal" (K failed) if any)
The toggle "Sembunyikan yang sudah ada di katalog" (Hide those already in the catalog) filters client-side using the already_imported badge.
```

### F-A3: Manage Volumes
```
/admin/series/{id} (series detail page)
  └─ "Volume" tab → volume list
        ├─ Add volume → inline form
        ├─ Edit volume → /admin/volumes/{id}/edit
        ├─ Delete volume → confirmation dialog
        └─ Auto-generate (if status = finished & total_volumes is set)
              └─ "Generate (N)" button → creates volumes 1 through total_volumes that don't exist yet
```

### F-A4: Menu Management
```
/admin/menus → table listing all menus
  └─ Each row has toggles:
        ├─ Visible (shown/not shown in the user sidebar)
        └─ Maintenance (maintenance mode on/off)
  └─ Click "Edit" → form: label, icon, sort_order, role_access, maintenance_message
        └─ Save → the CheckMenuAccess middleware immediately uses the new data
```

### F-A5: Ban User
```
/admin/users → click a user
  └─ /admin/users/{id} → "Ban User" button
        └─ Modal: enter the ban reason
              └─ Confirm → UserController@ban
                    └─ The user is logged out automatically + cannot log in until unbanned
```

### F-A6: Create an Announcement
```
/admin/announcements → click "Buat Pengumuman" (Create Announcement)
  └─ Form: title, body (markdown editor), type, start-end date
        └─ Submit → AnnouncementController@store
              └─ Immediately shown on the dashboard of all active users
```

### F-A7: Import Series from RanobeDB (Light Novel)
```
/admin/ranobedb → type a title in search
  └─ Debounce → GET /admin/ranobedb/search?q=...
        ├─ RanobeDB timeout/error → show an error message
        └─ Results appear as overlay cards (cover, title, year)
              └─ Click a result → GET /admin/ranobedb/detail (full preview: authors, illustrators
              │                separately, genres/themes/demographics from tags[].ttype)
                    └─ Click "Import"
                          ├─ ranobedb_id already exists → info toast "Sudah ada di katalog" + view button
                          └─ Not yet present → import (authors/illustrators/genres/themes/demographics
                                saved separately; the date sentinel 99999999 is treated as "ongoing")
                                stays on the search page, doesn't navigate away

The /admin/search-external page combines AniList + RanobeDB results in one search.
Re-syncing RanobeDB metadata to an existing series is available from the "Sync RanobeDB" Popover on
the Edit Series page (same pattern as "Sync AniList").
```

### F-A8: Reorder Sidebar Menu (Drag & Drop)
```
/admin/menus → drag one of the menu rows (drag handle, @dnd-kit)
  └─ Drop at the new position
        └─ PATCH /admin/menus/reorder { ordered_ids: [...] }
              └─ menus.sort_order is updated to match the new order
                    └─ The user (and admin) sidebar immediately follows the new order on the next request
  └─ "Preview Sidebar User" button → /admin/menus/user
        └─ Re-renders the sidebar exactly as the user sees it, without having to log in as a regular user
```

---

## 4. User Flows

### F-U1: Browse the Catalog

`{slug}` below is the real `series.slug` column (auto-generated from the title, not just a
documentation notation); see `Series::generateUniqueSlug()`. Old UUID-based URLs still work
through the fallback in `resolveRouteBinding()`.

```
/catalog → series grid (cover, title, status badge)
  └─ Filters: status, type, title search, genre (searchable combobox, multi-select, OR-match)
        └─ Click a series → /catalog/{slug}
              └─ Detail page:
                    ├─ Series info (large cover, synopsis, score, status)
                    ├─ Volume list (small cover grid, volume number)
                    └─ "Tambah ke Koleksiku" (Add to My Collection) button → F-U2
```

### F-U2: Add a Series to the Collection
```
Method 1 — from the catalog:
  /catalog/{slug} → click "Tambah ke Koleksiku"
    └─ POST CollectionController@store { series_ids: [id] }
          └─ Success toast / info if it already exists

Method 2 — from the collection page:
  /my-collection → click "Tambah Series"
    └─ Dialog: series search (350ms debounce to /catalog/search)
          └─ Multi-select series (cover grid, checkmark overlay)
                └─ Submit → CollectionController@store { series_ids: [...] }
                      └─ Success toast + page refresh
```

### F-U3: Record Owned Volumes
```
/my-collection/{id} → collection detail page
  └─ Grid of recorded volumes (volume_number, format badge, loan status)
  └─ "Tambah Volume" (Add Volume) button
        └─ Dialog: CSV input of volume numbers (e.g. "1,2,3,5") + choose format
              └─ Submit → CollectionController@storeVolumes
                    └─ Toast: "N volume ditambahkan, M dilewati (sudah ada)" (N volumes added, M skipped (already exist))
  └─ Delete volume → confirmation dialog → CollectionController@destroyVolume
```

### F-U3b: Quick-Edit Volume Count per Format (+/-)
```
/my-collection/{id} → series info → "Jumlah dimiliki" (Owned count) stepper (one per format that
                       already has ≥1 volume, e.g. "Fisik: 12", "Ebook: 3")
  └─ Click "+" → PATCH CollectionController@quickAdjustCount { format, direction: add }
        └─ The next volume number not owned at all (across formats) is created
              └─ Success toast + "Undo" button (calls the same endpoint again, direction: remove)
  └─ Click "-" → PATCH quickAdjustCount { format, direction: remove }
        └─ The highest-numbered volume OF that format is deleted
              └─ If the highest volume is currently on loan → the "-" button is disabled + tooltip,
                 the request is still rejected (info toast) if forced directly to the server;
                 it never silently switches the target to another volume
              └─ Success toast + "Undo" button → PATCH restoreVolumes
```

### F-U4: Record a Loan
```
/my-collection/{id} → click a volume card that isn't on loan → "Pinjamkan" (Lend)
  └─ Modal: borrower name, loan date, return date (optional), notes
        └─ Submit → LoanController@store { collection_volume_id, ... }
              └─ The volume card changes status to "Dipinjam" (On loan)
              └─ Appears in /my-loans
```

### F-U5: Mark as Returned
```
/my-loans → find the active loan
  └─ Click "Tandai Dikembalikan" (Mark as Returned)
        └─ Confirm → LoanController@markReturned
              └─ returned_at is set → status changes to "Dikembalikan" (Returned)
```

### F-U6: Dismiss an Announcement
```
Dashboard → announcement banner appears
  └─ Click ✕ → POST /announcements/{id}/dismiss
        └─ The banner disappears and does not appear again for this user
```

### F-U7: Mark a Volume as Read
```
/my-collection/{id} → click the eye icon on a volume card/row
  └─ PATCH CollectionController@toggleVolumeRead
        └─ read_at is set (or nulled if toggled again) → volume is greyed out
              └─ Success toast with an "Undo" button (calls the same endpoint to revert)
              └─ The "Terakhir dibaca: Vol. N" (Last read: Vol. N) indicator in the header updates too

Mark all at once:
  └─ Click the eye icon to the left of the "Volume yang Dimiliki" (Owned Volumes) heading
        └─ PATCH CollectionController@markAllVolumesRead
              └─ All unread volumes → read_at = now()
                    └─ Toast + "Undo" button → PATCH unmarkVolumesRead
                          (only reverts the volumes changed by this action)

Read progress stepper (+/-): a quick alternative, specifically for linear reading (in order from vol 1 up):
/my-collection/{id} → series info → "Progres baca" (Reading progress) stepper
  └─ Click "+" → PATCH CollectionController@advanceReadProgress { direction: forward }
        └─ The lowest-numbered unread volume → read_at = now()
              └─ Toast + "Undo" button → PATCH toggleVolumeRead (the same endpoint as the
                 manual toggle, automatically returning to the previous state)
  └─ Click "-" → PATCH advanceReadProgress { direction: backward }
        └─ The highest-numbered read volume → read_at = null
  (Doesn't touch volumes marked manually out of order via the eye icon; it only
   shifts one boundary per click)
```

### F-U8: Volume Delete Mode
```
/my-collection/{id} → click the "Hapus" (Delete) button in the volume toolbar
  └─ Enter selection mode — the eye icon on each volume turns into a checkbox
        └─ Select volumes → a "Hapus (N)" button appears
              └─ Confirm → CollectionController@destroyVolumes (bulk)
        └─ Click "Selesai" (Done) → exit selection mode, checkboxes turn back into eye icons
```

### F-U9: Personal Review & Rating
```
/my-collection/{id} → "Review & Rating Pribadi" (Personal Review & Rating) card
  └─ Drag the slider (-10 to +10) + enter a comment
        └─ Click "Simpan Review" (Save Review) → PATCH CollectionController@updateReview
              └─ Success toast, values saved (personal_rating, personal_review)
```

### F-U10: Global Search
```
Click the search bar in the header (or ⌘K / Ctrl+K from any page)
  └─ Command dialog opens → type a query
        ├─ < 2 characters → shows only static navigation (fuzzy-matched by cmdk)
        └─ ≥ 2 characters → 300ms debounce → GET /search?q=...
              └─ Results grouped: Navigation, My Collection, Catalog
                    └─ Click one → router.visit to the related page, dialog closes
```

### F-U11: Wishlist
```
/catalog/{slug} or /catalog → click "Tambah ke Wishlist" (Add to Wishlist)
  └─ POST WishlistController@store { series_id }
        └─ Success toast / info if it's already in the wishlist

/wishlist → grid of wishlisted series
  └─ Click "Hapus" (Delete) → WishlistController@destroy
        └─ Toast + "Undo" button → PATCH WishlistController@restore
  └─ Click "Tambah ke Koleksiku" directly from a wishlist card → same flow as F-U2
```

### F-U12: Public Profile & Follow
```
Opt in to show the profile (in Settings):
/settings → "Profil Publik" (Public Profile) toggle
  └─ PATCH SettingsController@updateProfileVisibility
        └─ is_profile_public saved → the profile can be accessed at /u/{username-or-id}

Follow another user:
/directory (requires login) or /u/{user} → click "Follow"
  └─ POST ProfileController@follow { user }
        └─ The button changes to "Unfollow", follower_count increases
  └─ Click "Unfollow" → DELETE ProfileController@unfollow

Viewing someone else's profile (guest or logged in): see §2 Guest Access — Public Profile for
the difference between the guest and logged-in views.
```

### F-U13: Genre Taste (AI Funfact)
```
Dashboard → "Selera Genre" (Genre Taste) card
  ├─ Genre word cloud computed from the genre distribution of the user's collection
  └─ Funfact text:
        ├─ Provider = puter (default)
        │     └─ Auto-generate on first page load / when the collection grows significantly:
        │           needs_auto_generate = true from the backend → frontend calls window.puter.ai.chat()
        │                 └─ Result sent back → POST dashboard.funfact.auto-save → saved
        │     └─ Click "Generate Ulang" (Regenerate) (manual, limited by weekly quota)
        │           └─ Same client-side flow → POST dashboard.funfact.regenerate
        │                 ├─ Quota exhausted → info toast, button disabled until the window resets
        │                 └─ Success → new funfact saved & shown
        │     └─ Client-side generation fails → POST dashboard.funfact.report-error (logged to ActivityLog)
        └─ Provider = gemini/openai/claude (configured by admin)
              └─ Generation happens server-side in AiFunfactService
                    ├─ HTTP 429 from the provider → AiRateLimitException → fallback text, quota is NOT consumed
                    └─ Success → funfact saved as usual
```

### F-U14: Change Language
```
Click the language button in the sidebar footer (next to the ThemeSwitcher), or the "Bahasa" card in Settings
  └─ Popover: choose id / en / ja
        └─ i18n.changeLanguage(value) — UI changes instantly without reload
        └─ PATCH settings.locale.update { locale } → users.locale saved
              └─ On the next request, server-side App::setLocale() follows the new language
                    (Laravel's built-in validation and paginator messages change too)
```

### F-U15: Change Theme
```
Click the ThemeSwitcher in the sidebar footer (next to the language button), or the "Tema" (Theme) card in Settings
  └─ Popover: choose Light / Dark / System
        └─ Instant local update (localStorage + resolvedTheme via matchMedia if System)
        └─ If logged in: PATCH settings.theme.update { theme } → users.theme saved
        └─ If guest: skip persisting to the server, localStorage is enough
  System: live-updates if the OS preference changes while the app is open (matchMedia listener)
```

---

## 5. Maintenance Mode Flow

```
Admin sets the "Katalog" menu to is_maintenance = true
  └─ A user who accesses /catalog:
        └─ CheckMenuAccess → is_maintenance = true, user is not admin
              └─ render Maintenance.tsx
                    ├─ Maintenance icon
                    ├─ Message: "Katalog sedang dalam pemeliharaan. Coba lagi nanti." (The catalog is under maintenance. Try again later.)
                    │   (or a custom message from maintenance_message in the menus table)
                    └─ "Kembali ke Dashboard" (Back to Dashboard) button

An admin who accesses /catalog:
  └─ CheckMenuAccess → is_maintenance = true, BUT the user is an admin
        └─ Continues normally to the page
        └─ A small "Mode Maintenance Aktif" (Maintenance Mode Active) badge/banner in the top bar as a reminder
```

---

## 6. Error States

| Condition | Display |
|-----------|---------|
| 403 Forbidden | Error page: "Kamu tidak punya akses ke halaman ini" (You don't have access to this page) |
| 404 Not Found | Error page: "Halaman tidak ditemukan" (Page not found) |
| Maintenance | Maintenance page with a custom message |
| User banned | Page: "Akunmu dinonaktifkan. Hubungi admin." (Your account is deactivated. Contact an admin.) |
| AniList/RanobeDB API error | Toast/error message (the page doesn't crash) |
| Upload failed | Inline error on the upload field |
| AI Funfact rate limit (429) | Falls back to default text, manual regenerate quota is not consumed |
| AI Funfact generation failed (client-side) | Error toast + reported to ActivityLog (category `ai`), the dashboard doesn't crash |
