const ACK_MS = 400;
const TOKEN_MS = 20000;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

function ask(client, url) {
    return new Promise((resolve) => {
        const { port1, port2 } = new MessageChannel();
        let acked = false;
        let timer = setTimeout(() => finish(null), ACK_MS);
        function finish(token) {
            clearTimeout(timer);
            port1.close();
            resolve(token);
        }
        port1.onmessage = ({ data }) => {
            clearTimeout(timer);
            if (!acked) {
                acked = true;
                if (!data.mine) return finish(null);
                timer = setTimeout(() => finish(null), TOKEN_MS);
                return;
            }
            finish(data.token || null);
        };
        client.postMessage({ type: 'player-sdk-sw:token', url }, [port2]);
    });
}

async function withBearer(event) {
    const { request } = event;
    try {
        const clients = event.clientId ? [await self.clients.get(event.clientId)] : await self.clients.matchAll({ type: 'window' });
        for (const client of clients) {
            const token = client && (await ask(client, request.url));
            if (!token) continue;
            // The browser sends media requests in no-cors mode, where Authorization is not allowed: the copy is a cors request.
            // Range and the rest of the headers are copied. Cookies only for the same origin, as fetch() does by default.
            const headers = new Headers(request.headers);
            headers.set('Authorization', 'Bearer ' + token);
            return await fetch(new Request(request, { headers, mode: 'cors', credentials: 'same-origin' }));
        }
    } catch (error) {
        // fall through: a request without the token is better than a request that never answers
    }
    return fetch(request);
}

self.addEventListener('fetch', (event) => {
    const { request } = event;
    if (request.method !== 'GET' || (request.destination !== 'video' && request.destination !== 'audio')) return;
    event.respondWith(withBearer(event));
});
