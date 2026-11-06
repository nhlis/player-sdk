export type BearerToken = string | (() => string | null | undefined | Promise<string | null | undefined>);
type Maybe<T> = T | Promise<T>;
export interface Auth {
    token(url: string): Maybe<string | undefined>;
}
export declare const isPromise: <T>(value: Maybe<T>) => value is Promise<T>;
export declare function createAuth(token: BearerToken | undefined, origins: string[] | '*' | undefined, src: string): Auth | undefined;
export declare function withToken(auth: Auth, url: string, use: (token: string) => void): void | Promise<void>;
export declare function authFetch(auth: Auth | undefined, url: string, init?: RequestInit): Promise<Response>;
export {};
