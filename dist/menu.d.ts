import type { Captions } from './captions.js';
import { type Engine } from './engines.js';
import { type IconName } from './icons.js';
import { type Labels } from './utils.js';
export interface MenuAction {
    id: string;
    text: string;
    icon: IconName;
    run: () => void;
}
export interface MenuDeps {
    t: Labels;
    video: HTMLVideoElement;
    captions: Captions;
    getEngine: () => Engine;
    getZoom: () => number;
    getIconScale: () => number;
    getActions: () => MenuAction[];
    onToggle: () => void;
    signal: AbortSignal;
}
export declare class SettingsMenu {
    private readonly root;
    private readonly gear;
    private readonly menu;
    private readonly deps;
    private page;
    private sig;
    constructor(root: HTMLElement, gear: HTMLElement, menu: HTMLElement, deps: MenuDeps);
    get isOpen(): boolean;
    setOpen(open: boolean): void;
    fit(): void;
    refresh(): void;
    private rows;
    private show;
    private onRowClick;
    private onKeydown;
    private qualityText;
    private options;
    private model;
    private view;
    private render;
}
