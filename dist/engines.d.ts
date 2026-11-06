import type { HlsConfig } from 'hls.js';
import { type Auth } from './auth.js';
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
    texts(): {
        label: string;
    }[];
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
export declare const NONE: Engine;
export declare const mbps: (bitsPerSecond: number) => string;
export declare function sortLevels(list: RawLevel[]): Level[];
export declare const levelText: ({ id, h, b, dup }: Level, word?: string) => string;
export declare const playingText: (level: PlayingLevel | undefined) => string;
export declare function detectType(src: string, type?: SourceType): EngineKind;
export declare function createEngine(kind: EngineKind, video: HTMLVideoElement, src: string, ctx: EngineContext, hlsConfig?: Partial<HlsConfig>): Promise<Engine>;
