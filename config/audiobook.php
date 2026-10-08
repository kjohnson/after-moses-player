<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Book Details
    |--------------------------------------------------------------------------
    */

    'title' => 'After Moses',

    'author' => 'Michael F. Kane',

    'narrator' => 'Randy McCarten',

    'cover' => 'images/cover.jpg',

    /*
    |--------------------------------------------------------------------------
    | Audio Location
    |--------------------------------------------------------------------------
    |
    | Chapters live in the "audio" folder of a private disk and are never
    | served from a public URL. On the local disk they're streamed through a
    | signed route; on S3-compatible object storage (e.g. a private Laravel
    | Cloud bucket) listeners are redirected to a short-lived pre-signed URL.
    |
    | Signed player URLs expire after "url_lifetime" minutes. The player
    | fetches a fresh one automatically if a listener comes back later.
    |
    */

    'disk' => env('AUDIOBOOK_DISK', 'local'),

    'url_lifetime' => (int) env('AUDIOBOOK_URL_LIFETIME', 360),

    /*
    |--------------------------------------------------------------------------
    | Chapters
    |--------------------------------------------------------------------------
    |
    | Durations are in seconds, so the chapter list can show lengths before
    | any audio has been loaded. Get them with:
    | ffprobe -v error -show_entries format=duration -of csv=p=0 file.mp3
    |
    */

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
    ],

];
