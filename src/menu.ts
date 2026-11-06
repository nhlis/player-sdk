import type { Captions } from './captions.js';
import { levelText, mbps, playingText, type Engine } from './engines.js';
import { icon, type IconName } from './icons.js';
import { h, type Child, type Labels } from './utils.js';

const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
const ROW_ICON = { quality: 'menu-item-toggle', speed: 'menu-item-accessibility', captions: 'menu-item-caption' } as const satisfies Record<string, IconName>;

type Page = keyof typeof ROW_ICON;
const PAGES = Object.keys(ROW_ICON) as Page[];
const isPage = (value: string | undefined): value is Page => PAGES.includes(value as Page);

interface MenuOption {
    val: number;
    text: string;
    badge?: string;
    pill?: string;
    checked: boolean;
}

interface RootRow {
    go: Page;
    text: string;
    value: string;
}

export interface MenuAction {
    id: string;
    text: string;
    icon: IconName;
    run: () => void;
}
type ActionRow = Pick<MenuAction, 'id' | 'text' | 'icon'>;

type MenuModel = { page: 'root'; rows: RootRow[]; actions: ActionRow[] } | { page: Page; title: string; rows: MenuOption[] };

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

export class SettingsMenu {
    private readonly root: HTMLElement;
    private readonly gear: HTMLElement;
    private readonly menu: HTMLElement;
    private readonly deps: MenuDeps;
    private page: 'root' | Page = 'root';
    private sig = ''; // what is rendered now: refresh() leaves the DOM alone while nothing changed, so a click is never lost to a re-render

    constructor(root: HTMLElement, gear: HTMLElement, menu: HTMLElement, deps: MenuDeps) {
        this.root = root;
        this.gear = gear;
        this.menu = menu;
        this.deps = deps;
        const { signal } = deps;

        gear.addEventListener('click', () => this.setOpen(!this.isOpen), { signal });
        // composedPath() is captured at dispatch time. e.target is already detached once render() rebuilds the menu,
        // so asking e.target.closest(...) would report "clicked outside" and close the menu right after every row click.
        document.addEventListener(
            'click',
            (e) => {
                const wrapper = this.menu.parentElement;
                if (!this.menu.hidden && !(wrapper && e.composedPath().includes(wrapper))) this.setOpen(false);
            },
            { signal },
        );
        menu.addEventListener('click', (e) => this.onRowClick(e), { signal });
        menu.addEventListener('keydown', (e) => this.onKeydown(e), { signal });
    }

    get isOpen(): boolean {
        return !this.menu.hidden;
    }

    setOpen(open: boolean): void {
        this.menu.hidden = !open;
        this.gear.setAttribute('aria-expanded', String(open));
        if (open) {
            this.fit();
            this.show('root');
        }
        this.deps.onToggle();
    }

    fit(): void {
        if (this.menu.hidden) return;
        const k = this.deps.getIconScale();
        const floor = 140 * Math.min(k, 1);
        if (this.root.classList.contains('vp-simple')) {
            const room = this.root.clientHeight / this.deps.getZoom() - (56 * k + 2 + 8) - (22 * k + 8);
            this.menu.style.maxHeight = Math.max(floor, room) + 'px';
            return;
        }
        const below = 57 * k + 2 + 8;
        const above = this.root.classList.contains('vp-air-up') ? 56 * k + 2 + 8 : 43;
        this.menu.style.maxHeight = Math.max(floor, this.root.clientHeight / this.deps.getZoom() - below - above) + 'px';
    }

    refresh(): void {
        if (this.menu.hidden) return;
        const focused = this.rows().findIndex((row) => row === document.activeElement);
        this.render();
        if (focused >= 0) this.rows()[focused]?.focus();
    }

    private rows(): HTMLElement[] {
        return [...this.menu.querySelectorAll<HTMLElement>('.vp-mi')];
    }

    private show(page: 'root' | Page): void {
        this.page = page;
        this.render(true);
        this.rows()[0]?.focus();
    }

    private onRowClick(e: MouseEvent): void {
        const row = e.target instanceof Element ? e.target.closest<HTMLElement>('.vp-mi') : null;
        if (!row) return;
        const { go, val, act } = row.dataset;
        if (act) {
            const action = this.deps.getActions().find((a) => a.id === act);
            this.setOpen(false);
            this.gear.focus({ preventScroll: true });
            action?.run();
            return;
        }
        if (isPage(go)) {
            this.show(go);
            return;
        }
        if (!('back' in row.dataset)) {
            const { video, captions, getEngine } = this.deps;
            const value = Number(val);
            if (this.page === 'quality') getEngine().setLevel(value);
            else if (this.page === 'speed') video.playbackRate = value;
            else captions.set(value);
        }
        this.show('root');
    }

    private onKeydown(e: KeyboardEvent): void {
        const rows = this.rows();
        const i = rows.findIndex((row) => row === document.activeElement);
        const swallow = () => {
            e.preventDefault();
            e.stopPropagation(); // the player must not turn the arrow keys into seeking
        };
        const focus = (n: number) => {
            swallow();
            rows[(n + rows.length) % rows.length]?.focus();
        };
        switch (e.key) {
            case 'ArrowDown':
                focus(i + 1);
                break;
            case 'ArrowUp':
                focus(i < 0 ? -1 : i - 1);
                break;
            case 'Home':
                focus(0);
                break;
            case 'End':
                focus(-1);
                break;
            case 'ArrowRight':
                if (this.page === 'root' && i >= 0) {
                    swallow();
                    rows[i]?.click();
                }
                break;
            case 'ArrowLeft':
                if (this.page !== 'root') {
                    swallow();
                    this.show('root');
                }
                break;
        }
    }

    private qualityText(): string {
        const { t, getEngine } = this.deps;
        const engine = getEngine();
        if (engine.autoOn()) {
            const now = playingText(engine.current());
            return now ? `${t.auto} (${now})` : t.auto;
        }
        const pinned = engine.levels().find((l) => l.id === engine.levelId());
        return pinned ? levelText(pinned, t.level) : '';
    }

    private options(page: Page): MenuOption[] {
        const { t, video, captions, getEngine } = this.deps;
        const engine = getEngine();
        switch (page) {
            case 'quality': {
                const auto = engine.autoOn();
                return [
                    { val: -1, text: auto ? this.qualityText() : t.auto, checked: auto },
                    ...engine.levels().map((l) => ({
                        val: l.id,
                        text: l.h ? `${l.h}p` : l.b ? mbps(l.b) : `${t.level} ${l.id + 1}`,
                        badge: l.h >= 2160 ? '4K' : l.h >= 1080 ? 'HD' : '',
                        pill: l.dup && l.b ? mbps(l.b) : '',
                        checked: !auto && engine.levelId() === l.id,
                    })),
                ];
            }
            case 'speed':
                return SPEEDS.map((s) => ({ val: s, text: `${s}×`, checked: video.playbackRate === s }));
            case 'captions': {
                const current = captions.index();
                return [
                    { val: -1, text: t.off, checked: current < 0 },
                    ...captions.list().map((c) => ({ val: c.index, text: c.label, checked: current === c.index })),
                ];
            }
        }
    }

    private model(): MenuModel {
        const { t, video, captions, getEngine } = this.deps;
        if (this.page !== 'root') return { page: this.page, title: t[this.page], rows: this.options(this.page) };
        const rows: RootRow[] = [];
        if (getEngine().levels().length) rows.push({ go: 'quality', text: t.quality, value: this.qualityText() });
        rows.push({ go: 'speed', text: t.speed, value: `${video.playbackRate}×` });
        if (captions.list().length) rows.push({ go: 'captions', text: t.captions, value: captions.label() });
        const actions = this.deps.getActions().map(({ id, text, icon }) => ({ id, text, icon }));
        return { page: 'root', rows, actions };
    }

    private view(m: MenuModel): HTMLElement[] {
        const { t } = this.deps;
        const row = (props: Record<string, string | number | boolean>, ...kids: Child[]) => h('button', { type: 'button', class: 'vp-mi', ...props }, ...kids);
        if (m.page === 'root') {
            const rows = m.rows.map((r) =>
                row(
                    { role: 'menuitem', 'data-go': r.go },
                    icon(ROW_ICON[r.go]),
                    h('span', { class: 'vp-mi-t' }, r.text),
                    h('span', { class: 'vp-mi-v' }, r.value),
                    icon('menu-back', 'vp-i vp-chev'),
                ),
            );
            const actions = m.actions.map((a) => row({ role: 'menuitem', 'data-act': a.id }, icon(a.icon), h('span', { class: 'vp-mi-t' }, a.text)));
            const sep = actions.length ? [h('div', { class: 'vp-sep', role: 'separator' })] : [];
            return [h('div', { class: 'vp-list' }, ...rows, ...sep, ...actions)];
        }
        const rows = m.rows.map((r) =>
            row(
                { role: 'menuitemradio', 'aria-checked': String(r.checked), 'data-val': r.val },
                h('span', { class: 'vp-mi-t' }, r.text, r.badge ? h('sup', { class: 'vp-badge' }, r.badge) : null),
                r.pill ? h('span', { class: 'vp-pill' }, r.pill) : null,
                r.checked ? icon('check', 'vp-i vp-ck') : null,
            ),
        );
        const head = h(
            'button',
            { type: 'button', class: 'vp-mi vp-head', role: 'menuitem', 'data-back': true, 'aria-label': `${t.back} (${m.title})` },
            icon('menu-back', 'vp-i vp-back'),
            h('span', { class: 'vp-mi-t' }, m.title),
        );
        return [head, h('div', { class: 'vp-sep', role: 'separator' }), h('div', { class: 'vp-list' }, ...rows)];
    }

    private render(centre = false): void {
        const m = this.model();
        const sig = JSON.stringify(m);
        if (!centre && sig === this.sig) return;
        this.sig = sig;
        this.menu.replaceChildren(...this.view(m));
        if (!centre) return;
        const list = this.menu.querySelector<HTMLElement>('.vp-list');
        const on = list?.querySelector<HTMLElement>('[aria-checked="true"]');
        if (list) list.scrollTop = on ? on.offsetTop - (list.clientHeight - on.offsetHeight) / 2 : 0;
    }
}
