const STORAGE_KEY = 'after-moses:player:v1';
const BACK_SECONDS = 15;
const FORWARD_SECONDS = 30;
const FOLLOW_PAUSE_MS = 6000;
// After a jump with the scrubber or a word, how long the way back is offered, and the smallest jump that offers it.
const RETURN_VISIBLE_MS = 10000;
const RETURN_MIN_JUMP_SECONDS = 5;
// Follow-along text sizes in rem, smallest to largest.
const TEXT_SIZES = [1, 1.125, 1.25, 1.5, 1.75, 2];
const DEFAULT_TEXT_SIZE = 1;

const { book, chapters } = JSON.parse(document.getElementById('audiobook-data').textContent);
const chapterCount = chapters.filter((chapter) => chapter.number).length;

const audio = document.getElementById('audio');
const sheet = document.getElementById('chapters');
const readerEl = document.getElementById('reader');
const $ = (selector) => document.querySelector(selector);
const ui = {
    toggle: $('[data-action="toggle"]'),
    prev: $('[data-action="prev"]'),
    next: $('[data-action="next"]'),
    seek: $('[data-bind="seek"]'),
    elapsed: $('[data-bind="elapsed"]'),
    remaining: $('[data-bind="remaining"]'),
    status: $('[data-bind="status"]'),
    chapterLabel: $('[data-bind="chapter-label"]'),
    chapterTitle: $('[data-bind="chapter-title"]'),
    player: $('#player'),
    textButton: $('[data-action="text"]'),
    followButton: $('[data-action="follow"]'),
    returnButton: $('.return-point'),
    returnMarker: $('[data-bind="return-marker"]'),
    returnTime: $('[data-bind="return-time"]'),
    coverView: $('[data-view="cover"]'),
    textView: $('[data-view="text"]'),
    icons: {
        play: $('[data-icon="play"]'),
        pause: $('[data-icon="pause"]'),
        loading: $('[data-icon="loading"]'),
    },
};

const state = {
    chapter: 0,
    positions: {},
    view: 'cover',
    // Index into TEXT_SIZES.
    textSize: DEFAULT_TEXT_SIZE,
    pendingSeek: null,
    scrubbing: false,
    loading: false,
    booted: false,
};

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

function load() {
    try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));

        if (saved) {
            state.chapter = Math.min(Math.max(saved.chapter ?? 0, 0), chapters.length - 1);
            state.positions = saved.positions ?? {};
            state.view = saved.view === 'text' ? 'text' : 'cover';
            state.textSize = TEXT_SIZES[saved.textSize] ? saved.textSize : DEFAULT_TEXT_SIZE;
        }
    } catch {
        // Storage unavailable or corrupt; start fresh.
    }
}

let lastSave = 0;

function save(force = false) {
    const now = Date.now();

    if (!force && now - lastSave < 5000) {
        return;
    }

    lastSave = now;

    // Only record the playhead once the current chapter's audio is actually loaded.
    if (state.booted && state.pendingSeek === null && audio.readyState >= HTMLMediaElement.HAVE_METADATA) {
        state.positions[state.chapter] = Math.floor(audio.currentTime);
    }

    try {
        localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({ chapter: state.chapter, positions: state.positions, view: state.view, textSize: state.textSize }),
        );
    } catch {
        // Ignore quota or privacy-mode errors.
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTime(seconds) {
    seconds = Math.max(0, Math.floor(seconds || 0));

    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = String(seconds % 60).padStart(2, '0');

    return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

function duration() {
    return Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : chapters[state.chapter].duration;
}

function currentTime() {
    return state.pendingSeek ?? audio.currentTime;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function renderChapter() {
    const chapter = chapters[state.chapter];

    ui.chapterLabel.textContent = chapter.number ? `Chapter ${chapter.number} of ${chapterCount}` : book.title;
    ui.chapterTitle.textContent = chapter.title;
    ui.next.disabled = state.chapter >= chapters.length - 1;
    document.title = `${chapter.title} — ${book.title}`;

    document.querySelectorAll('[data-chapter]').forEach((row) => {
        row.setAttribute('aria-current', String(Number(row.dataset.chapter) === state.chapter));
    });

    renderChapterProgress();
    renderView();
    updateMediaSession();
}

function renderChapterProgress() {
    document.querySelectorAll('[data-progress]').forEach((bar) => {
        const index = Number(bar.dataset.progress);
        const position = index === state.chapter ? currentTime() : state.positions[index] ?? 0;
        const total = index === state.chapter ? duration() : chapters[index].duration;

        bar.style.width = `${Math.min(100, (position / total) * 100)}%`;
    });
}

function renderTime() {
    const total = duration();
    const time = state.scrubbing ? Number(ui.seek.value) : currentTime();

    ui.seek.max = total;

    if (!state.scrubbing) {
        ui.seek.value = time;
    }

    ui.seek.style.setProperty('--progress', `${(time / total) * 100}%`);
    ui.elapsed.textContent = formatTime(time);
    ui.remaining.textContent = `-${formatTime(total - time)}`;

    let buffered = 0;

    for (let i = 0; i < audio.buffered.length; i++) {
        if (audio.buffered.start(i) <= time) {
            buffered = Math.max(buffered, audio.buffered.end(i));
        }
    }

    ui.seek.style.setProperty('--buffered', `${(buffered / total) * 100}%`);
    renderReturnMarker();
}

function renderPlayState() {
    const playing = !audio.paused;
    const icon = state.loading && playing ? 'loading' : playing ? 'pause' : 'play';

    Object.entries(ui.icons).forEach(([name, el]) => el.classList.toggle('hidden', name !== icon));
    ui.toggle.setAttribute('aria-label', playing ? 'Pause' : 'Play');

    if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
    }
}

let statusTimeout;

function flash(message) {
    ui.status.textContent = message;
    clearTimeout(statusTimeout);
    statusTimeout = setTimeout(() => (ui.status.textContent = ''), 1500);
}

// ---------------------------------------------------------------------------
// Follow-along text
// ---------------------------------------------------------------------------

const reader = {
    chapter: null,
    timings: null,
    words: [],
    current: -1,
    pausedUntil: 0,
    frame: null,
};

const textRequests = new Map();

function isReading() {
    return state.view === 'text' && chapters[state.chapter].hasText;
}

function renderView() {
    const reading = isReading();

    ui.textButton.classList.toggle('hidden', !chapters[state.chapter].hasText);
    ui.textButton.setAttribute('aria-pressed', String(reading));
    ui.player.toggleAttribute('data-reading', reading);
    ui.coverView.classList.toggle('hidden', reading);
    ui.textView.classList.toggle('hidden', !reading);

    if (reading) {
        loadReader();
    }

    syncReaderLoop();
}

function renderTextSize() {
    readerEl.style.setProperty('--reader-size', `${TEXT_SIZES[state.textSize]}rem`);
    $('[data-action="text-smaller"]').disabled = state.textSize === 0;
    $('[data-action="text-larger"]').disabled = state.textSize === TEXT_SIZES.length - 1;
}

function changeTextSize(step) {
    const size = Math.min(Math.max(state.textSize + step, 0), TEXT_SIZES.length - 1);

    if (size === state.textSize) {
        return;
    }

    state.textSize = size;
    renderTextSize();
    // Keep the word being read in view as the lines reflow.
    highlightWord({ force: true, scroll: 'instant' });
    save(true);
}

function toggleView() {
    state.view = state.view === 'text' ? 'cover' : 'text';
    reader.pausedUntil = 0;
    renderView();
    highlightWord({ force: true, scroll: 'instant' });
    save(true);
}

function fetchText(index) {
    if (!textRequests.has(index)) {
        const request = fetch(`/text/${index + 1}`, { headers: { Accept: 'application/json' } }).then((response) => {
            if (!response.ok) {
                throw new Error(`Text request failed: ${response.status}`);
            }

            return response.json();
        });

        // Let a failed request be retried next time the text is opened.
        request.catch(() => textRequests.delete(index));
        textRequests.set(index, request);
    }

    return textRequests.get(index);
}

async function loadReader() {
    const index = state.chapter;

    if (reader.chapter === index) {
        return;
    }

    reader.chapter = index;
    reader.timings = null;
    reader.words = [];
    reader.current = -1;
    readerEl.replaceChildren(readerStatus('Loading text…'));

    try {
        const text = await fetchText(index);

        if (reader.chapter === index) {
            renderReader(text);
        }
    } catch {
        if (reader.chapter === index) {
            reader.chapter = null;
            readerEl.replaceChildren(readerStatus('Couldn’t load the text'));
        }
    }
}

function readerStatus(message) {
    const status = document.createElement('p');
    status.className = 'reader-status';
    status.textContent = message;

    return status;
}

function renderReader({ blocks, timings }) {
    const fragment = document.createDocumentFragment();
    const words = [];

    for (const block of blocks) {
        if (block.tag === 'break') {
            const ornament = document.createElement('p');
            ornament.className = 'reader-break';
            ornament.setAttribute('aria-hidden', 'true');
            ornament.textContent = '* * *';
            fragment.append(ornament);
            continue;
        }

        const element = document.createElement(block.tag === 'heading' ? 'h2' : 'p');

        if (block.tag === 'quote') {
            element.className = 'reader-quote';
        }

        block.words.forEach((word, position) => {
            const span = document.createElement('span');
            span.dataset.w = words.length;
            span.textContent = word;
            words.push(span);
            element.append(span, position < block.words.length - 1 ? ' ' : '');
        });

        fragment.append(element);
    }

    readerEl.replaceChildren(fragment);
    reader.timings = timings;
    reader.words = words;
    reader.current = -1;
    readerEl.scrollTop = 0;
    highlightWord({ force: true, scroll: 'instant' });
}

/**
 * Index of the word being spoken at the given time: the last word that has started.
 */
function wordAt(time) {
    const timings = reader.timings;
    let low = 0;
    let high = timings.length / 2 - 1;
    let found = -1;

    while (low <= high) {
        const mid = (low + high) >> 1;

        if (timings[mid * 2] <= time) {
            found = mid;
            low = mid + 1;
        } else {
            high = mid - 1;
        }
    }

    return found;
}

function highlightWord({ force = false, scroll = 'smooth' } = {}) {
    if (!isReading() || !reader.timings || reader.chapter !== state.chapter) {
        return;
    }

    // Pick auto-scroll back up once the listener has stopped scrolling for a while.
    if (reader.pausedUntil && isFollowing()) {
        reader.pausedUntil = 0;
        ui.followButton.classList.add('hidden');
        force = true;
    }

    const index = wordAt(currentTime());

    if (index === reader.current && !force) {
        return;
    }

    const previous = reader.words[reader.current];
    const next = reader.words[index];

    if (previous) {
        previous.classList.remove('is-current');
    }

    if (previous?.parentElement !== next?.parentElement) {
        previous?.parentElement.classList.remove('is-current-block');
        next?.parentElement.classList.add('is-current-block');
    }

    next?.classList.add('is-current');
    reader.current = index;

    if (next && isFollowing()) {
        keepInView(next, scroll);
    }
}

function isFollowing() {
    return Date.now() >= reader.pausedUntil;
}

/**
 * Keep the spoken word around a third of the way down, scrolling only once
 * it drifts out of the comfortable reading band.
 */
function keepInView(word, behavior) {
    const view = readerEl.clientHeight;
    const offset = word.offsetTop - readerEl.scrollTop;

    if (behavior === 'instant' || offset < view * 0.15 || offset > view * 0.6) {
        readerEl.scrollTo({ top: word.offsetTop - view / 3, behavior });
    }
}

function pauseFollowing() {
    reader.pausedUntil = Date.now() + FOLLOW_PAUSE_MS;
    ui.followButton.classList.remove('hidden');
}

function resumeFollowing() {
    reader.pausedUntil = 0;
    ui.followButton.classList.add('hidden');
    highlightWord({ force: true });
}

/**
 * Word timings are finer than "timeupdate" (about 4 per second), so follow
 * along every frame while the text is on screen and the audio is playing.
 */
function syncReaderLoop() {
    const shouldRun = isReading() && !audio.paused && document.visibilityState === 'visible';

    if (shouldRun && reader.frame === null) {
        const tick = () => {
            highlightWord();
            reader.frame = requestAnimationFrame(tick);
        };

        reader.frame = requestAnimationFrame(tick);
    } else if (!shouldRun && reader.frame !== null) {
        cancelAnimationFrame(reader.frame);
        reader.frame = null;
    }
}

// ---------------------------------------------------------------------------
// Playback
// ---------------------------------------------------------------------------

function selectChapter(index, { autoplay = false, position } = {}) {
    if (index < 0 || index >= chapters.length) {
        return;
    }

    save(true);
    clearReturn();

    const chapter = chapters[index];
    let start = position ?? state.positions[index] ?? 0;

    // A finished chapter starts over rather than resuming at the very end.
    if (start >= chapter.duration - 2) {
        start = 0;
    }

    state.chapter = index;
    state.pendingSeek = start;
    state.positions[index] = start;

    if (audio.src !== chapter.url) {
        audio.src = chapter.url;
    }

    if (audio.readyState >= HTMLMediaElement.HAVE_METADATA) {
        applyPendingSeek();
    }

    renderChapter();
    renderTime();
    save(true);

    if (autoplay) {
        play();
    }
}

function applyPendingSeek() {
    if (state.pendingSeek !== null) {
        audio.currentTime = state.pendingSeek;
        state.pendingSeek = null;
    }
}

function play() {
    audio.play().catch((error) => {
        if (error.name !== 'AbortError') {
            flash('Tap play to start');
        }
    });
}

function seekTo(seconds) {
    const time = Math.min(Math.max(seconds, 0), duration() - 0.5);

    if (state.pendingSeek !== null) {
        state.pendingSeek = time;
    } else {
        audio.currentTime = time;
    }

    renderTime();
    renderChapterProgress();
    highlightWord({ force: true });
    updatePositionState();
}

/**
 * Where the listener was before jumping with the scrubber or a word. A run of
 * jumps keeps the first spot, so the button always leads back to it.
 */
const returnPoint = {
    chapter: null,
    time: null,
    timeout: null,
};

function jumpTo(seconds) {
    const from = currentTime();

    if (returnPoint.time === null && Math.abs(seconds - from) >= RETURN_MIN_JUMP_SECONDS) {
        returnPoint.chapter = state.chapter;
        returnPoint.time = from;
    }

    seekTo(seconds);
    resumeFollowing();

    if (returnPoint.time !== null) {
        showReturn();
    }
}

function showReturn() {
    ui.returnTime.textContent = formatTime(returnPoint.time);
    ui.returnButton.setAttribute('aria-label', `Go back to ${formatTime(returnPoint.time)}`);
    ui.returnButton.classList.remove('hidden');
    ui.returnMarker.classList.remove('hidden');
    renderReturnMarker();
    clearTimeout(returnPoint.timeout);
    returnPoint.timeout = setTimeout(clearReturn, RETURN_VISIBLE_MS);
}

function clearReturn() {
    clearTimeout(returnPoint.timeout);
    returnPoint.chapter = null;
    returnPoint.time = null;
    ui.returnButton.classList.add('hidden');
    ui.returnMarker.classList.add('hidden');
}

function renderReturnMarker() {
    if (returnPoint.time === null) {
        return;
    }

    const at = Math.min(returnPoint.time / duration(), 1);
    ui.returnMarker.style.setProperty('--at', String(at));

    // Centre the button over the marker (the thumb is 16px wide), without running off either end.
    const width = ui.seek.clientWidth;
    const half = ui.returnButton.offsetWidth / 2;
    const x = 8 + (width - 16) * at;
    ui.returnButton.style.left = `${Math.min(Math.max(x, half), width - half)}px`;
}

function goBack() {
    if (returnPoint.chapter === state.chapter) {
        resumeFollowing();
        seekTo(returnPoint.time);
    }

    clearReturn();
}

function skip(seconds) {
    seekTo(currentTime() + seconds);
}

function previous() {
    if (currentTime() > 5 || state.chapter === 0) {
        seekTo(0);
    } else {
        selectChapter(state.chapter - 1, { autoplay: !audio.paused, position: 0 });
    }
}

function next() {
    if (state.chapter < chapters.length - 1) {
        selectChapter(state.chapter + 1, { autoplay: !audio.paused, position: 0 });
    }
}

// ---------------------------------------------------------------------------
// Media Session (lock screen / headphone controls)
// ---------------------------------------------------------------------------

function updateMediaSession() {
    if (!('mediaSession' in navigator)) {
        return;
    }

    const chapter = chapters[state.chapter];

    navigator.mediaSession.metadata = new MediaMetadata({
        title: chapter.number ? `Ch. ${chapter.number}: ${chapter.title}` : chapter.title,
        artist: book.author,
        album: book.title,
        artwork: [{ src: book.cover, sizes: '1024x1024', type: 'image/jpeg' }],
    });
}

function updatePositionState() {
    if (!('mediaSession' in navigator) || !navigator.mediaSession.setPositionState) {
        return;
    }

    try {
        navigator.mediaSession.setPositionState({
            duration: duration(),
            playbackRate: audio.playbackRate,
            position: Math.min(currentTime(), duration()),
        });
    } catch {
        // Some browsers reject state before metadata has loaded.
    }
}

function registerMediaSessionHandlers() {
    if (!('mediaSession' in navigator)) {
        return;
    }

    const handlers = {
        play,
        pause: () => audio.pause(),
        seekbackward: (details) => skip(-(details.seekOffset || BACK_SECONDS)),
        seekforward: (details) => skip(details.seekOffset || FORWARD_SECONDS),
        seekto: (details) => seekTo(details.seekTime),
        previoustrack: previous,
        nexttrack: next,
    };

    for (const [action, handler] of Object.entries(handlers)) {
        try {
            navigator.mediaSession.setActionHandler(action, handler);
        } catch {
            // Action not supported by this browser.
        }
    }
}

// ---------------------------------------------------------------------------
// Offline
// ---------------------------------------------------------------------------

// Must match the cache names in public/sw.js, which serves these to the audio element.
const AUDIO_CACHE = 'audio-v1';
// Used to estimate a chapter's size when the server couldn't report it (about 128 kbps).
const BYTES_PER_SECOND = 16000;

const offline = {
    supported: 'serviceWorker' in navigator && 'caches' in window,
    saved: new Set(),
    progress: new Map(),
    queue: [],
    all: false,
    running: false,
    controller: null,
    persisted: false,
};

const offlineEls = {
    panel: $('[data-bind="offline"]'),
    status: $('[data-bind="offline-status"]'),
    downloadAll: $('[data-action="download-all"]'),
    remove: $('[data-action="remove-downloads"]'),
};

function chapterBytes(chapter) {
    return chapter.size ?? chapter.duration * BYTES_PER_SECOND;
}

function audioKey(index) {
    return `/offline/audio/${index + 1}`;
}

async function initOffline() {
    if (!offline.supported) {
        return;
    }

    try {
        await navigator.serviceWorker.register('/sw.js');
        const registration = await navigator.serviceWorker.ready;

        // Save the page and the assets it loaded, so the player opens offline.
        const urls = new Set([location.pathname]);

        for (const entry of performance.getEntriesByType('resource')) {
            const url = new URL(entry.name);

            if (url.origin === location.origin && /^\/(build|images)\/|\.(webmanifest|png|ico)$/.test(url.pathname)) {
                urls.add(url.pathname);
            }
        }

        registration.active?.postMessage({ type: 'cache-shell', urls: [...urls] });

        const cache = await caches.open(AUDIO_CACHE);

        for (const request of await cache.keys()) {
            const index = Number(new URL(request.url).pathname.split('/').pop()) - 1;

            if (chapters[index]) {
                offline.saved.add(index);
            }
        }
    } catch {
        offline.supported = false;
    }

    offlineEls.panel.classList.toggle('hidden', !offline.supported);
    renderOffline();

    if (!audio.paused) {
        saveUpcoming();
    }
}

/**
 * Keep the chapter that's playing and the one after it on the device.
 */
function saveUpcoming() {
    download([state.chapter, state.chapter + 1]);
}

function download(indexes) {
    if (!offline.supported) {
        return;
    }

    for (const index of indexes) {
        if (chapters[index] && !offline.saved.has(index) && !offline.queue.includes(index)) {
            offline.queue.push(index);
        }
    }

    runQueue();
}

async function runQueue() {
    if (offline.running) {
        return;
    }

    offline.running = true;
    renderOffline();

    while (offline.queue.length) {
        const index = offline.queue[0];

        try {
            await downloadChapter(index);
            offline.queue.shift();
        } catch (error) {
            if (error.name === 'AbortError') {
                break;
            }

            if (error.retryAfter) {
                // Rate limited; wait it out and try the same chapter again.
                await new Promise((resolve) => setTimeout(resolve, error.retryAfter * 1000));
                continue;
            }

            // Offline or failed; leave it for the next time it's needed.
            offline.queue.shift();
            offline.progress.delete(index);
            renderOffline();

            if (!navigator.onLine) {
                offline.queue = [];
            }
        }
    }

    offline.running = false;
    offline.all = false;
    offline.controller = null;
    renderOffline();
}

async function downloadChapter(index) {
    if (!offline.persisted) {
        offline.persisted = true;
        // Ask the browser not to clear the downloads when it's short on space.
        navigator.storage?.persist?.().catch(() => {});
    }

    offline.controller = new AbortController();
    offline.progress.set(index, 0);
    renderOffline();

    let response = await fetchAudio(index);

    // The signed URL may have expired; get a fresh one and try once more.
    if (response.status === 403) {
        await refreshUrl(index);
        response = await fetchAudio(index);
    }

    if (response.status === 429) {
        throw Object.assign(new Error('Rate limited'), { retryAfter: Number(response.headers.get('Retry-After')) || 30 });
    }

    if (!response.ok || !response.body) {
        throw new Error(`Download failed: ${response.status}`);
    }

    const total = Number(response.headers.get('Content-Length')) || chapterBytes(chapters[index]);
    const reader = response.body.getReader();
    const chunks = [];
    let received = 0;

    for (;;) {
        const { done, value } = await reader.read();

        if (done) {
            break;
        }

        chunks.push(value);
        received += value.length;
        offline.progress.set(index, Math.min(received / total, 0.99));
        renderOffline();
    }

    const expected = Number(response.headers.get('Content-Length'));

    if (expected && received !== expected) {
        throw new Error('Download incomplete');
    }

    const blob = new Blob(chunks, { type: 'audio/mpeg' });
    const cache = await caches.open(AUDIO_CACHE);

    await cache.put(
        audioKey(index),
        new Response(blob, { headers: { 'Content-Type': 'audio/mpeg', 'Content-Length': String(blob.size) } }),
    );

    offline.progress.delete(index);
    offline.saved.add(index);

    // The service worker keeps a copy of the text for offline reading.
    if (chapters[index].hasText) {
        fetchText(index).catch(() => {});
    }

    renderOffline();
}

function fetchAudio(index) {
    return fetch(chapters[index].url, { signal: offline.controller.signal });
}

async function refreshUrl(index) {
    const response = await fetch(`/audio/${index + 1}/url`, { headers: { Accept: 'application/json' } });

    if (response.ok) {
        chapters[index].url = (await response.json()).url;
    }

    return response.ok;
}

function downloadAll() {
    offline.all = true;
    download(chapters.map((chapter, index) => index));
}

function stopDownloads() {
    offline.queue = [];
    offline.all = false;
    offline.controller?.abort();
    offline.progress.clear();
    renderOffline();
}

async function removeDownloads() {
    stopDownloads();
    offline.saved.clear();
    await caches.delete(AUDIO_CACHE);
    renderOffline();
}

function renderOffline() {
    if (!offline.supported) {
        return;
    }

    document.querySelectorAll('[data-offline]').forEach((el) => {
        const index = Number(el.dataset.offline);
        const progress = offline.progress.get(index);

        if (offline.saved.has(index)) {
            el.innerHTML =
                '<svg class="ml-auto size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
            el.setAttribute('aria-label', 'Saved for offline');
        } else if (progress !== undefined) {
            el.textContent = `${Math.round(progress * 100)}%`;
            el.setAttribute('aria-label', 'Saving for offline');
        } else {
            el.replaceChildren();
            el.removeAttribute('aria-label');
        }
    });

    const remaining = chapters.filter((chapter, index) => !offline.saved.has(index));
    const current = offline.queue.find((index) => offline.progress.has(index));

    if (current !== undefined) {
        offlineEls.status.textContent = `Saving chapter ${current + 1}… ${Math.round(offline.progress.get(current) * 100)}%`;
    } else if (remaining.length === 0) {
        offlineEls.status.textContent = 'All chapters saved for offline';
    } else if (offline.saved.size) {
        offlineEls.status.textContent = `${offline.saved.size} of ${chapters.length} saved for offline`;
    } else {
        offlineEls.status.textContent = 'Listen without a connection';
    }

    const megabytes = Math.round(remaining.reduce((sum, chapter) => sum + chapterBytes(chapter), 0) / 1e6);

    offlineEls.downloadAll.textContent = offline.saved.size ? `Save the rest (${megabytes} MB)` : `Save all (${megabytes} MB)`;
    offlineEls.downloadAll.classList.toggle('hidden', remaining.length === 0 || offline.all);
    offlineEls.remove.textContent = offline.all ? 'Stop' : 'Remove';
    offlineEls.remove.classList.toggle('hidden', !offline.all && offline.saved.size === 0);
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

audio.addEventListener('loadedmetadata', () => {
    applyPendingSeek();
    renderTime();
    highlightWord({ force: true });
    updatePositionState();
});

audio.addEventListener('timeupdate', () => {
    renderTime();
    renderChapterProgress();
    highlightWord();
    save();
});

audio.addEventListener('progress', renderTime);
audio.addEventListener('play', () => {
    renderPlayState();
    syncReaderLoop();
    saveUpcoming();
});
audio.addEventListener('pause', () => {
    renderPlayState();
    syncReaderLoop();
    save(true);
});

audio.addEventListener('waiting', () => {
    state.loading = true;
    renderPlayState();
});

for (const event of ['playing', 'canplay', 'seeked']) {
    audio.addEventListener(event, () => {
        state.loading = false;
        renderPlayState();
        updatePositionState();
    });
}

audio.addEventListener('ended', () => {
    state.positions[state.chapter] = chapters[state.chapter].duration;

    if (state.chapter < chapters.length - 1) {
        selectChapter(state.chapter + 1, { autoplay: true, position: 0 });
    } else {
        save(true);
        flash('The end');
    }
});

// Audio URLs are signed and expire, so on failure fetch a fresh one and retry once.
const refreshedChapters = new Set();

audio.addEventListener('error', async () => {
    const index = state.chapter;
    const wasPlaying = state.loading || !audio.paused;

    if (!refreshedChapters.has(index)) {
        refreshedChapters.add(index);

        try {
            if (await refreshUrl(index)) {
                if (state.chapter === index) {
                    selectChapter(index, { autoplay: wasPlaying, position: currentTime() });
                }

                return;
            }
        } catch {
            // Fall through to the error message.
        }
    }

    state.loading = false;
    renderPlayState();
    flash('Couldn’t load audio');
});

audio.addEventListener('loadeddata', () => refreshedChapters.delete(state.chapter));

ui.seek.addEventListener('input', () => {
    state.scrubbing = true;
    renderTime();
});

ui.seek.addEventListener('change', () => {
    state.scrubbing = false;
    jumpTo(Number(ui.seek.value));
});

document.addEventListener('click', (event) => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    const chapterRow = event.target.closest('[data-chapter]');
    const word = event.target.closest('[data-w]');

    if (word && reader.timings) {
        // Selecting text shouldn't also jump the audio.
        if (!window.getSelection()?.isCollapsed) {
            return;
        }

        jumpTo(reader.timings[Number(word.dataset.w) * 2]);

        return;
    }

    if (chapterRow) {
        const index = Number(chapterRow.dataset.chapter);

        if (index === state.chapter) {
            play();
        } else {
            selectChapter(index, { autoplay: true });
        }

        sheet.close();

        return;
    }

    switch (action) {
        case 'toggle':
            audio.paused ? play() : audio.pause();
            break;
        case 'back':
            skip(-BACK_SECONDS);
            break;
        case 'forward':
            skip(FORWARD_SECONDS);
            break;
        case 'prev':
            previous();
            break;
        case 'next':
            next();
            break;
        case 'text':
            toggleView();
            break;
        case 'follow':
            resumeFollowing();
            break;
        case 'return':
            goBack();
            break;
        case 'text-smaller':
            changeTextSize(-1);
            break;
        case 'text-larger':
            changeTextSize(1);
            break;
        case 'download-all':
            downloadAll();
            break;
        case 'remove-downloads':
            offline.all ? stopDownloads() : removeDownloads();
            break;
        case 'open-chapters':
            renderChapterProgress();
            sheet.showModal();
            break;
    }
});

// Reading ahead or back pauses auto-scroll for a moment.
for (const event of ['wheel', 'touchmove']) {
    readerEl.addEventListener(event, pauseFollowing, { passive: true });
}

readerEl.addEventListener('keydown', (event) => {
    if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'].includes(event.code)) {
        pauseFollowing();
    }
});

// Close the sheet when tapping the backdrop.
sheet.addEventListener('click', (event) => {
    if (event.target === sheet) {
        sheet.close();
    }
});

document.addEventListener('keydown', (event) => {
    if (sheet.open || event.target.matches('input, textarea')) {
        return;
    }

    if (event.code === 'Space') {
        event.preventDefault();
        audio.paused ? play() : audio.pause();
    } else if (event.code === 'ArrowLeft') {
        skip(-BACK_SECONDS);
    } else if (event.code === 'ArrowRight') {
        skip(FORWARD_SECONDS);
    }
});

document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
        save(true);
    }

    syncReaderLoop();
});

window.addEventListener('pagehide', () => save(true));
window.addEventListener('resize', renderReturnMarker);

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

load();
renderTextSize();
registerMediaSessionHandlers();
renderPlayState();
selectChapter(state.chapter);
state.booted = true;
initOffline();
