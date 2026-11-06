export type AspectRatio = `${number}:${number}` | `${number}/${number}`;

export interface AspectRatioShape {
    w: number;
    h: number;
}

const RATIO = /^\s*(\d+(?:\.\d+)?)\s*[:/]\s*(\d+(?:\.\d+)?)\s*$/;

export function parseAspectRatio(aspectRatio: AspectRatio): AspectRatioShape {
    const match = typeof aspectRatio === 'string' ? RATIO.exec(aspectRatio) : null;
    const w = Number(match?.[1]);
    const h = Number(match?.[2]);
    if (w > 0 && h > 0) return { w, h };
    throw new Error(`Unknown aspect ratio "${String(aspectRatio)}". Use a ratio as 'width:height', such as '16:9' or '9:16'.`);
}
