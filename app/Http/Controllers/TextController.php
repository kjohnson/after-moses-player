<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Storage;

class TextController extends Controller
{
    /**
     * Send a chapter's follow-along text and word timings to the player.
     */
    public function show(Request $request, int $chapter): Response
    {
        $this->chapterConfig($chapter);

        abort_unless($this->isPlayerRequest($request, ['empty']), 403);

        $disk = Storage::disk(config('audiobook.disk'));
        $path = self::path($chapter);

        abort_unless($disk->exists($path), 404);

        return response($disk->get($path), 200, [
            'Content-Type' => 'application/json',
            'Cache-Control' => 'private, max-age=3600',
            'X-Robots-Tag' => 'noindex, nofollow',
        ]);
    }

    /**
     * Whether a chapter (numbered from 1) has synced text available.
     */
    public static function exists(int $chapter): bool
    {
        return Storage::disk(config('audiobook.disk'))->exists(self::path($chapter));
    }

    /**
     * The disk path of a chapter's synced text (numbered from 1).
     */
    public static function path(int $chapter): string
    {
        return sprintf('text/chapter-%02d.json', $chapter);
    }
}
