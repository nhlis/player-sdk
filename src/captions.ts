import { authFetch, type Auth } from './auth.js';
import type { Engine } from './engines.js';
import { h, type Labels } from './utils.js';

export interface SubtitleSource {
    url: string;
    lang?: string;
    label?: string;
}

export interface CaptionItem {
    index: number;
    label: string;
}

export function toVtt(text: string): string {
    const t = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
    if (/^WEBVTT/.test(t)) return t;
    return 'WEBVTT\n\n' + t.replace(/^.*-->.*$/gm, (line) => line.replace(/(\d{1,2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2'));
}

export class Captions {
    private readonly video: HTMLVideoElement;
    private readonly getEngine: () => Engine;
    private readonly t: Labels;
    private els: HTMLTrackElement[] = [];

    constructor(video: HTMLVideoElement, getEngine: () => Engine, t: Labels) {
        this.video = video;
        this.getEngine = getEngine;
        this.t = t;
    }

    async load(specs: SubtitleSource[], alive: () => boolean, auth?: Auth): Promise<void> {
        const texts = await Promise.all(
            specs.map((s) =>
                authFetch(auth, s.url)
                    .then((res) => (res.ok ? res.text() : null))
                    .catch(() => null),
            ),
        );
        if (!alive()) return;
        specs.forEach((s, i) => {
            const text = texts[i];
            if (text == null) return;
            const el = document.createElement('track');
            el.kind = 'subtitles';
            el.label = s.label || s.lang || this.t.subtitles;
            el.srclang = s.lang || '';
            el.src = URL.createObjectURL(new Blob([toVtt(text)], { type: 'text/vtt' }));
            this.video.appendChild(el);
            el.track.mode = 'disabled';
            this.els.push(el);
        });
    }

    reset(): void {
        for (const el of this.els) {
            URL.revokeObjectURL(el.src);
            el.remove();
        }
        this.els = [];
    }

    private native(): TextTrack[] {
        return Array.from(this.video.textTracks).filter((t) => /subtitles|captions/.test(t.kind));
    }

    private external(): TextTrack[] {
        return this.els.map((el) => el.track);
    }

    private managedCount(): number {
        const engine = this.getEngine();
        return engine.managed ? engine.texts().length : 0;
    }

    private name(label: string | undefined, i: number): string {
        return label || `${this.t.track} ${i + 1}`;
    }

    list(): CaptionItem[] {
        const engine = this.getEngine();
        if (!engine.managed) return this.native().map((t, i) => ({ index: i, label: this.name(t.label || t.language, i) }));
        const managed = engine.texts().map((t, i) => ({ index: i, label: this.name(t.label, i) }));
        return [...managed, ...this.external().map((t, k) => ({ index: managed.length + k, label: t.label }))];
    }

    index(): number {
        const engine = this.getEngine();
        if (!engine.managed) return this.native().findIndex((t) => t.mode === 'showing');
        if (engine.textIndex() >= 0) return engine.textIndex();
        const k = this.external().findIndex((t) => t.mode === 'showing');
        return k < 0 ? -1 : this.managedCount() + k;
    }

    shown(): TextTrack[] {
        return this.native().filter((t) => t.mode === 'showing');
    }

    set(i: number): void {
        const engine = this.getEngine();
        if (!engine.managed) {
            this.native().forEach((t, k) => {
                t.mode = k === i ? 'showing' : 'disabled';
            });
            return;
        }
        // hls.js switches every other TextTrack off whenever it changes its own subtitle track: set it first, the external ones after.
        const managed = this.managedCount();
        engine.setText(i >= 0 && i < managed ? i : -1);
        this.external().forEach((t, k) => {
            t.mode = i - managed === k ? 'showing' : 'disabled';
        });
    }

    label(): string {
        const i = this.index();
        return i < 0 ? this.t.off : this.list().find((c) => c.index === i)?.label || this.t.on;
    }
}

type Cue = TextTrackCue & { getCueAsHTML?: () => DocumentFragment; text?: string };

function cueNode(cue: Cue): Node {
    return cue.getCueAsHTML?.() ?? document.createTextNode(cue.text ?? '');
}

export class CueLayer {
    private readonly video: HTMLVideoElement;
    private readonly layer: HTMLElement;
    private readonly captions: Captions;
    private drawn = '';

    constructor(video: HTMLVideoElement, layer: HTMLElement, captions: Captions, signal: AbortSignal) {
        this.video = video;
        this.layer = layer;
        this.captions = captions;
        const watched = new WeakSet<TextTrack>();
        const sync = () => {
            for (const track of Array.from(video.textTracks)) {
                if (watched.has(track)) continue;
                watched.add(track);
                track.addEventListener('cuechange', () => this.render(), { signal });
            }
            this.render();
        };
        for (const type of ['addtrack', 'removetrack', 'change']) video.textTracks.addEventListener(type, sync, { signal });
        const recheck = () => this.render();
        for (const type of ['timeupdate', 'seeked', 'playing', 'emptied']) video.addEventListener(type, recheck, { signal });
        document.addEventListener('visibilitychange', recheck, { signal });
        sync();
    }

    private render(): void {
        const { currentTime } = this.video;
        const cues: Cue[] = [];
        for (const track of this.captions.shown()) {
            for (const cue of Array.from(track.activeCues ?? []) as Cue[]) {
                if (cue.endTime > currentTime) cues.push(cue);
            }
        }
        const key = cues.map((cue) => `${cue.startTime}|${cue.endTime}|${cue.text ?? ''}`).join('\n');
        if (key === this.drawn) return;
        this.drawn = key;
        const lines: HTMLElement[] = [];
        for (const cue of cues) {
            const text = h('span', { class: 'vp-cue-t' }, cueNode(cue));
            if (text.textContent?.trim()) lines.push(h('div', { class: 'vp-cue' }, text));
        }
        this.layer.replaceChildren(...lines);
    }
}
