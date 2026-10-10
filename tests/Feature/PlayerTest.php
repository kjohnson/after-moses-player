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

    public function test_player_links_to_signed_audio_urls_instead_of_files(): void
    {
        $this->get('/')
            ->assertOk()
            ->assertDontSee('.mp3')
            ->assertViewHas('chapters', function ($chapters) {
                $url = $chapters->first()['url'];

                return str_starts_with($url, url('/audio/1?expires='))
                    && str_contains($url, 'signature=');
            });
    }

    public function test_player_knows_each_chapters_download_size(): void
    {
        Storage::fake('local');
        Storage::disk('local')->put('audio/'.config('audiobook.chapters.0.file'), str_repeat('a', 1234));

        $this->get('/')
            ->assertOk()
            ->assertViewHas('chapters', fn ($chapters) => $chapters[0]['size'] === 1234 && $chapters[1]['size'] === null);
    }

    public function test_every_configured_chapter_file_exists(): void
    {
        $disk = Storage::disk(config('audiobook.disk'));

        foreach (config('audiobook.chapters') as $chapter) {
            $this->assertTrue($disk->exists('audio/'.$chapter['file']), "Missing audio/{$chapter['file']}");
        }
    }

    public function test_audio_files_are_not_publicly_accessible(): void
    {
        $this->assertFileDoesNotExist(public_path('audio/'.config('audiobook.chapters.0.file')));
    }
}
