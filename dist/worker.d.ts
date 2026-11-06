import type { Auth } from './auth.js';
export declare function claimWorker(script: string, src: string, auth: Auth): Promise<() => void>;
