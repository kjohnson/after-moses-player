# After Moses — Audiobook Player

A mobile-first Laravel site for listening to *After Moses* by Michael F. Kane, narrated by Randy McCarten.

- Chapter list with per-chapter progress
- Resume where you left off (saved in the browser's localStorage)
- Back 15s / forward 30s, playback speed, sleep timer (minutes or end of chapter)
- Lock-screen and headphone controls via the Media Session API
- Installable to the home screen (web app manifest)

No database is required.

## Local development

```sh
composer install
npm install
cp .env.example .env && php artisan key:generate
composer run dev
```

> `php artisan serve` doesn't support HTTP range requests, so seeking in Safari/iOS only works against a real web server (Laravel Cloud, Herd, Valet, nginx).

## Adding chapters

1. Drop the MP3 in `storage/app/private/audio/` (lowercase, no spaces, e.g. `chapter-04-some-title.mp3`).
2. Add an entry to `chapters` in `config/audiobook.php` with its title and duration in seconds:

   ```sh
   ffprobe -v error -show_entries format=duration -of csv=p=0 storage/app/private/audio/chapter-04-some-title.mp3
   ```

## Deploying to Laravel Cloud

1. Push this repo to GitHub/GitLab/Bitbucket and create an application in Laravel Cloud.
2. Build command: `composer install --no-dev && npm ci && npm run build && php artisan optimize`
3. Deploy command: leave empty (there are no migrations to run).
4. Environment variables: `SESSION_DRIVER=cookie`, `CACHE_STORE=file` (no database needed).

### Hosting the audio in Object Storage (recommended as the book grows)

The MP3s ship in the repo under `storage/app/private/audio` (~110 MB for three chapters), outside the
web root. The player only receives signed links (`/audio/{chapter}?expires=…&signature=…`) that expire
after `AUDIOBOOK_URL_LIFETIME` minutes (default 360), are rate limited, and are refused when opened
directly in a browser tab or embedded on another site. To move the files out of the repo:

1. Create a **private** Laravel Cloud Object Storage bucket, attach it to the app as a disk, and upload
   the files into an `audio/` folder.
2. Set `AUDIOBOOK_DISK` to that disk's name. Listeners are redirected to short-lived pre-signed URLs.
3. Delete the files from `storage/app/private/audio` (and keep `config/audiobook.php` file names matching the bucket).
