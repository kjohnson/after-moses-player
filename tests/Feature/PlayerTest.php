<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class PlayerTest extends TestCase
{
    public function test_player_lists_every_chapter(): void
    {
        $response = $this->get('/');

        $response->assertOk()
            ->assertSee('After Moses')
            ->assertSee('Europan Extraction')
            ->assertSee('Rings of Interferance')
            ->assertSee('Train to Churchill')
            ->assertSee('The Hawthorne Pact')
            ->assertSee('Bright Crater Diagnosis')
            ->assertSee('Islands in the Night');
    }

    public function test_player_lists_every_book_in_reading_order(): void
    {
        $this->get('/')
            ->assertOk()
            ->assertSeeInOrder(['After Moses', 'Splendid Sam', 'Prodigal'])
            ->assertViewHas('books', fn ($books) => $books->pluck('slug')->all() === ['after-moses', 'splendid-sam', 'prodigal']
                && $books->pluck('label')->all() === ['Book 1', 'Radio drama', 'Book 2']);
    }

    public function test_splendid_sam_is_one_unnumbered_episode(): void
    {
        $this->get('/')
            ->assertOk()
            ->assertSee('Episode 387: For a Dozen Quid of Platinum')
            ->assertSee('Son of Sonnet')
            ->assertViewHas('books', function ($books) {
                $chapters = $books->firstWhere('slug', 'splendid-sam')['chapters'];

                return $chapters->count() === 1 && $chapters->first()['number'] === null;
            });
    }

    public function test_a_book_without_chapters_is_listed_as_coming_soon(): void
    {
        $this->get('/')
            ->assertOk()
            ->assertSee('Coming soon')
            ->assertSeeInOrder(['A Rumor Bound in Journal', 'Beneath the Surface', 'The Prodigal of Ceres'])
            ->assertViewHas('books', fn ($books) => $books->firstWhere('slug', 'prodigal')['chapters']->isEmpty());
    }

    public function test_player_links_to_signed_audio_urls_instead_of_files(): void
    {
        $this->get('/')
            ->assertOk()
            ->assertDontSee('.mp3')
            ->assertViewHas('books', function ($books) {
                $url = $books->first()['chapters']->first()['url'];

                return str_starts_with($url, url('/audio/after-moses/1?expires='))
                    && str_contains($url, 'signature=');
            });
    }

    public function test_player_knows_each_chapters_download_size(): void
    {
        Storage::fake('local');
        Storage::disk('local')->put('after-moses/audio/'.config('audiobook.books.after-moses.chapters.0.file'), str_repeat('a', 1234));

        $this->get('/')
            ->assertOk()
            ->assertViewHas('books', function ($books) {
                $chapters = $books->firstWhere('slug', 'after-moses')['chapters'];

                return $chapters[0]['size'] === 1234 && $chapters[1]['size'] === null;
            });
    }

    public function test_tracks_that_are_not_chapters_are_left_unnumbered(): void
    {
        config(['audiobook.books' => [
            'first' => ['title' => 'First', 'label' => 'Book 1', 'narrator' => 'Reader', 'cover' => 'images/first.jpg', 'ebook' => 'first.epub', 'chapters' => [
                ['title' => 'Opening Credits', 'file' => 'opening-credits.mp3', 'duration' => 10.0, 'numbered' => false],
                ['title' => 'One', 'file' => 'chapter-01-one.mp3', 'duration' => 10.0],
                ['title' => 'Two', 'file' => 'chapter-02-two.mp3', 'duration' => 10.0],
                ['title' => 'Credits', 'file' => 'credits.mp3', 'duration' => 10.0, 'numbered' => false],
            ]],
            'second' => ['title' => 'Second', 'label' => 'Book 2', 'narrator' => 'Reader', 'cover' => 'images/second.jpg', 'ebook' => 'second.epub', 'chapters' => [
                ['title' => 'One', 'file' => 'chapter-01-one.mp3', 'duration' => 10.0],
            ]],
        ]]);

        $this->get('/')
            ->assertOk()
            ->assertViewHas('books', fn ($books) => $books[0]['chapters']->pluck('number')->all() === [null, 1, 2, null]
                && $books[1]['chapters']->pluck('number')->all() === [1]);
    }

    public function test_every_configured_chapter_file_exists(): void
    {
        $disk = Storage::disk(config('audiobook.disk'));

        foreach (config('audiobook.books') as $book => $details) {
            if ($details['chapters'] === []) {
                continue;
            }

            if ($disk->files("{$book}/audio") === []) {
                $this->markTestSkipped("The audio is not in the repo; add it to storage/app/private/{$book}/audio to check it.");
            }

            foreach ($details['chapters'] as $chapter) {
                $this->assertTrue($disk->exists("{$book}/audio/{$chapter['file']}"), "Missing {$book}/audio/{$chapter['file']}");
            }
        }
    }

    public function test_audio_files_are_not_publicly_accessible(): void
    {
        foreach (config('audiobook.books') as $book => $details) {
            foreach ($details['chapters'] as $chapter) {
                $this->assertFileDoesNotExist(public_path("audio/{$chapter['file']}"));
                $this->assertFileDoesNotExist(public_path("{$book}/audio/{$chapter['file']}"));
            }
        }
    }
}
