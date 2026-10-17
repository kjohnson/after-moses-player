<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Series Details
    |--------------------------------------------------------------------------
    */

    'series' => 'After Moses',

    'author' => 'Michael F. Kane',

    /*
    |--------------------------------------------------------------------------
    | Audio Location
    |--------------------------------------------------------------------------
    |
    | Each book has its own folder (named after its key below) on a private
    | disk, holding its ebook and its "audio", "text" and "transcripts"
    | folders. Nothing is served from a public URL. On the local disk audio
    | is streamed through a signed route; on S3-compatible object storage
    | (e.g. a private Laravel Cloud bucket) listeners are redirected to a
    | short-lived pre-signed URL.
    |
    | Leave AUDIOBOOK_DISK unset to use the default disk: "local" here, and
    | the bucket attached as the default disk on Laravel Cloud.
    |
    | Signed player URLs expire after "url_lifetime" minutes. The player
    | fetches a fresh one automatically if a listener comes back later.
    |
    */

    'disk' => env('AUDIOBOOK_DISK'),

    'url_lifetime' => (int) env('AUDIOBOOK_URL_LIFETIME', 360),

    /*
    |--------------------------------------------------------------------------
    | Books
    |--------------------------------------------------------------------------
    |
    | In reading order. The key names the book's folder and appears in its
    | URLs. Finishing a book carries on into the next. The "label" shows
    | above the book's title in the player. A book with no chapters yet is
    | shown as coming soon, listing its "upcoming_chapters" titles.
    |
    | Splendid Sam is the radio drama from inside the story. Its episode
    | comes from https://www.youtube.com/watch?v=rvICdYvcKwQ (Randy McCarten
    | reads the commercials). It has no ebook, so it has no follow-along text.
    |
    | Running "php artisan audiobook:sync" matches each chapter's text in the
    | ebook against a WhisperX transcript of its audio (in "transcripts") and
    | writes word timings to the "text" folder, which the player reads.
    | Chapters are found in the ebook by a "Chapter N" title matching their
    | place in the list. Add an "epub" key to a chapter to point at a
    | specific file instead, as Prodigal's chapters do since its list starts
    | with the opening credits.
    |
    | Durations are in seconds, so the chapter list can show lengths before
    | any audio has been loaded. Get them with:
    | ffprobe -v error -show_entries format=duration -of csv=p=0 file.mp3
    |
    | Set "numbered" to false for tracks that aren't chapters, like the
    | credits, so they're listed without a chapter number. A chapter's
    | "number" can be set instead, and a book's "chapter_name" names its
    | chapters (Splendid Sam's are "Episode 387", its number in the story).
    |
    */

    'books' => [
        'after-moses' => [
            'title' => 'After Moses',
            'label' => 'Book 1',
            'narrator' => 'Randy McCarten',
            'cover' => 'images/after-moses.jpg',
            'ebook' => 'After Moses.epub',
            'chapters' => [
                [
                    'title' => 'Europan Extraction',
                    'file' => 'chapter-01-europan-extraction.mp3',
                    'duration' => 2250.58,
                ],
                [
                    'title' => 'Rings of Interferance',
                    'file' => 'chapter-02-rings-of-interferance.mp3',
                    'duration' => 2128.48,
                ],
                [
                    'title' => 'Train to Churchill',
                    'file' => 'chapter-03-train-to-churchill.mp3',
                    'duration' => 2665.90,
                ],
                [
                    'title' => 'The Hawthorne Pact',
                    'file' => 'chapter-04-the-hawthorne-pact.mp3',
                    'duration' => 1900.86,
                ],
                [
                    'title' => 'Bright Crater Diagnosis',
                    'file' => 'chapter-05-bright-crater-diagnosis.mp3',
                    'duration' => 2513.93,
                ],
                [
                    'title' => 'Islands in the Night',
                    'file' => 'chapter-06-islands-in-the-night.mp3',
                    'duration' => 1583.73,
                ],
                [
                    'title' => 'Cold Approach',
                    'file' => 'chapter-07-cold-approach.mp3',
                    'duration' => 2023.89,
                ],
                [
                    'title' => 'Fagin’s Brigade',
                    'file' => 'chapter-08-fagins-brigade.mp3',
                    'duration' => 3767.20,
                ],
                [
                    'title' => 'The Titan’s Pride',
                    'file' => 'chapter-09-the-titans-pride.mp3',
                    'duration' => 2782.59,
                ],
                [
                    'title' => 'Grace Like Steel',
                    'file' => 'chapter-10-grace-like-steel.mp3',
                    'duration' => 2228.51,
                ],
                [
                    'title' => 'Between a Rock',
                    'file' => 'chapter-11-between-a-rock.mp3',
                    'duration' => 3117.12,
                ],
                [
                    'title' => 'The Shadow and the Void',
                    'file' => 'chapter-12-the-shadow-and-the-void.mp3',
                    'duration' => 4288.50,
                ],
                [
                    'title' => 'Whispers in the Dark',
                    'file' => 'chapter-13-whispers-in-the-dark.mp3',
                    'duration' => 3623.53,
                ],
                [
                    'title' => 'Matrons',
                    'file' => 'chapter-14-matrons.mp3',
                    'duration' => 2628.32,
                ],
                [
                    'title' => 'Murder in Mercy',
                    'file' => 'chapter-15-murder-in-mercy.mp3',
                    'duration' => 3839.27,
                ],
                [
                    'title' => 'Storms Past and Present',
                    'file' => 'chapter-16-storms-past-and-present.mp3',
                    'duration' => 2708.96,
                ],
                [
                    'title' => 'Fallout',
                    'file' => 'chapter-17-fallout.mp3',
                    'duration' => 3533.15,
                ],
                [
                    'title' => 'The Thresher of Oneiros',
                    'file' => 'chapter-18-the-thresher-of-oneiros.mp3',
                    'duration' => 2442.69,
                ],
                [
                    'title' => 'Tanker Throwdown',
                    'file' => 'chapter-19-tanker-throwdown.mp3',
                    'duration' => 2475.42,
                ],
                [
                    'title' => 'Inciting Incident',
                    'file' => 'chapter-20-inciting-incident.mp3',
                    'duration' => 2347.53,
                ],
                [
                    'title' => 'Villa María',
                    'file' => 'chapter-21-villa-maria.mp3',
                    'duration' => 4718.58,
                ],
                [
                    'title' => 'The Man in the Mirror',
                    'file' => 'chapter-22-the-man-in-the-mirror.mp3',
                    'duration' => 2343.31,
                ],
                [
                    'title' => 'Europan Extraction Redux',
                    'file' => 'chapter-23-europan-extraction-redux.mp3',
                    'duration' => 2612.98,
                ],
                [
                    'title' => 'The Guns of the Vatican',
                    'file' => 'chapter-24-the-guns-of-the-vatican.mp3',
                    'duration' => 3466.64,
                ],
                [
                    'title' => 'Credits and Thank You',
                    'file' => 'credits-and-thank-you.mp3',
                    'duration' => 31.98,
                    'numbered' => false,
                ],
            ],
        ],
        'splendid-sam' => [
            'title' => 'Splendid Sam',
            'label' => 'Radio drama',
            'narrator' => 'Son of Sonnet',
            'cover' => 'images/splendid-sam.jpg',
            'chapter_name' => 'Episode',
            'chapters' => [
                [
                    'title' => 'For a Dozen Quid of Platinum',
                    'file' => 'episode-387-for-a-dozen-quid-of-platinum.mp3',
                    'duration' => 1413.14,
                    'number' => 387,
                ],
            ],
        ],
        'prodigal' => [
            'title' => 'Prodigal',
            'label' => 'Book 2',
            'narrator' => 'Randy McCarten',
            'cover' => 'images/prodigal.jpg',
            'ebook' => 'After Moses Prodigal.epub',
            'chapters' => [],
            'upcoming_chapters' => [
                'A Rumor Bound in Journal',
                'Beneath the Surface',
                'Divergent Paths',
                'Alliances',
                'Night at the Opera',
                'Leader of the Pack',
                'Shanty Town Ascension',
                'Desperation and Consequence',
                'Ganymede Interlude',
                'Two-Thirty-Eight',
                'Homecoming',
                'Heritage',
                'Assault on Bennet Tower',
                'The Sinners’ Summit',
                'The Foundations of the World',
                'The Prodigal of Ceres',
            ],
        ],
    ],

];
