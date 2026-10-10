# After Moses — Audiobook Player

A mobile-first Laravel site for listening to *After Moses* by Michael F. Kane, narrated by Randy McCarten.

- Chapter list with per-chapter progress
- Resume where you left off (saved in the browser's localStorage)
- Back 15s / forward 30s
- Follow-along text: the ebook's text with the spoken word highlighted (tap a word to jump there)
- Works offline: the chapter that's playing and the next one are saved on the device automatically, and
  "Save all" in the chapters menu saves the whole book. A service worker (`public/sw.js`) serves saved
  chapters, including seeking, and keeps the player itself available without a connection.
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
   The audio isn't committed to git; it's served from object storage.
2. Add an entry to `chapters` in `config/audiobook.php` with its title and duration in seconds:

   ```sh
   ffprobe -v error -show_entries format=duration -of csv=p=0 storage/app/private/audio/chapter-04-some-title.mp3
   ```

3. Upload it to the bucket with `php artisan audiobook:upload s3`.

## Follow-along text

The ebook is `storage/app/private/ebook/After Moses.epub`. Put a WhisperX JSON transcript of each chapter in
`storage/app/private/transcripts/`, named after its MP3, and run `php artisan audiobook:sync`:

```sh
whisperx storage/app/private/audio/chapter-04-the-hawthorne-pact.mp3 --model small.en --language en \
    --compute_type int8 --output_format json --output_dir storage/app/private/transcripts
php artisan audiobook:sync 4
```

The synced text lands in `storage/app/private/text/`. Chapters without it don't show the text button.

## Deploying to Laravel Cloud

1. Push this repo to GitHub/GitLab/Bitbucket and create an application in Laravel Cloud.
2. Build command: `composer install --no-dev && npm ci && npm run build && php artisan optimize`
3. Deploy command: leave empty (there are no migrations to run).
4. Environment variables: `SESSION_DRIVER=cookie`, `CACHE_STORE=file` (no database needed).

### Hosting the audio in Object Storage

The MP3s are too large for the repo, so they live in a private bucket. Locally they sit in
`storage/app/private/audio` (git-ignored), outside the web root. The player only receives signed links
(`/audio/{chapter}?expires=…&signature=…`) that expire after `AUDIOBOOK_URL_LIFETIME` minutes (default 360),
are rate limited, and are refused when opened directly in a browser tab or embedded on another site. To set
up the bucket:

1. Add a **private** Laravel Object Storage bucket to the environment and mark it as the **default disk**
   (any disk name). Redeploy so the bucket's connection is injected. Listeners are then redirected to
   short-lived pre-signed URLs.
2. Copy one of the bucket's access keys (Organization > Resources > Object storage > your bucket >
   Access keys > View credentials) into your local `.env`:

   ```dotenv
   AWS_ACCESS_KEY_ID=…
   AWS_SECRET_ACCESS_KEY=…
   AWS_BUCKET=…
   AWS_ENDPOINT=…
   AWS_DEFAULT_REGION=auto
   ```

3. Upload the files:

   ```sh
   php artisan audiobook:upload s3
   ```

   This copies `audio/*.mp3` and `text/*.json` from local storage into the same folders in the bucket,
   skipping files that are already uploaded unchanged. Run it again after adding chapters or re-running
   `audiobook:sync`. The player checks for new text every 5 minutes.

`AUDIOBOOK_DISK` can name a disk other than the default, but isn't needed on Laravel Cloud.
