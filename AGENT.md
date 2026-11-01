# Malas — Agent Context

Read this file before working on any task in this project.

## What is Malas?

**Malas** (Manga Library Admin System) adalah a web app for managing a personal manga collection and library.

Two sides:
- **Admin panel** — manage catalog, users, menus, announcements
- **User-facing** — browse the catalog, manage a personal collection, record loans

The UI is inspired by MangaDex (mangadex.org): card-based, cover-forward, dark/light mode.

---

## Stack

| | |
|--|--|
| Backend | Laravel 12 |
| Frontend | React 19 + TypeScript 5 via Inertia.js v2 |
| UI | shadcn/ui (Base UI) + Tailwind CSS v4 + Recharts + embla-carousel-react + cmdk |
| DB (dev) | SQLite |
| DB (prod) | MySQL 8+ |
| Auth | SSO Yado (PKCE OAuth2) + Spatie Permission — no local login |
| Storage | Local disk or S3-compatible (Cloudflare R2, etc.), configured via the admin UI, not `.env` |
| External API | AniList GraphQL — import manga/manhwa/manhua/novel metadata |
| Bundler | Vite |

---

## Roles

| Role | Description |
|------|-----------|
| `super_admin` | Full access, cannot be banned |
| `admin` | Full access except managing super_admin |
| `user` | Browse the catalog (read-only), manage own collection |

---

## Main Features

1. **Menu Management** — admin toggles visibility & maintenance mode per menu
2. **Series & Volume Catalog** — admin CRUD (+ import/sync from AniList), user browses read-only
3. **User Collection** — users record owned manga per volume, track reading per volume, personal review & rating (-10..10)
4. **Loans** — record volume loans
5. **Announcements** — announcements from admin to all users
6. **Sistem Tiket** — users request new titles for the catalog, admin responds
7. **Dashboard** — stat cards + chart (Recharts), genre recommendations + Surprise Me (user)
8. **Global Search / Command Palette** — ⌘K in admin & user, search data + quick navigation
9. **Storage & Database Backup** — Local/S3 configuration and DB backup via UI (super_admin)
10. **Activity Log** — audit trail of sensitive admin actions
11. **Undo on toast** — reversible actions (mark as read, etc.) can be undone straight from the notification

Role management is not a separate menu; it is done from the user detail page (`/admin/users/{id}`).

---

## Navigation per Role

**Admin sidebar:**
Dashboard → Series → Collections (all) → Loans → Users → Tickets → Activity Log → Menus → Announcements → AniList Search → Settings (super_admin)

**User sidebar:**
Dashboard → Catalog (read-only) → My Collection → My Loans → Tickets

Changing a user's role is done from the user detail page, not a separate "Roles" menu.

---

## Key Commands

```bash
# Development
php artisan serve          # start Laravel (port 8000)
npm run dev                # start Vite

# Database
php artisan migrate        # run migrations
php artisan migrate:fresh --seed  # reset + seed
php artisan db:seed        # seed data

# Type checking
npx tsc --noEmit           # TypeScript check (0 error = pass)

# Tinker
php artisan tinker         # interactive REPL

# Cache
php artisan optimize:clear # clear all caches
php artisan optimize       # rebuild all caches
```

---

## Required Reading

| File | Contents |
|------|-----|
| `CLAUDE.md` | Coding rules, naming conventions, prohibitions |
| `docs/prd.md` | Full requirements + access matrix |
| `docs/ARCHITECTURE.md` | DB schema, folder structure |
| `docs/FLOWS.md` | Navigation map + user flows |
| `docs/PHASES.md` | Implementation phase breakdown + checklist |
| `QA.md` | Instructions for the QA chat once code is done |
| `CHANGELOG.md` | Change history by date |

---

## Key Patterns

### Controller → Inertia Page
```php
// Admin controller
return Inertia::render('Admin/Series/Index', [
    'series'  => SeriesResource::collection(Series::paginate(20)),
    'filters' => request()->only(['status', 'search']),
    'can'     => ['create' => $user->can('create', Series::class)],
]);
```

### Policy check di controller
```php
$this->authorize('update', $series); // throws 403 if no access
```

### Menu maintenance check
`CheckMenuAccess` middleware runs automatically on every request. No manual check needed in controllers.

### Form submission (Inertia)
```typescript
const form = useForm({ title: '', status: 'publishing' })
form.post(route('admin.series.store'), {
  onSuccess: () => toast.success('Series berhasil disimpan'),
})
```

---

## Things NOT to Do

- Do not start implementing if the user's message ends with "gimana?" (that is a discussion)
- Do not modify files in `resources/js/components/ui/` (shadcn source)
- Do not skip middleware or policies
- Do not commit `.env`
