<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}">
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
        <meta name="theme-color" content="#120d1c">
        <meta name="description" content="Listen to {{ $book['title'] }} by {{ $book['author'] }}, narrated by {{ $book['narrator'] }}.">
        <meta name="apple-mobile-web-app-capable" content="yes">
        <meta name="mobile-web-app-capable" content="yes">
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
        <meta name="apple-mobile-web-app-title" content="{{ $book['title'] }}">

        <meta property="og:title" content="{{ $book['title'] }} — Audiobook">
        <meta property="og:description" content="By {{ $book['author'] }}, narrated by {{ $book['narrator'] }}.">
        <meta property="og:image" content="{{ $book['cover'] }}">

        <title>{{ $book['title'] }} — Audiobook</title>

        <link rel="manifest" href="{{ asset('manifest.webmanifest') }}">
        <link rel="icon" type="image/png" href="{{ asset('images/icon-192.png') }}">
        <link rel="apple-touch-icon" href="{{ asset('apple-touch-icon.png') }}">
        <link rel="preload" as="image" href="{{ $book['cover'] }}">

        @vite(['resources/css/app.css', 'resources/js/app.js'])
    </head>
    <body class="min-h-dvh bg-night-950 text-sand-50 antialiased select-none">
        <script type="application/json" id="audiobook-data">
            @json(['book' => $book, 'chapters' => $chapters])
        </script>

        {{-- Blurred cover backdrop --}}
        <div aria-hidden="true" class="pointer-events-none fixed inset-0 overflow-hidden">
            <img src="{{ $book['cover'] }}" alt="" class="absolute inset-0 size-full scale-125 object-cover opacity-30 blur-3xl">
            <div class="absolute inset-0 bg-linear-to-b from-night-950/40 via-night-950/80 to-night-950"></div>
        </div>

        <main
            id="player"
            class="relative mx-auto flex min-h-dvh max-w-md flex-col px-6 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]"
        >
            <header class="flex items-center justify-between py-2">
                <div class="min-w-0">
                    <p class="text-xs font-medium tracking-[0.2em] text-sand-400 uppercase">Audiobook</p>
                    <h1 class="truncate text-base font-semibold">{{ $book['title'] }}</h1>
                </div>
                <button
                    type="button"
                    data-action="open-chapters"
                    class="tap -mr-2 flex size-11 items-center justify-center rounded-full text-sand-200"
                    aria-label="Show chapters"
                >
                    <svg class="size-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/></svg>
                </button>
            </header>

            <div class="flex flex-1 flex-col justify-center py-4">
                <img
                    src="{{ $book['cover'] }}"
                    alt="{{ $book['title'] }} cover art"
                    width="1024"
                    height="1024"
                    class="mx-auto aspect-square w-full max-w-[min(100%,48dvh)] rounded-2xl object-cover shadow-2xl shadow-black/60 ring-1 ring-white/10"
                >

                <div class="mt-7 text-center">
                    <p class="text-sm font-medium text-ember-400" data-bind="chapter-label">Chapter 1 of {{ $chapters->count() }}</p>
                    <h2 class="mt-1 text-2xl leading-tight font-semibold text-balance" data-bind="chapter-title">{{ $chapters->first()['title'] }}</h2>
                    <p class="mt-1 text-sm text-sand-400">{{ $book['author'] }} · Read by {{ $book['narrator'] }}</p>
                </div>
            </div>

            <section aria-label="Playback">
                {{-- Scrubber --}}
                <div class="relative">
                    <input
                        type="range"
                        min="0"
                        max="{{ $chapters->first()['duration'] }}"
                        step="1"
                        value="0"
                        data-bind="seek"
                        class="scrubber"
                        aria-label="Seek"
                    >
                    <div class="mt-1 flex justify-between text-xs text-sand-400 tabular-nums">
                        <span data-bind="elapsed">0:00</span>
                        <span data-bind="status" class="text-ember-400" aria-live="polite"></span>
                        <span data-bind="remaining">-0:00</span>
                    </div>
                </div>

                {{-- Transport --}}
                <div class="mt-4 flex items-center justify-between">
                    <button type="button" data-action="prev" class="tap flex size-12 items-center justify-center rounded-full text-sand-200" aria-label="Previous chapter">
                        <svg class="size-7" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 5a1 1 0 0 1 1 1v12a1 1 0 1 1-2 0V6a1 1 0 0 1 1-1Zm12.5.4A1 1 0 0 1 20 6.2v11.6a1 1 0 0 1-1.5.86l-9.6-5.8a1 1 0 0 1 0-1.72l9.6-5.8Z"/></svg>
                    </button>

                    <button type="button" data-action="back" class="tap relative flex size-14 items-center justify-center rounded-full text-sand-50" aria-label="Back 15 seconds">
                        <svg class="size-9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 3v5h5"/></svg>
                        <span class="absolute pt-0.5 text-[0.65rem] font-semibold">15</span>
                    </button>

                    <button
                        type="button"
                        data-action="toggle"
                        class="tap flex size-20 items-center justify-center rounded-full bg-ember-500 text-night-950 shadow-lg shadow-ember-500/30"
                        aria-label="Play"
                    >
                        <svg data-icon="play" class="ml-1 size-9" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.8a1 1 0 0 1 1.5-.86l11.2 7.2a1 1 0 0 1 0 1.72l-11.2 7.2A1 1 0 0 1 7 19.2V4.8Z"/></svg>
                        <svg data-icon="pause" class="hidden size-9" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="5.5" y="4" width="4.5" height="16" rx="1.25"/><rect x="14" y="4" width="4.5" height="16" rx="1.25"/></svg>
                        <svg data-icon="loading" class="hidden size-9 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M12 3a9 9 0 1 0 9 9"/></svg>
                    </button>

                    <button type="button" data-action="forward" class="tap relative flex size-14 items-center justify-center rounded-full text-sand-50" aria-label="Forward 30 seconds">
                        <svg class="size-9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v5h-5"/></svg>
                        <span class="absolute pt-0.5 text-[0.65rem] font-semibold">30</span>
                    </button>

                    <button type="button" data-action="next" class="tap flex size-12 items-center justify-center rounded-full text-sand-200" aria-label="Next chapter">
                        <svg class="size-7" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18 5a1 1 0 0 1 1 1v12a1 1 0 1 1-2 0V6a1 1 0 0 1 1-1ZM5.5 5.4l9.6 5.8a1 1 0 0 1 0 1.72l-9.6 5.8A1 1 0 0 1 4 17.8V6.2a1 1 0 0 1 1.5-.86Z"/></svg>
                    </button>
                </div>

                {{-- Secondary controls --}}
                <div class="mt-6 grid grid-cols-3 gap-3 text-sm">
                    <button type="button" data-action="speed" class="tap pill" aria-label="Playback speed">
                        <span data-bind="speed">1×</span>
                        <span class="pill-label">Speed</span>
                    </button>
                    <button type="button" data-action="sleep" class="tap pill" aria-label="Sleep timer">
                        <span data-bind="sleep">Off</span>
                        <span class="pill-label">Sleep</span>
                    </button>
                    <button type="button" data-action="open-chapters" class="tap pill" aria-label="Chapters">
                        <span>{{ $chapters->count() }}</span>
                        <span class="pill-label">Chapters</span>
                    </button>
                </div>
            </section>
        </main>

        {{-- Chapter sheet --}}
        <dialog id="chapters" class="sheet" aria-labelledby="chapters-heading">
            <div class="mx-auto max-w-md px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
                <div class="mx-auto mb-3 h-1.5 w-10 rounded-full bg-white/20" aria-hidden="true"></div>
                <div class="flex items-center justify-between px-2 pb-2">
                    <h2 id="chapters-heading" class="text-lg font-semibold">Chapters</h2>
                    <form method="dialog">
                        <button class="tap -mr-2 flex size-11 items-center justify-center rounded-full text-sand-300" aria-label="Close chapters">
                            <svg class="size-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>
                        </button>
                    </form>
                </div>

                <ol class="space-y-1">
                    @foreach ($chapters as $index => $chapter)
                        <li>
                            <button
                                type="button"
                                data-chapter="{{ $index }}"
                                class="tap chapter-row flex w-full items-center gap-4 rounded-xl px-3 py-3 text-left"
                            >
                                <span class="flex size-9 shrink-0 items-center justify-center rounded-full bg-white/5 text-sm font-semibold tabular-nums text-sand-300 chapter-number">
                                    {{ $chapter['number'] }}
                                </span>
                                <span class="min-w-0 flex-1">
                                    <span class="block truncate font-medium">{{ $chapter['title'] }}</span>
                                    <span class="mt-1 block h-1 overflow-hidden rounded-full bg-white/10">
                                        <span class="block h-full w-0 rounded-full bg-ember-400" data-progress="{{ $index }}"></span>
                                    </span>
                                </span>
                                <span class="shrink-0 text-sm text-sand-400 tabular-nums">
                                    {{ gmdate($chapter['duration'] >= 3600 ? 'G:i:s' : 'i:s', (int) $chapter['duration']) }}
                                </span>
                            </button>
                        </li>
                    @endforeach
                </ol>

                <p class="px-3 pt-4 text-xs text-sand-500">More chapters coming soon.</p>
            </div>
        </dialog>

        <audio id="audio" preload="metadata"></audio>
    </body>
</html>
