import type { Auth } from './auth.js';

const CONTROL_MS = 3000;

const sources = new Map<string, Auth>();
let listening = false;

const keyOf = (src: string): string => {
    const url = new URL(src, location.href);
    url.hash = '';
    return url.href;
};

function listen(): void {
    if (listening) return;
    listening = true;
    navigator.serviceWorker.addEventListener('message', (e) => {
        const { type, url } = (e.data ?? {}) as { type?: string; url?: string };
        const port = e.ports[0];
        if (type !== 'player-sdk-sw:token' || typeof url !== 'string' || !port) return;
        const auth = sources.get(url);
        port.postMessage({ mine: !!auth });
        if (!auth) return;
        const reply = (token: string | null) => port.postMessage({ token });
        Promise.resolve(auth.token(url)).then(
            (token) => reply(token || null),
            () => reply(null),
        );
    });
}

export async function claimWorker(script: string, src: string, auth: Auth): Promise<() => void> {
    if (!('serviceWorker' in navigator)) {
        throw new Error('The bearer token of an MP4 needs a service worker, and this page cannot use one (they need HTTPS or localhost).');
    }
    const { serviceWorker } = navigator;
    const registration = await serviceWorker.register(script).catch((error: unknown) => {
        throw new Error(`Could not register the service worker "${script}" (${error instanceof Error ? error.message : String(error)}).`);
    });
    const worker = registration.installing ?? registration.waiting ?? registration.active;
    if (worker && worker.state !== 'activated') {
        await new Promise<void>((resolve, reject) => {
            worker.addEventListener('statechange', () => {
                if (worker.state === 'activated') resolve();
                else if (worker.state === 'redundant') reject(new Error('The service worker could not be installed.'));
            });
        });
    }
    if (!serviceWorker.controller) {
        await new Promise<void>((resolve, reject) => {
            const timer = setTimeout(
                () =>
                    reject(
                        new Error(
                            'The service worker does not control this page. Its scope has to cover the page (serve the file from a path above it, or with a Service-Worker-Allowed header), and a forced reload (Shift+reload) skips service workers.',
                        ),
                    ),
                CONTROL_MS,
            );
            serviceWorker.addEventListener(
                'controllerchange',
                () => {
                    clearTimeout(timer);
                    resolve();
                },
                { once: true },
            );
        });
    }
    const key = keyOf(src);
    sources.set(key, auth);
    listen();
    return () => {
        if (sources.get(key) === auth) sources.delete(key);
    };
}
