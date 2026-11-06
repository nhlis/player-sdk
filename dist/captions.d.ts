import { type Auth } from './auth.js';
import type { Engine } from './engines.js';
import { type Labels } from './utils.js';
export interface SubtitleSource {
    url: string;
    lang?: string;
    label?: string;
}
export interface CaptionItem {
    index: number;
    label: string;
}
export declare function toVtt(text: string): string;
export declare class Captions {
    private readonly video;
    private readonly getEngine;
    private readonly t;
    private els;
    constructor(video: HTMLVideoElement, getEngine: () => Engine, t: Labels);
    load(specs: SubtitleSource[], alive: () => boolean, auth?: Auth): Promise<void>;
    reset(): void;
    private native;
    private external;
    private managedCount;
    private name;
    list(): CaptionItem[];
    index(): number;
    shown(): TextTrack[];
    set(i: number): void;
    label(): string;
}
export declare class CueLayer {
    private readonly video;
    private readonly layer;
    private readonly captions;
    private drawn;
    constructor(video: HTMLVideoElement, layer: HTMLElement, captions: Captions, signal: AbortSignal);
    private render;
}
