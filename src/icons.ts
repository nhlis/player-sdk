// airplay-exit: the triangle's inline style="animation:..." became class="vp-air-tri" (see player.css) so a strict CSP does not block it.
// overflow="visible": an inline <svg> clips at its viewBox, and several icons are drawn right up to that edge (captions-off: its 2px stroke spans x=0..18).
// Safari shaved the right edge off that one (Chrome did not), most likely by snapping the clip to whole pixels when the box sits on a fractional position.
// It is a presentation attribute, not style="", so a strict CSP does not block it. player.css sets it again for pages that reset svg { overflow }.
const svg = (body: string, fill = 'currentColor'): string =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18" fill="${fill}" overflow="visible" aria-hidden="true" focusable="false">${body}</svg>`;

export const ICONS = {
    'airplay-enter': svg(
        '<path d="M14.5 2A3.5 3.5 0 0 1 18 5.5v5l-.005.18a3.5 3.5 0 0 1-3.027 3.288L13 12h1.5a1.5 1.5 0 0 0 1.5-1.5v-5A1.5 1.5 0 0 0 14.5 4h-11A1.5 1.5 0 0 0 2 5.5v5A1.5 1.5 0 0 0 3.5 12H5l-1.968 1.967A3.5 3.5 0 0 1 0 10.5v-5A3.5 3.5 0 0 1 3.5 2z"/><path d="M8.631 10.902a.5.5 0 0 1 .738 0l4.363 4.76a.5.5 0 0 1-.369.838H4.637a.5.5 0 0 1-.369-.838z"/>',
    ),
    'airplay-exit': svg(
        '<path d="M14.5 2A3.5 3.5 0 0 1 18 5.5v5a3.5 3.5 0 0 1-3.032 3.468L9.354 8.354a.5.5 0 0 0-.708 0l-5.615 5.614A3.5 3.5 0 0 1 0 10.5v-5A3.5 3.5 0 0 1 3.5 2z"/><path d="M14.5 2A3.5 3.5 0 0 1 18 5.5v5l-.005.18a3.5 3.5 0 0 1-3.027 3.288L13 12h1.5a1.5 1.5 0 0 0 1.5-1.5v-5A1.5 1.5 0 0 0 14.5 4h-11A1.5 1.5 0 0 0 2 5.5v5A1.5 1.5 0 0 0 3.5 12H5l-1.968 1.967A3.5 3.5 0 0 1 0 10.5v-5A3.5 3.5 0 0 1 3.5 2z"/><path d="M8.631 10.902a.5.5 0 0 1 .738 0l4.363 4.76a.5.5 0 0 1-.369.838H4.637a.5.5 0 0 1-.369-.838z" class="vp-air-tri"/>',
    ),
    // Caption lines (captions-off, menu-item-caption, captions-on): 2 thick, the same as the stroke-width of the outline, with fully round ends (rx 1).
    // Rows at y=7.5 and y=11: 1.5 apart, 1 above the inner edge of the border. captions-on cuts the same lines out of its filled body: change them together.
    'captions-off': svg(
        '<rect x="1" y="3" width="16" height="12" rx="2.5" stroke="currentColor" stroke-width="2"/><rect x="3" y="7.5" width="3" height="2" rx="1" fill="currentColor" fill-opacity="0.5"/><rect x="13" y="7.5" width="2" height="2" rx="1" fill="currentColor" fill-opacity="0.5"/><rect x="11" y="11" width="4" height="2" rx="1" fill="currentColor" fill-opacity="0.5"/><rect x="7" y="7.5" width="5" height="2" rx="1" fill="currentColor" fill-opacity="0.5"/><rect x="3" y="11" width="7" height="2" rx="1" fill="currentColor" fill-opacity="0.5"/>',
        'none',
    ),
    'captions-on': svg(
        '<path d="M14.5 2A3.5 3.5 0 0 1 18 5.5v7a3.5 3.5 0 0 1-3.5 3.5h-11A3.5 3.5 0 0 1 0 12.5v-7A3.5 3.5 0 0 1 3.5 2zM4 7.5a1 1 0 0 0 0 2h1a1 1 0 0 0 0-2h-1ZM8 7.5a1 1 0 0 0 0 2h3a1 1 0 0 0 0-2h-3ZM14 7.5a1 1 0 0 0 0 2a1 1 0 0 0 0-2ZM4 11a1 1 0 0 0 0 2h5a1 1 0 0 0 0-2h-5ZM12 11a1 1 0 0 0 0 2h2a1 1 0 0 0 0-2h-2Z"/>',
    ),
    'fullscreen-enter': svg(
        '<path d="M9.57 3.617A1 1 0 0 0 8.646 3H4c-.552 0-1 .449-1 1v4.646a.996.996 0 0 0 1.001 1 1 1 0 0 0 .706-.293l4.647-4.647a1 1 0 0 0 .216-1.089m4.812 4.812a1 1 0 0 0-1.089.217l-4.647 4.647a.998.998 0 0 0 .708 1.706H14c.552 0 1-.449 1-1V9.353a1 1 0 0 0-.618-.924"/>',
    ),
    'fullscreen-exit': svg(
        '<path d="M7.883 1.93a.99.99 0 0 0-1.09.217L2.146 6.793A.998.998 0 0 0 2.853 8.5H7.5c.551 0 1-.449 1-1V2.854a1 1 0 0 0-.617-.924m7.263 7.57H10.5c-.551 0-1 .449-1 1v4.646a.996.996 0 0 0 1.001 1.001 1 1 0 0 0 .706-.293l4.646-4.646a.998.998 0 0 0-.707-1.707z"/>',
    ),
    'menu-back': svg(
        '<path d="M11.964 9.014 7.014 4.064m0 9.9 4.95-4.95" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>',
        'none',
    ),
    'menu-item-accessibility': svg(
        '<path d="M9 18q-.213 0-.424-.012h.85Q9.214 18 9 18M9 2a8 8 0 0 1 8 8c0 1.975-.719 3.78-1.905 5.175a.75.75 0 0 1-1.204.018l-1.509-1.971a.75.75 0 0 1 .596-1.206h1.674a6 6 0 1 0-11.304 0h1.68a.75.75 0 0 1 .596 1.206l-1.507 1.971a.75.75 0 0 1-1.133.07l-.003.004A8 8 0 0 1 9 2"/><rect width="6" height="2" x="6" y="14" fill-opacity=".5" rx="1"/><path d="M8.3 6.318c.246-.64 1.154-.64 1.4 0L10.732 9h-.002a2 2 0 1 1-3.46 0h-.001z"/><g fill-opacity=".5"><circle cx="5" cy="10.25" r=".75"/><circle cx="13" cy="10.25" r=".75"/><circle cx="6" cy="7.25" r=".75"/><circle cx="12" cy="7.25" r=".75"/></g>',
    ),
    'menu-item-caption': svg(
        '<rect x="1" y="3" width="16" height="12" rx="2.5" stroke="currentColor" stroke-width="2"/><rect x="3" y="7.5" width="3" height="2" rx="1" fill="currentColor" fill-opacity="0.5"/><rect x="13" y="7.5" width="2" height="2" rx="1" fill="currentColor" fill-opacity="0.5"/><rect x="11" y="11" width="4" height="2" rx="1" fill="currentColor" fill-opacity="0.5"/><rect x="7" y="7.5" width="5" height="2" rx="1" fill="currentColor" fill-opacity="0.5"/><rect x="3" y="11" width="7" height="2" rx="1" fill="currentColor" fill-opacity="0.5"/>',
        'none',
    ),
    'menu-item-toggle': svg(
        '<path d="M12.5 9.5a3.5 3.5 0 1 1 0 7h-7a3.5 3.5 0 1 1 0-7zm-2 1.5a2 2 0 1 0 0 4h2a2 2 0 0 0 0-4z"/><path fill-opacity=".5" d="M12.5 1.5a3.5 3.5 0 1 1 0 7h-7a3.5 3.5 0 1 1 0-7zM5.5 3a2 2 0 1 0 0 4h2a2 2 0 0 0 0-4z"/>',
    ),
    mute: svg(
        '<path d="M.714 6.008h3.072l4.071-3.857c.5-.376 1.143 0 1.143.601V15.28c0 .602-.643.903-1.143.602l-4.071-3.858H.714c-.428 0-.714-.3-.714-.752V6.76c0-.451.286-.752.714-.752M14.5 7.586l-1.768-1.768a1 1 0 1 0-1.414 1.414L13.085 9l-1.767 1.768a1 1 0 0 0 1.414 1.414l1.768-1.768 1.768 1.768a1 1 0 0 0 1.414-1.414L15.914 9l1.768-1.768a1 1 0 0 0-1.414-1.414z"/>',
    ),
    pause: svg('<rect width="5" height="14" x="2" y="2" rx="1.75"/><rect width="5" height="14" x="11" y="2" rx="1.75"/>'),
    'pip-enter': svg(
        '<path d="M13 2a4 4 0 0 1 4 4v2.036A3.5 3.5 0 0 0 16.5 8H15V6.273C15 5.018 13.96 4 12.679 4H4.32C3.04 4 2 5.018 2 6.273v5.454C2 12.982 3.04 14 4.321 14H6v1.5q0 .255.036.5H4a4 4 0 0 1-4-4V6a4 4 0 0 1 4-4z"/><rect width="10" height="7" x="8" y="10" rx="2"/><path d="M7.129 5.547a.6.6 0 0 0-.656.13L3.677 8.473A.6.6 0 0 0 4.102 9.5h2.796c.332 0 .602-.27.602-.602V6.103a.6.6 0 0 0-.371-.556"/>',
    ),
    'pip-exit': svg(
        '<path d="M13 2a4 4 0 0 1 4 4v2.036A3.5 3.5 0 0 0 16.5 8H15V6.273C15 5.018 13.96 4 12.679 4H4.32C3.04 4 2 5.018 2 6.273v5.454C2 12.982 3.04 14 4.321 14H6v1.5q0 .255.036.5H4a4 4 0 0 1-4-4V6a4 4 0 0 1 4-4z"/><rect width="10" height="7" x="8" y="10" rx="2"/><path d="M4.871 10.454a.6.6 0 0 0 .656-.131l2.796-2.796A.6.6 0 0 0 7.898 6.5H5.102a.603.603 0 0 0-.602.602v2.795a.6.6 0 0 0 .371.556"/>',
    ),
    play: svg(
        '<path d="m14.051 10.723-7.985 4.964a1.98 1.98 0 0 1-2.758-.638A2.06 2.06 0 0 1 3 13.964V4.036C3 2.91 3.895 2 5 2c.377 0 .747.109 1.066.313l7.985 4.964a2.057 2.057 0 0 1 .627 2.808c-.16.257-.373.475-.627.637"/>',
    ),
    restart: svg(
        '<path d="M9 1a7.98 7.98 0 0 0-6.132 2.867l-1.441-1.44A.25.25 0 0 0 1 2.604V6.75c0 .138.112.25.25.25h4.146a.25.25 0 0 0 .177-.427L4.29 5.29A5.99 5.99 0 0 1 9 3a6 6 0 1 1-6 6H1a8 8 0 1 0 8-8"/><path d="m11.61 9.639-3.331 2.07a.826.826 0 0 1-1.15-.266.86.86 0 0 1-.129-.452V6.849C7 6.38 7.374 6 7.834 6c.158 0 .312.045.445.13l3.331 2.071a.858.858 0 0 1 0 1.438"/>',
    ),
    settings: svg(
        '<path d="M7.519 2.184c.357-1.578 2.605-1.579 2.962 0a1.518 1.518 0 0 0 2.292.949c1.368-.864 2.957.727 2.094 2.096-.56.886-.074 2.06.949 2.292 1.579.356 1.578 2.606 0 2.962a1.52 1.52 0 0 0-.95 2.293c.864 1.369-.725 2.96-2.093 2.095a1.52 1.52 0 0 0-2.292.95c-.357 1.578-2.606 1.578-2.962 0a1.52 1.52 0 0 0-2.292-.95c-1.368.864-2.957-.726-2.094-2.095a1.52 1.52 0 0 0-.949-2.293c-1.579-.356-1.579-2.606 0-2.962a1.52 1.52 0 0 0 .95-2.292c-.864-1.369.725-2.96 2.093-2.096.887.56 2.061.074 2.292-.95m1.48 3.474a3.343 3.343 0 1 0 .002 6.687 3.343 3.343 0 0 0-.002-6.687"/>',
    ),
    'volume-high': svg(
        '<path d="M15.6 3.3c-.4-.4-1-.4-1.4 0s-.4 1 0 1.4C15.4 5.9 16 7.4 16 9s-.6 3.1-1.8 4.3c-.4.4-.4 1 0 1.4.2.2.5.3.7.3.3 0 .5-.1.7-.3C17.1 13.2 18 11.2 18 9s-.9-4.2-2.4-5.7"/><path d="M.714 6.008h3.072l4.071-3.857c.5-.376 1.143 0 1.143.601V15.28c0 .602-.643.903-1.143.602l-4.071-3.858H.714c-.428 0-.714-.3-.714-.752V6.76c0-.451.286-.752.714-.752m10.568.59a.91.91 0 0 1 0-1.316.91.91 0 0 1 1.316 0c1.203 1.203 1.47 2.216 1.522 3.208q.012.255.011.51c0 1.16-.358 2.733-1.533 3.803a.7.7 0 0 1-.298.156c-.382.106-.873-.011-1.018-.156a.91.91 0 0 1 0-1.316c.57-.57.995-1.551.995-2.487 0-.944-.26-1.667-.995-2.402"/>',
    ),
    'volume-low': svg(
        '<path d="M.714 6.008h3.072l4.071-3.857c.5-.376 1.143 0 1.143.601V15.28c0 .602-.643.903-1.143.602l-4.071-3.858H.714c-.428 0-.714-.3-.714-.752V6.76c0-.451.286-.752.714-.752m10.568.59a.91.91 0 0 1 0-1.316.91.91 0 0 1 1.316 0c1.203 1.203 1.47 2.216 1.522 3.208q.012.255.011.51c0 1.16-.358 2.733-1.533 3.803a.7.7 0 0 1-.298.156c-.382.106-.873-.011-1.018-.156a.91.91 0 0 1 0-1.316c.57-.57.995-1.551.995-2.487 0-.944-.26-1.667-.995-2.402"/>',
    ),
    check: svg('<path d="m3.2 9.6 3.8 3.8 7.8-8.2" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>', 'none'),
    'more-vertical': svg('<circle cx="9" cy="3.6" r="1.6"/><circle cx="9" cy="9" r="1.6"/><circle cx="9" cy="14.4" r="1.6"/>'),
};

export type IconName = keyof typeof ICONS;

export function icon(name: IconName, className = 'vp-i'): SVGElement {
    const tpl = document.createElement('template');
    tpl.innerHTML = ICONS[name] ?? '';
    const el = tpl.content.firstElementChild;
    if (!el) throw new Error(`Unknown icon: ${name}`);
    el.setAttribute('class', className);
    return el as SVGElement;
}

export const setIcon = (button: HTMLElement, name: IconName): void => button.replaceChildren(icon(name));
