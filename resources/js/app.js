const STORAGE_KEY = 'after-moses:player:v1';
const SPEEDS = [0.8, 1, 1.2, 1.5, 1.75, 2];
const SLEEP_OPTIONS = [null, 15, 30, 45, 60, 'chapter'];
const BACK_SECONDS = 15;
const FORWARD_SECONDS = 30;
const FOLLOW_PAUSE_MS = 6000;

const { book, chapters } = JSON.parse(document.getElementById('audiobook-data').textContent);

const audio = document.getElementById('audio');
const sheet = document.getElementById('chapters');
const readerEl = document.getElementById('reader');
const $ = (selector) => document.querySelector(selector);
const ui = {
    toggle: $('[data-action="toggle"]'),
    prev: $('[data-action="prev"]'),
    next: $('[data-action="next"]'),
    speedButton: $('[data-action="speed"]'),
    sleepButton: $('[data-action="sleep"]'),
    seek: $('[data-bind="seek"]'),
    elapsed: $('[data-bind="elapsed"]'),
    remaining: $('[data-bind="remaining"]'),
    status: $('[data-bind="status"]'),
    chapterLabel: $('[data-bind="chapter-label"]'),
    chapterTitle: $('[data-bind="chapter-title"]'),
    speed: $('[data-bind="speed"]'),
    sleep: $('[data-bind="sleep"]'),
    player: $('#player'),
    textButton: $('[data-action="text"]'),
    followButton: $('[data-action="follow"]'),
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
    speed: 1,
    view: 'cover',
    sleep: null,
    sleepDeadline: null,
    sleepInterval: null,
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
            state.speed = SPEEDS.includes(saved.speed) ? saved.speed : 1;
            state.view = saved.view === 'text' ? 'text' : 'cover';
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
            JSON.stringify({ chapter: state.chapter, positions: state.positions, speed: state.speed, view: state.view }),
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

    ui.chapterLabel.textContent = `Chapter ${chapter.number} of ${chapters.length}`;
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
    ui.remaining.textContent = `-${formatTime((total - time) / state.speed)}`;

    let buffered = 0;

    for (let i = 0; i < audio.buffered.length; i++) {
        if (audio.buffered.start(i) <= time) {
            buffered = Math.max(buffered, audio.buffered.end(i));
        }
    }

    ui.seek.style.setProperty('--buffered', `${(buffered / total) * 100}%`);
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

function renderSpeed() {
    ui.speed.textContent = `${state.speed}×`;
    ui.speedButton.toggleAttribute('data-active', state.speed !== 1);
}

function renderSleep() {
    let label = 'Off';

    if (state.sleep === 'chapter') {
        label = 'End of ch.';
    } else if (state.sleepDeadline) {
        label = formatTime((state.sleepDeadline - Date.now()) / 1000);
    }

    ui.sleep.textContent = label;
    ui.sleepButton.toggleAttribute('data-active', state.sleep !== null);
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

    audio.defaultPlaybackRate = state.speed;
    audio.playbackRate = state.speed;

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

function cycleSpeed() {
    state.speed = SPEEDS[(SPEEDS.indexOf(state.speed) + 1) % SPEEDS.length];
    audio.defaultPlaybackRate = state.speed;
    audio.playbackRate = state.speed;
    renderSpeed();
    renderTime();
    updatePositionState();
    save(true);
}

function cycleSleep() {
    state.sleep = SLEEP_OPTIONS[(SLEEP_OPTIONS.indexOf(state.sleep) + 1) % SLEEP_OPTIONS.length];
    clearInterval(state.sleepInterval);
    state.sleepDeadline = null;

    if (typeof state.sleep === 'number') {
        state.sleepDeadline = Date.now() + state.sleep * 60 * 1000;
        state.sleepInterval = setInterval(() => {
            if (Date.now() >= state.sleepDeadline) {
                sleepNow();
            }

            renderSleep();
        }, 1000);
    }

    renderSleep();
}

function sleepNow() {
    audio.pause();
    clearInterval(state.sleepInterval);
    state.sleep = null;
    state.sleepDeadline = null;
    renderSleep();
    flash('Sleep timer ended');
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
        title: `Ch. ${chapter.number}: ${chapter.title}`,
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
            playbackRate: state.speed,
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

audio.addEventListener('ratechange', () => {
    // Changing src resets the rate on some browsers; keep the listener's choice.
    if (audio.playbackRate !== state.speed) {
        audio.playbackRate = state.speed;
    }
});

audio.addEventListener('ended', () => {
    state.positions[state.chapter] = chapters[state.chapter].duration;

    if (state.sleep === 'chapter') {
        save(true);
        sleepNow();
    } else if (state.chapter < chapters.length - 1) {
        selectChapter(state.chapter + 1, { autoplay: true, position: 0 });
    } else {
        save(true);
        flash('The end — for now');
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
            const response = await fetch(`/audio/${index + 1}/url`, { headers: { Accept: 'application/json' } });

            if (response.ok) {
                chapters[index].url = (await response.json()).url;

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
    seekTo(Number(ui.seek.value));
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

        resumeFollowing();
        seekTo(reader.timings[Number(word.dataset.w) * 2]);

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
        case 'speed':
            cycleSpeed();
            break;
        case 'sleep':
            cycleSleep();
            break;
        case 'text':
            toggleView();
            break;
        case 'follow':
            resumeFollowing();
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

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

load();
registerMediaSessionHandlers();
renderSpeed();
renderSleep();
renderPlayState();
selectChapter(state.chapter);
state.booted = true;
