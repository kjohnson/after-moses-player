<?php

namespace App\Http\Controllers;

use Illuminate\Contracts\View\View;

class PlayerController extends Controller
{
    /**
     * Show the audiobook player.
     */
    public function __invoke(): View
    {
        $book = config('audiobook');

        $number = 0;

        $chapters = collect($book['chapters'])
            ->values()
            ->map(function (array $chapter, int $index) use (&$number): array {
                return [
                    'number' => ($chapter['numbered'] ?? true) ? ++$number : null,
                    'title' => $chapter['title'],
                    'duration' => $chapter['duration'],
                    'url' => AudioController::signedUrl($index + 1),
                    'size' => AudioController::size($index + 1),
                    'hasText' => TextController::exists($index + 1),
                ];
            });

        return view('player', [
            'book' => [
                'title' => $book['title'],
                'author' => $book['author'],
                'narrator' => $book['narrator'],
                'cover' => asset($book['cover']),
            ],
            'chapters' => $chapters,
        ]);
    }
}
