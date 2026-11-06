import type { default as HlsClass, HlsConfig } from 'hls.js';
import { authFetch, isPromise, withToken, type Auth } from './auth.js';
import { claimWorker } from './worker.js';

const MAX_RETRIES = 3;
const RETRY_BACKOFF_MS = 700;

export type EngineKind = 'mp4' | 'hls';

export type EngineName = 'none' | 'mp4' | 'hls' | 'hls-native';

export type SourceType = 'auto' | EngineKind;

export interface RawLevel {
    id: number;
    h: number;
    b: number;
}

export interface Level extends RawLevel {
    dup: boolean;
}

export interface PlayingLevel {
    h: number;
    b: number;
}

export interface Engine {
    readonly name: EngineName;
    readonly liveSeek: boolean;
    levels(): Level[];
    autoOn(): boolean;
    levelId(): number;
    setLevel(id: number): void;
    current(): PlayingLevel | undefined;
    readonly managed: boolean;
    texts(): { label: string }[];
    textIndex(): number;
    setText(index: number): void;
    destroy(): void;
}

export interface EngineContext {
    auth?: Auth;
    worker?: string;
    refresh(): void;
    fatal(message: string): void;
    alive(): boolean;
}

export const NONE: Engine = {
    name: 'none',
    liveSeek: false,
    levels: () => [],
    autoOn: () => true,
    levelId: () => -1,
    setLevel() {},
    current: () => undefined,
    managed: false,
    texts: () => [],
    textIndex: () => -1,
    setText() {},
    destroy() {},
};

export const mbps = (bitsPerSecond: number): string => (bitsPerSecond / 1e6).toFixed(1) + ' Mbps';

export function sortLevels(list: RawLevel[]): Level[] {
    const all = [...list].sort((a, b) => a.h - b.h || a.b - b.b);
    return all.map((o) => ({ ...o, dup: o.h > 0 && all.filter((x) => x.h === o.h).length > 1 }));
}

export const levelText = ({ id, h, b, dup }: Level, word = 'Level'): string =>
    h ? `${h}p${dup && b ? ` (${mbps(b)})` : ''}` : b ? mbps(b) : `${word} ${id + 1}`;

export const playingText = (level: PlayingLevel | undefined): string => (level?.h ? `${level.h}p` : level?.b ? mbps(level.b) : '');

export function detectType(src: string, type?: SourceType): EngineKind {
    if (type === 'mp4' || type === 'hls') return type;
    if (type && type !== 'auto') throw new Error(`Unknown source type "${String(type)}". Use 'mp4', 'hls' or 'auto'.`);
    if (/\.mpd(?:[?#]|$)/i.test(src)) throw new Error('DASH (.mpd) is not supported. Use MP4 or HLS.');
    return /\.m3u8(?:[?#]|$)/i.test(src) ? 'hls' : 'mp4';
}

export async function createEngine(
    kind: EngineKind,
    video: HTMLVideoElement,
    src: string,
    ctx: EngineContext,
    hlsConfig?: Partial<HlsConfig>,
): Promise<Engine> {
    return kind === 'hls' ? hlsEngine(video, src, ctx, hlsConfig) : mp4Engine(video, src, ctx);
}

async function mp4Engine(video: HTMLVideoElement, src: string, ctx: EngineContext): Promise<Engine> {
    const { auth, worker, alive } = ctx;
    if (!auth || !worker) return nativeEngine('mp4', video, src, ctx);
    const release = await claimWorker(worker, src, auth);
    if (!alive()) {
        release();
        return NONE;
    }
    const engine = nativeEngine('mp4', video, src, ctx, true);
    return {
        ...engine,
        destroy() {
            engine.destroy();
            release();
        },
    };
}

function nativeEngine(name: 'mp4' | 'hls-native', video: HTMLVideoElement, src: string, { fatal, auth }: EngineContext, viaWorker = false): Engine {
    if (auth && !viaWorker) {
        console.warn(
            `player-sdk: the bearerToken option is NOT sent for "${name}": the browser loads the URL itself and a <video> cannot add an Authorization header. ` +
                (name === 'mp4'
                    ? 'Set the bearerWorker option (a service worker adds the header), or use a signed URL or a cookie.'
                    : 'Use a signed URL or a cookie, or make hls.js play it (it was not used here: an iPhone before iOS 17.1, or hls.js could not be loaded).'),
        );
    }
    // A missing file and an unplayable codec raise the same MediaError, so ask the server which one it is.
    const onError = async () => {
        const res = await (viaWorker ? authFetch(auth, src, { method: 'HEAD' }) : fetch(src, { method: 'HEAD' })).catch(() => null);
        const status = res?.status;
        fatal(
            status === 404
                ? 'Video not found (404).'
                : status === 401 || status === 403
                  ? `Access denied (${status}).${auth && !viaWorker ? ' The bearer token is not sent for a video the browser loads itself.' : ''}`
                  : `Cannot play this video (${video.error?.message || `error code ${video.error?.code ?? 'unknown'}`})`,
        );
    };
    video.addEventListener('error', onError);
    video.src = src;
    return {
        ...NONE,
        name,
        destroy: () => video.removeEventListener('error', onError),
    };
}

type HlsStatic = typeof HlsClass;

async function loadHls(): Promise<HlsStatic | undefined> {
    const global = (globalThis as { Hls?: HlsStatic }).Hls;
    if (typeof global?.isSupported === 'function') return global;
    const mod = await import('hls.js').catch((error: unknown) => {
        console.warn('player-sdk: could not load hls.js (add a <script> tag for it, or bundle the "hls.js" package)', error);
        return null;
    });
    return mod?.default;
}

function authHooks(config: Partial<HlsConfig>, auth: Auth | undefined): Partial<HlsConfig> {
    if (!auth) return config;
    const { xhrSetup, fetchSetup } = config;
    return {
        ...config,
        xhrSetup: (xhr, url, context) => {
            const own = xhrSetup?.(xhr, url, context);
            const add = () => {
                // hls.js calls this hook before xhr.open() and opens the request itself afterwards if it is still closed: setRequestHeader needs it open.
                if (!xhr.readyState) xhr.open('GET', url, true);
                return withToken(auth, url, (token) => xhr.setRequestHeader('Authorization', `Bearer ${token}`));
            };
            return isPromise(own) ? own.then(add) : add();
        },
        fetchSetup: (context, init) => {
            const own = fetchSetup ? fetchSetup(context, init) : new Request(context.url, init);
            const add = (request: Request): Request | Promise<Request> => {
                let out = request;
                const done = withToken(auth, context.url, (token) => {
                    const headers = new Headers(request.headers);
                    headers.set('Authorization', `Bearer ${token}`);
                    out = new Request(request, { headers });
                });
                return isPromise(done) ? done.then(() => out) : out;
            };
            return isPromise(own) ? own.then(add) : add(own);
        },
    };
}

async function hlsEngine(video: HTMLVideoElement, src: string, ctx: EngineContext, config?: Partial<HlsConfig>): Promise<Engine> {
    const { refresh, fatal, alive } = ctx;
    const Hls = await loadHls();
    // hls.js loads asynchronously. If a newer load() or destroy() came in meanwhile, the <video> already belongs to something else:
    // attaching now and destroying afterwards would wipe the newer source.
    if (!alive()) return NONE;
    if (!Hls?.isSupported()) {
        if (!video.canPlayType('application/vnd.apple.mpegurl'))
            throw new Error(Hls ? 'This browser cannot play HLS streams.' : 'Could not load the player library (hls.js).');
        return nativeEngine('hls-native', video, src, ctx);
    }
    let retries = 0;
    let dead = false;
    let airplaySource: HTMLSourceElement | undefined;
    const hls = new Hls(authHooks({ capLevelToPlayerSize: true, ...config }, ctx.auth));
    hls.loadSource(src);
    hls.attachMedia(video);
    if ('WebKitPlaybackTargetAvailabilityEvent' in window) {
        video.disableRemotePlayback = false;
        airplaySource = document.createElement('source');
        airplaySource.src = src;
        airplaySource.type = 'application/x-mpegURL';
        video.appendChild(airplaySource);
    }
    const E = Hls.Events;
    for (const event of [E.MANIFEST_PARSED, E.LEVEL_SWITCHED, E.SUBTITLE_TRACKS_UPDATED, E.SUBTITLE_TRACK_SWITCH]) hls.on(event, refresh);
    hls.on(E.FRAG_LOADED, () => {
        retries = 0;
    });
    hls.on(E.ERROR, (_, d) => {
        if (!d.fatal) return;
        const notFound = d.response?.code === 404;
        const denied = d.response?.code === 401 || d.response?.code === 403;
        if (d.details === Hls.ErrorDetails.MANIFEST_INCOMPATIBLE_CODECS_ERROR) {
            // No rendition has a codec this browser can decode: recoverMediaError() changes nothing and no second error ever comes, so the player
            // would sit there with no levels (no Quality menu) and no message. Report it at once.
            fatal('This browser cannot play the codecs of this stream.');
        } else if (d.type === Hls.ErrorTypes.NETWORK_ERROR && !notFound && retries++ < MAX_RETRIES) {
            // startLoad() is a no-op while the master playlist itself failed to load (no levels yet), so reload the source then.
            const playlist = d.details === Hls.ErrorDetails.MANIFEST_LOAD_ERROR || d.details === Hls.ErrorDetails.MANIFEST_LOAD_TIMEOUT;
            setTimeout(() => {
                if (dead) return;
                if (playlist) hls.loadSource(src);
                else hls.startLoad();
            }, RETRY_BACKOFF_MS * retries);
        } else if (d.type === Hls.ErrorTypes.MEDIA_ERROR && retries++ < MAX_RETRIES) hls.recoverMediaError();
        else fatal(notFound ? 'Stream not found (404).' : denied ? `Access denied (${d.response?.code}).` : `Cannot play this stream (${d.details})`);
    });
    return {
        ...NONE,
        name: 'hls',
        liveSeek: true,
        levels: () => sortLevels(hls.levels.map((l, i) => ({ id: i, h: l.height || 0, b: l.bitrate || 0 }))),
        autoOn: () => hls.autoLevelEnabled,
        // hls.currentLevel is the level of the fragment being *played*: -1 right after a manual switch (the buffer was flushed).
        // The level the user pinned is manualLevel (-1 = auto).
        levelId: () => hls.manualLevel,
        setLevel: (id) => {
            hls.currentLevel = id;
        },
        current: () => {
            const l = hls.levels[hls.currentLevel] || hls.levels[hls.loadLevel];
            return l && { h: l.height || 0, b: l.bitrate || 0 };
        },
        managed: true,
        texts: () => hls.subtitleTracks.map((t) => ({ label: t.name || t.lang || '' })),
        textIndex: () => hls.subtitleTrack,
        setText: (i) => {
            hls.subtitleTrack = i;
        },
        destroy() {
            dead = true;
            hls.destroy();
            airplaySource?.remove();
        },
    };
}
