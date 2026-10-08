<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\URL;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

class AudioController extends Controller
{
    /**
     * Stream a chapter's audio to the player.
     */
    public function stream(Request $request, int $chapter): BinaryFileResponse|RedirectResponse
    {
        $file = $this->chapterFile($chapter);

        abort_unless($this->isPlayerRequest($request, ['audio', 'video', 'empty']), 403);

        $diskName = config('audiobook.disk');
        $disk = Storage::disk($diskName);
        $path = 'audio/'.$file;

        if (config("filesystems.disks.{$diskName}.driver") !== 'local') {
            return redirect()->away($disk->temporaryUrl($path, now()->addMinutes(10)));
        }

        abort_unless($disk->exists($path), 404);

        return response()->file($disk->path($path), [
            'Content-Type' => 'audio/mpeg',
            'Content-Disposition' => 'inline',
            'Cache-Control' => 'private, max-age=3600',
            'X-Robots-Tag' => 'noindex, nofollow',
        ]);
    }

    /**
     * Issue a fresh signed URL for a chapter whose previous URL has expired.
     */
    public function refresh(Request $request, int $chapter): JsonResponse
    {
        $this->chapterFile($chapter);

        abort_unless($this->isPlayerRequest($request, ['empty']), 403);

        return response()->json(['url' => self::signedUrl($chapter)])
            ->header('Cache-Control', 'no-store')
            ->header('X-Robots-Tag', 'noindex, nofollow');
    }

    /**
     * Build a temporary signed URL for a chapter (numbered from 1).
     */
    public static function signedUrl(int $chapter): string
    {
        return URL::temporarySignedRoute(
            'audio',
            now()->addMinutes(config('audiobook.url_lifetime')),
            ['chapter' => $chapter],
        );
    }

    /**
     * Resolve a chapter's file name, or abort if the chapter doesn't exist.
     */
    private function chapterFile(int $chapter): string
    {
        $chapters = array_values(config('audiobook.chapters'));

        abort_unless(isset($chapters[$chapter - 1]), 404);

        return $chapters[$chapter - 1]['file'];
    }

    /**
     * Whether the request looks like it came from the player rather than a
     * pasted link, a hotlinking site, or a script.
     *
     * Browsers send Fetch Metadata headers automatically. Older browsers that
     * don't send them at all are let through so they can still listen.
     *
     * @param  array<int, string>  $allowedDestinations
     */
    private function isPlayerRequest(Request $request, array $allowedDestinations): bool
    {
        $site = $request->header('Sec-Fetch-Site');
        $destination = $request->header('Sec-Fetch-Dest');

        if ($site === null && $destination === null) {
            return true;
        }

        return in_array($site, ['same-origin', 'none'], true)
            && in_array($destination, $allowedDestinations, true);
    }
}
