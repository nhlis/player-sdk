export type BearerToken = string | (() => string | null | undefined | Promise<string | null | undefined>);

type Maybe<T> = T | Promise<T>;

export interface Auth {
    token(url: string): Maybe<string | undefined>;
}

export const isPromise = <T>(value: Maybe<T>): value is Promise<T> => typeof (value as { then?: unknown } | null | undefined)?.then === 'function';

export function createAuth(token: BearerToken | undefined, origins: string[] | '*' | undefined, src: string): Auth | undefined {
    if (!token) return undefined;
    const originOf = (url: string): string => {
        try {
            return new URL(url, location.href).origin;
        } catch {
            return '';
        }
    };
    const allowed = origins === '*' ? null : new Set([src, ...(origins ?? [])].map(originOf));
    return {
        token(url) {
            if (allowed && !allowed.has(originOf(url))) return undefined;
            const value = typeof token === 'function' ? token() : token;
            return isPromise(value) ? value.then((v) => v || undefined) : value || undefined;
        },
    };
}

export function withToken(auth: Auth, url: string, use: (token: string) => void): void | Promise<void> {
    const token = auth.token(url);
    if (isPromise(token)) {
        return token.then((value) => {
            if (value) use(value);
        });
    }
    if (token) use(token);
}

export async function authFetch(auth: Auth | undefined, url: string, init: RequestInit = {}): Promise<Response> {
    const token = await auth?.token(url);
    if (!token) return fetch(url, init);
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${token}`);
    return fetch(url, { ...init, headers });
}
