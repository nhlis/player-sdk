export const LABELS = {
    player: 'Video player',
    play: 'Play',
    pause: 'Pause',
    replay: 'Replay',
    mute: 'Mute',
    unmute: 'Unmute',
    volume: 'Volume',
    seek: 'Seek',
    captions: 'Captions',
    settings: 'Settings',
    quality: 'Quality',
    speed: 'Speed',
    auto: 'Auto',
    off: 'Off',
    on: 'On',
    back: 'Back',
    fullscreen: 'Fullscreen',
    exitFullscreen: 'Exit fullscreen',
    pip: 'Picture in picture',
    exitPip: 'Exit picture in picture',
    airplay: 'AirPlay',
    live: 'LIVE',
    level: 'Level',
    track: 'Track',
    subtitles: 'Subtitles',
};

export type Labels = typeof LABELS;

export function formatTime(seconds: number): string {
    const s = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const x = String(s % 60).padStart(2, '0');
    return h ? `${h}:${String(m).padStart(2, '0')}:${x}` : `${m}:${x}`;
}

export type Attr = string | number | boolean | null | undefined;
export type Child = Node | string | null | undefined | false;

export function h<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    props?: Record<string, Attr> | null,
    ...children: (Child | readonly Child[])[]
): HTMLElementTagNameMap[K] {
    const el = document.createElement(tag);
    for (const [name, value] of Object.entries(props ?? {})) {
        if (value != null && value !== false) el.setAttribute(name, value === true ? '' : String(value));
    }
    el.append(...children.flat().filter((c): c is Node | string => c != null && c !== false));
    return el;
}
