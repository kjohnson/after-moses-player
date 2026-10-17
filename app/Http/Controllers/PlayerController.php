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
        $books = collect(config('audiobook.books'))
            ->map(function (array $book, string $slug): array {
                $number = 0;

                return [
                    'slug' => $slug,
                    'title' => $book['title'],
                    'label' => $book['label'],
                    'narrator' => $book['narrator'],
                    'cover' => asset($book['cover']),
                    'upcomingChapters' => $book['upcoming_chapters'] ?? [],
                    'chapters' => collect($book['chapters'])
                        ->values()
                        ->map(function (array $chapter, int $index) use ($slug, &$number): array {
                            return [
                                'number' => ($chapter['numbered'] ?? true) ? ++$number : null,
                                'title' => $chapter['title'],
                                'duration' => $chapter['duration'],
                                'url' => AudioController::signedUrl($slug, $index + 1),
                                'size' => AudioController::size($slug, $index + 1),
                                'hasText' => TextController::exists($slug, $index + 1),
                            ];
                        }),
                ];
            })
            ->values();

        return view('player', [
            'series' => [
                'title' => config('audiobook.series'),
                'author' => config('audiobook.author'),
            ],
            'books' => $books,
        ]);
    }
}
