<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class UploadAudiobookTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        Storage::fake('local');
        Storage::fake('s3');

        config(['audiobook.chapters' => [
            ['title' => 'One', 'file' => 'chapter-01-one.mp3', 'duration' => 10.0],
            ['title' => 'Two', 'file' => 'chapter-02-two.mp3', 'duration' => 10.0],
        ]]);

        Storage::disk('local')->put('audio/chapter-01-one.mp3', 'one');
        Storage::disk('local')->put('audio/chapter-02-two.mp3', 'two');
        Storage::disk('local')->put('text/chapter-01.json', '{}');
        Storage::disk('local')->put('ebook.epub', 'not for the bucket');
    }

    public function test_audio_and_synced_text_are_uploaded(): void
    {
        $this->artisan('audiobook:upload', ['disk' => 's3'])->assertSuccessful();

        $this->assertSame('one', Storage::disk('s3')->get('audio/chapter-01-one.mp3'));
        $this->assertSame('two', Storage::disk('s3')->get('audio/chapter-02-two.mp3'));
        $this->assertSame('{}', Storage::disk('s3')->get('text/chapter-01.json'));
        Storage::disk('s3')->assertMissing('text/chapter-02.json');
        Storage::disk('s3')->assertMissing('ebook.epub');
    }

    public function test_changed_files_are_replaced(): void
    {
        Storage::disk('s3')->put('text/chapter-01.json', '{"old":true}');

        $this->artisan('audiobook:upload', ['disk' => 's3'])->assertSuccessful();

        $this->assertSame('{}', Storage::disk('s3')->get('text/chapter-01.json'));
    }

    public function test_uploading_to_the_source_disk_fails(): void
    {
        $this->artisan('audiobook:upload', ['disk' => 'local'])->assertFailed();
    }
}
