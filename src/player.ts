import type { HlsConfig } from 'hls.js';
import { createAuth, type BearerToken } from './auth.js';
import { Captions, CueLayer, type SubtitleSource } from './captions.js';
import { NONE, createEngine, detectType, type Engine, type EngineContext, type EngineKind, type EngineName, type SourceType } from './engines.js';
import { parseAspectRatio, type AspectRatio, type AspectRatioShape } from './aspect.js';
import { icon, setIcon, type IconName } from './icons.js';
import { SettingsMenu, type MenuAction } from './menu.js';
import { LABELS, formatTime, h, type Labels } from './utils.js';

const IDLE_MS = 2800;
const SEEK_STEP_S = 5;
const PLAY_FLASH_MS = 800;
const SCRUB_HIDE_MS = 900;
const SEEK_SCALE = 1000;
const ZOOM_BASE_WIDTH = 960;
const ZOOM_MAX = 1.75;
const NARROW_WIDTH = 640;
const LIFT_WIDTH = { air: 760, pip: 720, vol: 680, fs: 640 } as const;
const PLAY_WIDTH = 380;
const CC_WIDTH = 340;
const ICON_SIZE = { default: 20, min: 12, max: 40 } as const;
const SEEK_WIDTH = 280;
const AUTO_ASPECT = { min: 1 / 3, max: 3.6 } as const;

export interface PlayerOptions {
    src?: string;
    type?: SourceType;
    subtitles?: SubtitleSource[];
    thumbnail?: string;
    aspectRatio?: AspectRatio;
    autoplay?: boolean;
    muted?: boolean;
    loop?: boolean;
    preload?: 'none' | 'metadata' | 'auto';
    hls?: Partial<HlsConfig>;
    bearerToken?: BearerToken;
    bearerOrigins?: string[] | '*';
    bearerWorker?: string;
    labels?: Partial<Labels>;
    keyboard?: boolean;
    visible?: boolean;
    hideDelay?: number;
    glass?: boolean;
    iconSize?: number;
    simple?: boolean;
    airplay?: boolean;
    pip?: boolean;
    fullscreen?: boolean;
}

export interface LoadOptions {
    type?: SourceType;
    subtitles?: SubtitleSource[];
}

export interface PlayerEventMap {
    load: { src: string; type: EngineKind; engine: EngineName };
    error: { message: string };
}

type Listener<K extends keyof PlayerEventMap> = (detail: PlayerEventMap[K]) => void;

type WebKitVideo = HTMLVideoElement & {
    webkitShowPlaybackTargetPicker?: () => void;
    webkitCurrentPlaybackTargetIsWireless?: boolean;
    webkitEnterFullscreen?: () => void;
    webkitPresentationMode?: string;
};

interface PlayerElements {
    msg: HTMLDivElement;
    play: HTMLButtonElement;
    mid: HTMLButtonElement;
    mute: HTMLButtonElement;
    volume: HTMLInputElement;
    volBox: HTMLDivElement;
    cur: HTMLSpanElement;
    dur: HTMLButtonElement;
    seek: HTMLInputElement;
    cc: HTMLButtonElement;
    gear: HTMLButtonElement;
    menu: HTMLDivElement;
    air: HTMLButtonElement;
    pip: HTMLButtonElement;
    fs: HTMLButtonElement;
    ui: HTMLDivElement;
    cues: HTMLDivElement;
}

function applyAspectShape(root: HTMLElement, shape: AspectRatioShape | undefined): void {
    const { style } = root;
    if (shape) {
        style.setProperty('--vp-aspect', `${shape.w} / ${shape.h}`);
        style.setProperty('--_ratio', String(shape.w / shape.h));
    } else {
        style.removeProperty('--vp-aspect');
        style.removeProperty('--_ratio');
    }
    root.classList.toggle('vp-portrait', !!shape && shape.h > shape.w);
}

function applyIconSize(root: HTMLElement, iconSize: number | null | undefined): void {
    if (iconSize == null) {
        root.style.removeProperty('--vp-icon-size');
        return;
    }
    if (typeof iconSize !== 'number' || !Number.isFinite(iconSize) || iconSize <= 0) {
        throw new Error(`Player: iconSize must be a positive number of px (got ${String(iconSize)})`);
    }
    root.style.setProperty('--vp-icon-size', `${iconSize}px`);
}

function parseHideDelay(hideDelay: number | null | undefined): number | undefined {
    if (hideDelay == null) return undefined;
    if (typeof hideDelay !== 'number' || !Number.isFinite(hideDelay) || hideDelay < 0) {
        throw new Error(`Player: hideDelay must be a number of seconds, 0 or more (got ${String(hideDelay)})`);
    }
    return hideDelay * 1000;
}

function createDom(t: Labels, options: PlayerOptions) {
    const button = (cls: string, label: string, iconName: IconName, hidden = false) =>
        h('button', { type: 'button', class: `vp-btn ${cls}`, 'aria-label': label, hidden }, icon(iconName));

    const mute = button('vp-mute', t.mute, 'volume-high');
    const volume = h('input', { class: 'vp-range vp-volume', type: 'range', min: 0, max: 1, step: 0.01, value: 1, 'aria-label': t.volume });
    const volBox = h('div', { class: 'vp-vol' }, mute, volume);
    const cur = h('span', { class: 'vp-time' }, '0:00');
    const dur = h('button', { type: 'button', class: 'vp-time vp-dur' }, '0:00');
    const seek = h('input', { class: 'vp-range vp-seek', type: 'range', min: 0, max: SEEK_SCALE, step: 1, value: 0, 'aria-label': t.seek });
    const gear = button('vp-gear', t.settings, options.simple ? 'more-vertical' : 'settings');
    gear.setAttribute('aria-haspopup', 'menu');
    gear.setAttribute('aria-expanded', 'false');
    const menu = h('div', { class: 'vp-menu', role: 'menu', hidden: true });
    const play = button('vp-play', t.play, 'play');
    const mid = button('vp-play-mid', t.play, 'play');
    const cc = button('vp-cc', t.captions, 'captions-off', true);
    const air = button('vp-air', t.airplay, 'airplay-enter', true);
    const pip = button('vp-pip', t.pip, 'pip-enter', true);
    const fs = button('vp-fs', t.fullscreen, 'fullscreen-enter', !options.fullscreen);
    const msg = h('div', { class: 'vp-msg', role: 'alert', hidden: true });

    const bar = h(
        'div',
        { class: 'vp-bar' },
        play,
        volBox,
        h('div', { class: 'vp-timeline' }, cur, seek, dur),
        cc,
        h('div', { class: 'vp-set' }, gear, menu),
        h('div', { class: 'vp-screen' }, h('div', { class: 'vp-remote' }, air, pip), fs),
    );
    const cues = h('div', { class: 'vp-cues', 'aria-hidden': 'true' });
    const ui = h('div', { class: 'vp-ui' }, bar, mid, cues);
    const video = h('video', { class: 'vp-video', playsinline: true });
    const rootClass = ['vp', options.glass ? 'vp-glass' : '', options.simple ? 'vp-simple' : ''].filter(Boolean).join(' ');
    const root = h('div', { class: rootClass, tabindex: -1, role: 'group', 'aria-label': t.player }, video, msg, ui);

    video.playsInline = true;
    video.preload = options.preload || 'metadata';
    if (options.thumbnail) video.poster = options.thumbnail;
    video.muted = !!options.muted;
    video.loop = !!options.loop;
    video.autoplay = !!options.autoplay;
    applyAspectShape(root, options.aspectRatio == null ? undefined : parseAspectRatio(options.aspectRatio));
    applyIconSize(root, options.iconSize);

    const el: PlayerElements = { msg, play, mid, mute, volume, volBox, cur, dur, seek, cc, gear, menu, air, pip, fs, ui, cues };
    return { root, video, el };
}

export class Player {
    readonly root: HTMLDivElement;
    readonly video: HTMLVideoElement;

    private readonly options: PlayerOptions;
    private readonly t: Labels;
    private readonly ac = new AbortController();
    private readonly el: PlayerElements;
    private readonly captions: Captions;
    private readonly menu: SettingsMenu;
    private readonly listeners = new Map<keyof PlayerEventMap, Set<(detail: never) => void>>();
    private engine: Engine = NONE;
    private loadId = 0;
    private lastCaption = 0;
    private seeking = false;
    private adjustingVolume = false;
    private seekTarget: number | null = null;
    private showRemaining = false;
    private readonly hideDelayMs: number | undefined;
    private idleTimer: ReturnType<typeof setTimeout> | undefined = undefined;
    private playTimer: ReturnType<typeof setTimeout> | undefined = undefined;
    private scrubTimer: ReturnType<typeof setTimeout> | undefined = undefined;
    private zoom = 1;
    private autoAspect = false;
    private autoRatio = 0;
    private dots: boolean;

    constructor(target: Element | string, options: PlayerOptions = {}) {
        const host = typeof target === 'string' ? document.querySelector(target) : target;
        if (!(host instanceof Element)) throw new Error(`Player: element not found (${String(target)})`);
        this.options = options;
        this.dots = !!options.simple;
        this.t = { ...LABELS, ...options.labels };
        this.hideDelayMs = parseHideDelay(options.hideDelay);

        const { root, video, el } = createDom(this.t, options);
        host.append(root);
        this.root = root;
        this.video = video;
        this.el = el;
        this.autoAspect = options.aspectRatio == null;

        this.captions = new Captions(this.video, () => this.engine, this.t);
        new CueLayer(this.video, this.el.cues, this.captions, this.ac.signal);
        this.menu = new SettingsMenu(this.root, this.el.gear, this.el.menu, {
            t: this.t,
            video: this.video,
            captions: this.captions,
            getEngine: () => this.engine,
            getZoom: () => this.zoom,
            getIconScale: () => this.iconScale(true),
            getActions: () => this.menuActions(),
            onToggle: () => this.wake(),
            signal: this.ac.signal,
        });
        this.bindPlayback();
        this.bindVolume();
        this.bindProgress();
        this.bindCaptions();
        this.bindRemoteAndFullscreen();
        this.bindIdleAndKeyboard();
        this.bindResize();
        this.bindContextMenu();
        this.listen(this.video, 'ratechange', () => this.refresh());
        for (const type of ['loadedmetadata', 'resize']) this.listen(this.video, type, () => this.syncAspect());

        this.tick();
        this.syncPlay();
        this.syncCaptionButton();
        this.video.dispatchEvent(new Event('volumechange'));
        if (options.src) void this.load(options.src, options);
    }

    async load(src: string, { type, subtitles = [] }: LoadOptions = {}): Promise<void> {
        const id = ++this.loadId;
        this.unload();
        if (!src) return;
        const alive = () => id === this.loadId;
        const ctx: EngineContext = {
            alive,
            auth: createAuth(this.options.bearerToken, this.options.bearerOrigins, src),
            worker: this.options.bearerWorker,
            refresh: () => {
                if (alive()) this.refresh();
            },
            fatal: (message) => {
                if (alive()) this.fatal(message);
            },
        };
        try {
            const kind = detectType(src, type);
            void this.captions.load(subtitles, alive, ctx.auth).then(() => this.refresh());
            const engine = await createEngine(kind, this.video, src, ctx, this.options.hls);
            if (!alive()) return engine.destroy();
            this.engine = engine;
            this.emit('load', { src, type: kind, engine: engine.name });
        } catch (e) {
            if (alive()) this.showError(e instanceof Error ? e.message : String(e));
        }
        if (alive()) this.refresh();
    }

    play(): Promise<void> {
        return this.video.play();
    }

    pause(): void {
        this.video.pause();
    }

    togglePlay(): void {
        const { video } = this;
        if (video.paused) video.play().catch(() => {});
        else video.pause();
    }

    toggleFullscreen(): void {
        const { root, video } = this;
        if (document.fullscreenElement === root) document.exitFullscreen().catch(() => {});
        else if (typeof root.requestFullscreen === 'function') root.requestFullscreen().catch(() => {});
        else (video as WebKitVideo).webkitEnterFullscreen?.(); // iPhone Safari: only <video> can go fullscreen
    }

    setAspectRatio(aspectRatio?: AspectRatio | null): void {
        applyAspectShape(this.root, aspectRatio == null ? undefined : parseAspectRatio(aspectRatio));
        this.autoRatio = 0;
        this.autoAspect = aspectRatio == null;
        this.syncAspect();
    }

    setGlass(on = true): void {
        this.root.classList.toggle('vp-glass', !!on);
    }

    setIconSize(iconSize?: number | null): void {
        applyIconSize(this.root, iconSize);
        this.layout();
    }

    setSimple(on = true): void {
        const { classList } = this.root;
        classList.toggle('vp-simple', !!on);
        classList.remove('vp-playflash', 'vp-scrub');
        clearTimeout(this.playTimer);
        clearTimeout(this.scrubTimer);
        this.menu.setOpen(false);
        this.layout();
    }

    showError(message: string): void {
        this.el.msg.textContent = message;
        this.el.msg.hidden = false;
        this.emit('error', { message });
    }

    on<K extends keyof PlayerEventMap>(type: K, fn: Listener<K>): this {
        const set: Set<(detail: never) => void> = this.listeners.get(type) ?? new Set();
        set.add(fn);
        this.listeners.set(type, set);
        return this;
    }

    off<K extends keyof PlayerEventMap>(type: K, fn: Listener<K>): this {
        this.listeners.get(type)?.delete(fn);
        return this;
    }

    private emit<K extends keyof PlayerEventMap>(type: K, detail: PlayerEventMap[K]): void {
        this.listeners.get(type)?.forEach((fn) => (fn as Listener<K>)(detail));
    }

    destroy(): void {
        this.loadId++;
        clearTimeout(this.idleTimer);
        clearTimeout(this.playTimer);
        clearTimeout(this.scrubTimer);
        this.ac.abort();
        if (document.fullscreenElement === this.root) document.exitFullscreen().catch(() => {});
        if (document.pictureInPictureElement === this.video) document.exitPictureInPicture().catch(() => {});
        this.unload();
        this.root.remove();
        this.listeners.clear();
    }

    private listen(target: EventTarget, type: string, fn: (e: Event) => void): void {
        target.addEventListener(type, fn, { signal: this.ac.signal });
    }

    private syncPlay(): void {
        const { video, t } = this;
        const state = video.ended ? 'replay' : video.paused ? 'play' : 'pause';
        for (const btn of [this.el.play, this.el.mid]) {
            setIcon(btn, { replay: 'restart', play: 'play', pause: 'pause' }[state] as IconName);
            btn.setAttribute('aria-label', t[state]);
        }
    }

    private bindPlayback(): void {
        const { video } = this;
        this.listen(this.el.play, 'click', () => this.pressPlay());
        this.listen(this.el.mid, 'click', () => this.pressPlay());
        this.listen(video, 'click', () => this.pressPlay());
        for (const type of ['play', 'pause', 'ended', 'seeked', 'emptied']) {
            this.listen(video, type, () => {
                this.syncPlay();
                this.wake();
            });
        }
    }

    private pressPlay(): void {
        this.togglePlay();
        this.flashPlay();
    }

    private get simple(): boolean {
        return this.root.classList.contains('vp-simple');
    }

    private flashPlay(): void {
        this.root.classList.add('vp-playflash');
        clearTimeout(this.playTimer);
        this.playTimer = setTimeout(() => this.root.classList.remove('vp-playflash'), PLAY_FLASH_MS);
    }

    private showTime(): void {
        if (!this.simple) return;
        this.root.classList.add('vp-scrub');
        clearTimeout(this.scrubTimer);
        if (!this.seeking) this.scrubTimer = setTimeout(() => this.root.classList.remove('vp-scrub'), SCRUB_HIDE_MS);
    }

    private menuActions(): MenuAction[] {
        if (!this.dots) return [];
        const { t, video } = this;
        const actions: MenuAction[] = [];
        if (!this.el.air.hidden) {
            const wireless = (video as WebKitVideo).webkitCurrentPlaybackTargetIsWireless;
            actions.push({ id: 'air', text: t.airplay, icon: wireless ? 'airplay-exit' : 'airplay-enter', run: () => this.pickAirPlay() });
        }
        if (!this.el.pip.hidden) {
            const on = document.pictureInPictureElement === video;
            actions.push({ id: 'pip', text: on ? t.exitPip : t.pip, icon: on ? 'pip-exit' : 'pip-enter', run: () => this.togglePip() });
        }
        if (this.el.fs.hidden) return actions;
        const full = document.fullscreenElement === this.root;
        actions.push({
            id: 'fs',
            text: full ? t.exitFullscreen : t.fullscreen,
            icon: full ? 'fullscreen-exit' : 'fullscreen-enter',
            run: () => this.toggleFullscreen(),
        });
        return actions;
    }

    private bindVolume(): void {
        const { video, t } = this;
        const { volume, volBox, mute } = this.el;
        this.listen(mute, 'click', () => {
            if (video.muted || video.volume === 0) {
                video.muted = false;
                if (video.volume === 0) video.volume = 0.5;
            } else video.muted = true;
        });
        this.listen(volume, 'input', () => {
            const value = Math.max(0, Math.min(1, Number(volume.value)));
            video.volume = value;
            video.muted = value === 0;
        });
        // A native slider keeps following the pointer after it leaves the element. Hold it open for the whole
        // press-and-drag instead of relying on :hover / :focus-within: if it collapsed meanwhile (width: 0) the
        // browser reports value = min for every pointer position and the input handler above would mute the video.
        this.listen(volume, 'pointerdown', () => {
            this.adjustingVolume = true;
            volBox.classList.add('vp-drag');
            volume.classList.add('vp-grab');
        });
        this.listen(video, 'volumechange', () => {
            const level = video.muted ? 0 : video.volume;
            volume.value = String(level);
            volume.style.setProperty('--p', level * 100 + '%');
            setIcon(mute, level === 0 ? 'mute' : level < 0.5 ? 'volume-low' : 'volume-high');
            mute.setAttribute('aria-label', level === 0 ? t.unmute : t.mute);
        });
    }

    private bufferedEnd(): number {
        const { buffered, currentTime } = this.video;
        for (let i = 0; i < buffered.length; i++) {
            if (buffered.start(i) <= currentTime + 0.1 && currentTime <= buffered.end(i)) return buffered.end(i);
        }
        return currentTime;
    }

    private tick(): void {
        const { video } = this;
        const { seek, cur, dur } = this.el;
        const d = video.duration;
        const known = Number.isFinite(d) && d > 0;
        if (!this.seeking) seek.value = String(known ? (video.currentTime / d) * SEEK_SCALE : 0);
        const position = Number(seek.value);
        const shown = this.seeking && known ? (position / SEEK_SCALE) * d : video.currentTime;
        cur.textContent = formatTime(shown);
        const live = d === Infinity;
        if (live) dur.textContent = this.t.live;
        else if (!known) dur.textContent = this.showRemaining ? '-0:00' : '0:00';
        else dur.textContent = this.showRemaining ? '-' + formatTime(Math.max(0, Math.floor(d) - Math.floor(shown))) : formatTime(d);
        // aria-disabled and not disabled: a disabled button that has the focus would swallow the keys of the player until the next click
        if (dur.getAttribute('aria-disabled') !== String(live)) dur.setAttribute('aria-disabled', String(live));
        seek.style.setProperty('--p', position / 10 + '%');
        seek.style.setProperty('--b', (known ? Math.max((this.bufferedEnd() / d) * 100, position / 10) : 0) + '%');
    }

    private bindProgress(): void {
        const { video } = this;
        const { seek, dur, volume, volBox } = this.el;
        for (const type of ['timeupdate', 'durationchange', 'progress', 'loadedmetadata', 'seeked', 'emptied']) this.listen(video, type, () => this.tick());
        this.listen(dur, 'click', () => {
            if (video.duration === Infinity) return;
            this.showRemaining = !this.showRemaining;
            this.tick();
        });
        this.listen(seek, 'pointerdown', () => {
            this.seeking = true;
            seek.classList.add('vp-grab');
            this.showTime();
        });
        const endDrag = () => {
            if (!this.seeking && !this.adjustingVolume) return;
            const wasSeeking = this.seeking;
            this.seeking = false;
            this.adjustingVolume = false;
            volBox.classList.remove('vp-drag');
            volume.classList.remove('vp-grab');
            seek.classList.remove('vp-grab');
            this.wake();
            if (wasSeeking) this.showTime();
        };
        for (const type of ['pointerup', 'pointercancel', 'blur']) this.listen(window, type, endDrag);
        this.listen(seek, 'input', () => {
            this.showTime();
            if (Number.isFinite(video.duration)) {
                this.seekTarget = (Number(seek.value) / SEEK_SCALE) * video.duration;
                if (this.engine.liveSeek) video.currentTime = this.seekTarget;
            }
            this.tick();
        });
        this.listen(seek, 'change', () => {
            if (this.seekTarget !== null) video.currentTime = this.seekTarget;
            this.seekTarget = null;
        });
    }

    private syncCaptionButton(): void {
        const { cc } = this.el;
        const i = this.captions.index();
        if (i >= 0) this.lastCaption = i;
        cc.hidden = this.captions.list().length === 0;
        cc.classList.toggle('vp-on', i >= 0);
        cc.setAttribute('aria-pressed', String(i >= 0));
        setIcon(cc, i >= 0 ? 'captions-on' : 'captions-off');
    }

    private bindCaptions(): void {
        const { video } = this;
        this.listen(this.el.cc, 'click', () => {
            this.captions.set(this.captions.index() >= 0 ? -1 : Math.min(this.lastCaption, this.captions.list().length - 1));
            this.refresh();
        });
        this.listen(video.textTracks, 'addtrack', () => this.refresh());
        this.listen(video.textTracks, 'change', () => this.refresh());
    }

    private refresh(): void {
        this.syncCaptionButton();
        this.menu.refresh();
    }

    private applyZoom(): void {
        this.zoom = document.fullscreenElement === this.root ? Math.min(ZOOM_MAX, Math.max(1, this.root.clientWidth / ZOOM_BASE_WIDTH)) : 1;
        this.el.ui.style.zoom = String(this.zoom);
        this.menu.fit();
    }

    private syncNativeCaptions(): void {
        const { video } = this;
        const mode = (video as WebKitVideo).webkitPresentationMode;
        this.root.classList.toggle('vp-native', document.pictureInPictureElement === video || (mode !== undefined && mode !== 'inline'));
    }

    private bindRemoteAndFullscreen(): void {
        const { video, t } = this;
        const { pip, air, fs } = this.el;
        if (this.options.pip && document.pictureInPictureEnabled && !video.disablePictureInPicture) pip.hidden = false;
        this.listen(pip, 'click', () => this.togglePip());
        const syncPip = () => {
            const on = document.pictureInPictureElement === video;
            setIcon(pip, on ? 'pip-exit' : 'pip-enter');
            pip.setAttribute('aria-label', on ? t.exitPip : t.pip);
            this.syncNativeCaptions();
        };
        this.listen(video, 'enterpictureinpicture', syncPip);
        this.listen(video, 'leavepictureinpicture', syncPip);
        this.listen(video, 'webkitpresentationmodechanged', () => this.syncNativeCaptions());
        if (this.options.airplay && 'WebKitPlaybackTargetAvailabilityEvent' in window) {
            const webkitVideo = video as WebKitVideo;
            this.listen(video, 'webkitplaybacktargetavailabilitychanged', (e) => {
                air.hidden = (e as Event & { availability?: string }).availability !== 'available';
            });
            this.listen(video, 'webkitcurrentplaybacktargetiswirelesschanged', () => {
                setIcon(air, webkitVideo.webkitCurrentPlaybackTargetIsWireless ? 'airplay-exit' : 'airplay-enter');
            });
            this.listen(air, 'click', () => this.pickAirPlay());
        }
        this.listen(fs, 'click', () => this.toggleFullscreen());
        this.listen(document, 'fullscreenchange', () => {
            const on = document.fullscreenElement === this.root;
            setIcon(fs, on ? 'fullscreen-exit' : 'fullscreen-enter');
            fs.setAttribute('aria-label', on ? t.exitFullscreen : t.fullscreen);
            this.applyZoom();
        });
    }

    private togglePip(): void {
        if (document.pictureInPictureElement) document.exitPictureInPicture().catch(() => {});
        else this.video.requestPictureInPicture().catch(() => {});
    }

    private pickAirPlay(): void {
        (this.video as WebKitVideo).webkitShowPlaybackTargetPicker?.();
    }

    private bindResize(): void {
        if (typeof ResizeObserver === 'undefined') return;
        const observer = new ResizeObserver(() => this.layout());
        observer.observe(this.root);
        this.ac.signal.addEventListener('abort', () => observer.disconnect());
    }

    private iconScale(shrunk = false): number {
        const style = getComputedStyle(this.root);
        const px = parseFloat(style.getPropertyValue('--vp-icon-size'));
        const fit = shrunk ? parseFloat(style.getPropertyValue('--_fit')) : 1;
        const size = (Number.isFinite(px) ? px : ICON_SIZE.default) * (fit > 0 ? fit : 1);
        return Math.min(ICON_SIZE.max, Math.max(ICON_SIZE.min, size)) / ICON_SIZE.default;
    }

    private layout(): void {
        const { clientWidth } = this.root;
        const scale = this.iconScale();
        const at = (width: number) => SEEK_WIDTH + (width - SEEK_WIDTH) * scale;
        const tight = (width: number) => Math.max(at(width), width * scale);
        const { classList } = this.root;
        const simple = classList.contains('vp-simple');
        classList.toggle('vp-narrow', clientWidth <= NARROW_WIDTH);
        classList.toggle('vp-play-off', !simple && clientWidth <= tight(PLAY_WIDTH));
        classList.toggle('vp-cc-up', !simple && clientWidth <= tight(CC_WIDTH));
        classList.toggle('vp-air-up', clientWidth <= at(LIFT_WIDTH.air));
        classList.toggle('vp-pip-up', clientWidth <= at(LIFT_WIDTH.pip));
        classList.toggle('vp-vol-up', simple || clientWidth <= at(LIFT_WIDTH.vol));
        classList.toggle('vp-fs-up', clientWidth <= at(LIFT_WIDTH.fs));
        this.syncGear();
        this.applyZoom();
    }

    private syncGear(): void {
        const { classList } = this.root;
        const dots = classList.contains('vp-simple') || classList.contains('vp-play-off');
        if (dots === this.dots) return;
        this.dots = dots;
        if (this.menu.isOpen) this.menu.setOpen(false);
        setIcon(this.el.gear, dots ? 'more-vertical' : 'settings');
    }

    private syncAspect(): void {
        if (!this.autoAspect) return;
        const { videoWidth, videoHeight } = this.video;
        if (!(videoWidth > 0 && videoHeight > 0)) return;
        if (this.autoRatio === 0 && getComputedStyle(this.root).getPropertyValue('--vp-aspect').trim() !== '') {
            this.autoAspect = false;
            return;
        }
        const ratio = Math.min(AUTO_ASPECT.max, Math.max(AUTO_ASPECT.min, videoWidth / videoHeight));
        if (Math.abs(ratio / this.autoRatio - 1) < 0.005) return;
        this.autoRatio = ratio;
        applyAspectShape(this.root, { w: ratio, h: 1 });
    }

    private bindContextMenu(): void {
        this.listen(this.root, 'contextmenu', (e) => e.preventDefault());
    }

    private wake(): void {
        const { root } = this;
        root.classList.remove('vp-idle');
        clearTimeout(this.idleTimer);
        if (this.options.visible) return;
        this.idleTimer = setTimeout(() => this.hideControls(), IDLE_MS);
    }

    private hideControls(): void {
        if (!this.video.paused && !this.menu.isOpen && !this.seeking && !this.adjustingVolume) this.root.classList.add('vp-idle');
    }

    private onPointerLeave(e: PointerEvent): void {
        if (this.hideDelayMs === undefined || this.options.visible || e.pointerType === 'touch') return;
        clearTimeout(this.idleTimer);
        this.idleTimer = setTimeout(() => this.hideControls(), this.hideDelayMs);
    }

    private onKeydown(e: KeyboardEvent): void {
        const { video } = this;
        const target = e.target;
        if (!(target instanceof Element)) return;
        const key = String(e.key).toLowerCase();
        if (key === 'escape' && this.menu.isOpen) {
            this.menu.setOpen(false);
            this.el.gear.focus();
            return;
        }
        if (!this.options.keyboard || target.matches('input') || e.metaKey || e.ctrlKey || e.altKey) return;

        let action: (() => void) | undefined;
        switch (key) {
            case 'k':
                action = () => this.pressPlay();
                break;
            case ' ':
                if (!target.closest('button')) action = () => this.pressPlay();
                break;
            case 'f':
                if (this.options.fullscreen) action = () => this.toggleFullscreen();
                break;
            case 'm':
                action = () => {
                    video.muted = !video.muted;
                };
                break;
            case 'arrowleft':
                action = () => {
                    video.currentTime -= SEEK_STEP_S;
                    this.showTime();
                };
                break;
            case 'arrowright':
                action = () => {
                    video.currentTime += SEEK_STEP_S;
                    this.showTime();
                };
                break;
        }
        if (action) {
            e.preventDefault();
            action();
        }
    }

    private bindIdleAndKeyboard(): void {
        const { root } = this;
        for (const type of ['pointermove', 'pointerdown', 'keydown', 'focusin']) this.listen(root, type, () => this.wake());
        this.listen(root, 'pointerleave', (e) => this.onPointerLeave(e as PointerEvent));
        this.listen(root, 'keydown', (e) => this.onKeydown(e as KeyboardEvent));
    }

    private unload(): void {
        this.engine.destroy();
        this.engine = NONE;
        this.captions.reset();
        this.lastCaption = 0;
        this.el.msg.hidden = true;
        this.video.removeAttribute('src');
        this.video.load();
        this.refresh();
    }

    private fatal(message: string): void {
        this.engine.destroy();
        this.engine = NONE;
        this.showError(message);
        this.refresh();
    }
}
