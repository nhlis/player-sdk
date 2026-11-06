export type AspectRatio = `${number}:${number}` | `${number}/${number}`;
export interface AspectRatioShape {
    w: number;
    h: number;
}
export declare function parseAspectRatio(aspectRatio: AspectRatio): AspectRatioShape;
