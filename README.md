# player-sdk

Thư viện video player viết bằng TypeScript, không phụ thuộc framework. Phát **MP4** và **HLS** (hỗ trợ byte range ở cả hai), tự dựng toàn bộ thanh điều khiển bên trong một phần tử bạn chỉ định.

## Tính năng

- MP4 (file thường) và HLS (`.m3u8`, dùng hls.js, tự lùi về HLS gốc của trình duyệt khi cần).
- Byte range: HTTP `Range` cho MP4, `#EXT-X-BYTERANGE` cho HLS, không cần cấu hình thêm.
- Menu cài đặt: chất lượng (Auto hoặc ghim một mức), tốc độ phát, phụ đề.
- Phụ đề ngoài `.vtt` / `.srt` (tự đổi SRT sang WebVTT) cộng với track phụ đề có sẵn trong manifest HLS.
- Gửi `Authorization: Bearer <token>` cho các request của player (playlist, segment, key, phụ đề, và cả MP4 nếu dùng service worker).
- Tỉ lệ khung hình tùy chỉnh (`16:9`, `9:16`, `4:5`, ...), hoặc tự theo hình dạng video.
- Giao diện co giãn theo chiều rộng của chính player (không phải của cửa sổ): các nút lần lượt chuyển lên góc khi player hẹp dần.
- Chế độ `simple` gần như không có gì trên hình, kiểu kính mờ (`glass`), chỉnh cỡ icon (`iconSize`).
- AirPlay, Picture in Picture, toàn màn hình (đều là tùy chọn).
- Phím tắt, dịch toàn bộ chữ trên giao diện, trỏ CSS để đổi giao diện.

## Cài đặt

Thư viện không được publish lên npm. Có hai cách dùng:

**Cài từ GitHub bằng bun:**

```bash
bun add github:nhlis/player-sdk
```

Package có tên `player-sdk` (theo `package.json`) nên trong code import là `player-sdk`. `hls.js` là dependency và được cài kèm; chỉ phát MP4 thì thư viện không nạp hls.js, nó chỉ được nạp khi gặp nguồn HLS.

**Nạp qua jsDelivr (không cần bundler):**

```
https://cdn.jsdelivr.net/gh/nhlis/player-sdk@main/dist/index.js
https://cdn.jsdelivr.net/gh/nhlis/player-sdk@main/dist/style.css
```

`@main` luôn là nhánh mới nhất và có thể bị jsDelivr cache. Muốn ổn định hãy ghim vào một tag hoặc mã commit, ví dụ `@v1.0.0`. Xem ví dụ đầy đủ ở mục [Dùng qua CDN](#dùng-qua-cdn-không-cần-bundler).

## Bắt đầu nhanh

```ts
import { Player } from 'player-sdk';
import 'player-sdk/style.css';

const player = new Player('#video', {
    src: 'https://example.com/video.m3u8',
    subtitles: [{ url: '/sub/en.vtt', lang: 'en', label: 'English' }],
    thumbnail: '/poster.jpg',
    fullscreen: true,
    pip: true,
    keyboard: true,
});
```

```html
<div id="video"></div>
```

- Tham số đầu tiên là phần tử hoặc selector sẽ chứa player. Không tìm thấy thì constructor ném lỗi.
- Phải import `player-sdk/style.css`, nếu không player không có giao diện. Với TypeScript 6+, file `style.d.ts` đi kèm giúp `import 'player-sdk/style.css'` không báo lỗi TS2882.
- Mọi style nằm trong `.vp`, không ảnh hưởng trang chứa nó.

### Dùng qua CDN (không cần bundler)

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/nhlis/player-sdk@main/dist/style.css" />
<script src="https://cdn.jsdelivr.net/npm/hls.js@1"></script>

<div id="video"></div>

<script type="module">
    import { Player } from 'https://cdn.jsdelivr.net/gh/nhlis/player-sdk@main/dist/index.js';

    new Player('#video', { src: 'https://example.com/video.m3u8', fullscreen: true });
</script>
```

`dist/index.js` giữ nguyên `import 'hls.js'` (không đóng gói sẵn hls.js), mà trình duyệt không phân giải được tên trần này nếu không có import map. Vì vậy hãy nạp hls.js bằng thẻ `<script>` như trên để có biến toàn cục `Hls`, thư viện sẽ ưu tiên dùng nó. Thiếu hls.js thì Chrome và Firefox không phát được HLS, còn Safari rơi về HLS gốc (không có menu chất lượng). Phát MP4 không cần hls.js.

## Tùy chọn (`PlayerOptions`)

| Tùy chọn        | Kiểu                                                          | Mặc định     | Mô tả                                                                                                                                                |
| --------------- | ------------------------------------------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src`           | `string`                                                      |              | URL của MP4 hoặc playlist HLS.                                                                                                                       |
| `type`          | `'auto' \| 'mp4' \| 'hls'`                                    | `'auto'`     | `auto` đoán theo đuôi: `.m3u8` là HLS, còn lại là MP4. Đặt `'hls'` nếu URL playlist không có `.m3u8`. `.mpd` (DASH) không được hỗ trợ và sẽ ném lỗi. |
| `subtitles`     | `SubtitleSource[]`                                            |              | Phụ đề ngoài `{ url, lang?, label? }`.                                                                                                               |
| `thumbnail`     | `string`                                                      |              | Ảnh hiển thị đến khi video phát (`poster` của `<video>`).                                                                                            |
| `aspectRatio`   | `'w:h'` hoặc `'w/h'`                                          | theo video   | Tỉ lệ khung. Giá trị không hợp lệ sẽ ném lỗi.                                                                                                        |
| `autoplay`      | `boolean`                                                     | `false`      | Trình duyệt chỉ cho phép khi video tắt tiếng.                                                                                                        |
| `muted`         | `boolean`                                                     | `false`      |                                                                                                                                                      |
| `loop`          | `boolean`                                                     | `false`      |                                                                                                                                                      |
| `preload`       | `'none' \| 'metadata' \| 'auto'`                              | `'metadata'` |                                                                                                                                                      |
| `hls`           | `Partial<HlsConfig>`                                          |              | Cấu hình hls.js thêm vào, gộp đè lên `{ capLevelToPlayerSize: true }`.                                                                               |
| `bearerToken`   | `string \| () => string \| null \| undefined \| Promise<...>` |              | Xem mục [Xác thực](#xác-thực-bearer-token).                                                                                                          |
| `bearerOrigins` | `string[] \| '*'`                                             |              | Các origin khác origin của `src` được nhận token.                                                                                                    |
| `bearerWorker`  | `string`                                                      |              | URL của `player-sdk-sw.js` để token đến được request của MP4.                                                                                        |
| `labels`        | `Partial<Labels>`                                             |              | Dịch chữ trên giao diện.                                                                                                                             |
| `keyboard`      | `boolean`                                                     | `false`      | Bật phím tắt.                                                                                                                                        |
| `visible`       | `boolean`                                                     | `false`      | `true`: thanh điều khiển luôn hiện.                                                                                                                  |
| `hideDelay`     | `number` (giây)                                               |              | Thời gian ẩn thanh điều khiển sau khi chuột rời player. `0` là ẩn ngay. Chỉ áp dụng khi video đang phát.                                             |
| `glass`         | `boolean`                                                     | `false`      | Hiệu ứng kính mờ cho thanh điều khiển.                                                                                                               |
| `iconSize`      | `number` (px)                                                 | `20`         | Cỡ icon, giới hạn trong 12 đến 40. Mọi thứ xung quanh tỉ lệ theo.                                                                                    |
| `simple`        | `boolean`                                                     | `false`      | Player tối giản (xem bên dưới).                                                                                                                      |
| `airplay`       | `boolean`                                                     | `false`      | Nút AirPlay. Chỉ hiện khi Safari tìm thấy thiết bị.                                                                                                  |
| `pip`           | `boolean`                                                     | `false`      | Nút Picture in Picture. Chỉ hiện khi trình duyệt hỗ trợ.                                                                                             |
| `fullscreen`    | `boolean`                                                     | `false`      | Nút toàn màn hình (phím `f` cũng cần tùy chọn này).                                                                                                  |

Các tùy chọn sai kiểu (`aspectRatio`, `iconSize`, `hideDelay`, `type`) ném `Error` ngay lúc tạo player, trước khi có gì được thêm vào trang.

## API

```ts
player.root; // phần tử .vp
player.video; // <video> bên trong: mọi sự kiện media (play, timeupdate, ...) nằm ở đây
```

| Phương thức                        | Mô tả                                                                                                                                   |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `load(src, { type?, subtitles? })` | Phát nguồn khác. Bỏ nguồn cũ cùng quality và phụ đề của nó. Phụ đề thuộc về nguồn: nguồn nạp không kèm `subtitles` thì không có phụ đề. |
| `play()`                           | Trả về Promise, bị từ chối nếu trình duyệt chặn (chính sách autoplay).                                                                  |
| `pause()`                          |                                                                                                                                         |
| `togglePlay()`                     |                                                                                                                                         |
| `toggleFullscreen()`               | Chạy được dù tùy chọn `fullscreen` là gì. Trên iPhone dùng player toàn màn hình của hệ thống.                                           |
| `setAspectRatio(ratio?)`           | Đổi tỉ lệ. Không truyền gì: khung theo video trở lại.                                                                                   |
| `setGlass(on = true)`              | Bật hoặc tắt kính mờ.                                                                                                                   |
| `setIconSize(px?)`                 | Đổi cỡ icon. Không truyền gì: về mặc định.                                                                                              |
| `setSimple(on = true)`             | Bật hoặc tắt chế độ simple.                                                                                                             |
| `showError(message)`               | Hiện thông báo lỗi trên video và bắn sự kiện `error`. `load()` kế tiếp sẽ xóa nó.                                                       |
| `on(type, fn)` / `off(type, fn)`   | Đăng ký hoặc hủy sự kiện.                                                                                                               |
| `destroy()`                        | Dừng phát, gỡ mọi listener và phần DOM đã tạo. Không dùng lại instance sau đó.                                                          |

### Sự kiện

```ts
player.on('load', ({ src, type, engine }) => {
    // type: 'mp4' | 'hls'
    // engine: 'mp4' | 'hls' | 'hls-native' | 'none'
});

player.on('error', ({ message }) => console.error(message));
```

Chỉ có hai sự kiện này. Các sự kiện còn lại (`play`, `pause`, `timeupdate`, ...) lắng nghe trực tiếp trên `player.video`.

### Export khác

```ts
import { Player, detectType, ICONS, LABELS } from 'player-sdk';
import type {
    PlayerOptions,
    LoadOptions,
    PlayerEventMap,
    SourceType,
    EngineKind,
    EngineName,
    AspectRatio,
    IconName,
    Labels,
    SubtitleSource,
    BearerToken,
} from 'player-sdk';
```

`detectType(src, type?)` trả về `'mp4'` hoặc `'hls'` giống cách player chọn engine.

## MP4 và HLS

- **MP4**: trình duyệt tự gửi các request `Range` cho mỗi lần tua, nên server phải trả `206 Partial Content` thì tua mới hoạt động. Thanh tua của MP4 chỉ tua một lần khi thả chuột (một request cho mỗi lần kéo).
- **HLS**: dùng hls.js (ưu tiên cả trên Safari để menu chất lượng chạy ở mọi nơi), HLS gốc của trình duyệt chỉ là phương án dự phòng. Playlist dạng byterange là HLS bình thường với hls.js và Safari. Thanh tua của HLS tua ngay trong lúc kéo.
- iPhone từ iOS 17.1 chạy hls.js được (nhờ ManagedMediaSource). iPhone cũ hơn, hoặc khi người dùng tắt ManagedMediaSource, sẽ dùng HLS gốc.
- Lỗi mạng của HLS được thử lại tối đa 3 lần với thời gian chờ tăng dần. 404 không bao giờ được thử lại.

## Phụ đề

```ts
player.load('/video.mp4', {
    subtitles: [
        { url: '/sub/vi.vtt', lang: 'vi', label: 'Tiếng Việt' },
        { url: '/sub/en.srt', lang: 'en', label: 'English' },
    ],
});
```

- Hỗ trợ `.vtt` và `.srt`. SRT được đổi sang WebVTT trên trình duyệt, chỉ sửa dòng thời gian.
- File phụ đề lỗi bị bỏ qua, không làm dừng video.
- Với HLS, track phụ đề trong manifest hiện trước, rồi đến các file ngoài.
- Phụ đề được player tự vẽ ở phía trên thanh điều khiển (không bị che), qua DOM chứ không qua `innerHTML`. Các thiết lập trong file `.vtt` (`line`, `position`, `size`, `align`, `vertical`) không được áp dụng: mọi dòng đều căn giữa ở dưới. Khi ở Picture in Picture hoặc player toàn màn hình của iPhone thì dùng cách vẽ của trình duyệt.

## Tỉ lệ khung hình

```ts
new Player('#v', { src, aspectRatio: '9:16' });
player.setAspectRatio('4:5');
player.setAspectRatio(); // theo video
```

- Khung chỉ là cái hộp: video khác hình dạng sẽ được letterbox bên trong (`object-fit: contain`).
- Không đặt `aspectRatio`: khung là 16:9 cho đến khi biết kích thước video, sau đó theo hình dạng video (giới hạn từ 1:3 đến 3.6:1) và đổi lại khi nguồn khác hình dạng. Để giữ chỗ ngay từ đầu, hãy đặt tỉ lệ.
- Player dọc (cao hơn rộng) có chiều cao tối đa là `--vp-max-height` (mặc định `100dvh`), được căn giữa trong container rộng.
- `--vp-height` (chiều cao cố định) luôn thắng tỉ lệ.

## Giao diện

### Bố cục co giãn

Bố cục theo chiều rộng của chính player. Với icon 20px, các nút lần lượt rời thanh dưới lên góc khi hẹp dần:

| Chiều rộng | Thay đổi                                                                                                                                       |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| ≤ 760px    | AirPlay lên góc phải trên                                                                                                                      |
| ≤ 720px    | Picture in Picture lên cùng AirPlay                                                                                                            |
| ≤ 680px    | Âm lượng lên góc trái trên                                                                                                                     |
| ≤ 640px    | Toàn màn hình lên cùng nhóm bên phải, phụ đề nhỏ lại                                                                                           |
| ≤ 380px    | Nút phát ở thanh dưới biến mất (nhấp vào video để phát/dừng), cài đặt thành ba chấm ở góc phải trên, AirPlay/PiP/toàn màn hình chuyển vào menu |
| ≤ 340px    | Công tắc phụ đề cũng lên góc trên                                                                                                              |

Các mốc rộng thay đổi theo `iconSize`: icon nhỏ ở lại thanh dưới lâu hơn.

### Chế độ `simple`

Gần như không có gì trên hình: thanh tua là một đường mỏng ở mép dưới (dày lên khi trỏ chuột), thời gian chỉ hiện khi tua, nút phát ở giữa chỉ hiện chớp nhoáng sau khi bấm phát/dừng. Âm lượng ở góc trái trên, mọi thứ còn lại (cài đặt, AirPlay, PiP, toàn màn hình) nằm sau ba chấm ở góc phải trên. Có phụ đề thì có thêm công tắc bên trái ba chấm.

### Biến CSS

Đặt trên `.vp` hoặc bất kỳ phần tử cha nào:

| Biến              | Ý nghĩa                                                  | Mặc định                  |
| ----------------- | -------------------------------------------------------- | ------------------------- |
| `--vp-radius`     | Bo góc player (và popup, hover icon khi không có kính)   | `12px`                    |
| `--vp-aspect`     | Tỉ lệ khung. Đặt biến này thì tỉ lệ cố định              | `16 / 9`                  |
| `--vp-height`     | Chiều cao cố định thay cho tỉ lệ (ví dụ `100%`, `100vh`) | `auto`                    |
| `--vp-max-height` | Chiều cao tối đa của player dọc                          | `100dvh`                  |
| `--vp-menu-bg`    | Màu nền popup cài đặt                                    | xám ấm trong suốt         |
| `--vp-pill-bg`    | Màu nền kính của thanh và các "viên thuốc"               | xám trung tính trong suốt |
| `--vp-icon-size`  | Cỡ icon, độ dài hợp lệ, giới hạn 12px đến 40px           | `20px`                    |

Các tùy chọn `aspectRatio` và `iconSize` đặt biến tương ứng trực tiếp trên player nên thắng stylesheet.

## Xác thực (Bearer token)

```ts
new Player('#v', {
    src: 'https://api.example.com/stream/master.m3u8',
    bearerToken: () => getAccessToken(), // có thể trả Promise, được gọi trước mỗi request
    bearerOrigins: ['https://cdn.example.com'], // CDN chứa segment
});
```

- Token được gửi cho mọi request do player tự gửi: playlist, segment, key của HLS (hls.js) và các file phụ đề ngoài.
- **Mặc định chỉ origin của `src` được nhận token**, để token không lọt sang bất kỳ host nào mà playlist nhắc tới. Dùng `bearerOrigins` để thêm origin, `'*'` cho mọi origin (cân nhắc kỹ).
- Request khác origin cần server cho phép header `Authorization` trong CORS (sẽ có preflight).
- Hàm token trả về `null`, `undefined` hoặc `''` thì request đó không có header.
- Token **không** được gửi ở những nơi trình duyệt tự tải URL mà JavaScript không thêm được header: HLS gốc (iPhone cũ, hoặc không nạp được hls.js), `thumbnail`, AirPlay, và MP4 (`<video src>`) nếu không có `bearerWorker`. Console sẽ cảnh báo. Với các trường hợp này hãy dùng signed URL hoặc cookie.

### MP4 với `bearerWorker`

Service worker có sẵn trong repo tại `service-worker/player-sdk-sw.js`. Hãy chép file này lên **cùng origin với trang của bạn** (service worker không nạp được từ origin khác nên không dùng link jsDelivr được), rồi đặt `bearerWorker` là URL của nó:

```ts
new Player('#v', {
    src: '/video.mp4',
    bearerToken: () => getAccessToken(),
    bearerWorker: '/player-sdk-sw.js',
});
```

Worker chặn các request `GET` của `<video>` và `<audio>`, thêm header `Authorization` cho request MP4 và mọi request `Range` khi tua, còn trình duyệt vẫn tự stream và tự tua.

- Cần HTTPS hoặc localhost. Player chờ tối đa 3 giây để worker nắm quyền điều khiển trang ở lần truy cập đầu, nên scope của worker phải bao phủ trang.
- Scope: worker chỉ thấy các trang nằm dưới đường dẫn chứa file của nó. File đặt ở `/player-sdk-sw.js` thấy cả site, đặt trong `/static/` thì chỉ thấy `/static/...`. Muốn scope rộng hơn cần header phản hồi `Service-Worker-Allowed`.
- Worker không lưu token. Trình duyệt tắt worker khi rảnh (tua sau vài phút sẽ thấy nó rỗng), nên với mỗi request worker hỏi chính trang đã gửi request: trang trả lời ngay `{ mine: boolean }`, rồi `{ token }` nếu là của nó (message `{ type: 'player-sdk:token', url }` kèm `MessagePort`).
- Trang không có player dùng token trong scope vẫn bị chờ tối đa 400ms ở mỗi `<video>`/`<audio>`; sau đó request đi tiếp không có token. Hàm `bearerToken` bất đồng bộ có tối đa 20 giây để trả token.
- Trình duyệt gửi request media ở chế độ `no-cors`, nơi không được phép có `Authorization`, nên worker gửi bản sao ở chế độ `cors` (giữ nguyên `Range` và các header khác, cookie chỉ gửi cho cùng origin). Server cần cho phép header `Authorization` trong phản hồi CORS nếu video ở origin khác.
- Nếu worker gặp lỗi, request vẫn đi tiếp không có token thay vì treo.
- Shift+Reload bỏ qua service worker, và player sẽ báo lỗi nếu worker không điều khiển được trang.

## Dịch giao diện

```ts
new Player('#v', {
    src,
    labels: { play: 'Phát', pause: 'Tạm dừng', quality: 'Chất lượng', speed: 'Tốc độ', captions: 'Phụ đề' },
});
```

Truyền một phần các khóa bất kỳ của `LABELS` (`player`, `play`, `pause`, `replay`, `mute`, `unmute`, `volume`, `seek`, `captions`, `settings`, `quality`, `speed`, `auto`, `off`, `on`, `back`, `fullscreen`, `exitFullscreen`, `pip`, `exitPip`, `airplay`, `live`, `level`, `track`, `subtitles`). Khóa không truyền giữ giá trị tiếng Anh mặc định.

## Phím tắt

Cần `keyboard: true`. Không có tác dụng khi đang gõ trong ô input hoặc khi giữ Ctrl/Alt/Meta.

| Phím         | Tác dụng                                  |
| ------------ | ----------------------------------------- |
| `k`, `Space` | Phát / dừng                               |
| `f`          | Toàn màn hình (cần tùy chọn `fullscreen`) |
| `m`          | Tắt / bật tiếng                           |
| `←` / `→`    | Lùi / tiến 5 giây                         |

`Esc` luôn đóng menu cài đặt khi menu đang mở, kể cả khi không bật `keyboard`. Trong menu, dùng `↑ ↓ Home End` để di chuyển, `→` để vào mục, `←` để quay lại.

## Phát triển

```bash
bun install
bun run typecheck   # tsc --noEmit
bun run build       # dist/index.js, dist/style.css, dist/style.d.ts, các file .d.ts
bun run dev         # esbuild serve demo/ tại http://127.0.0.1:8080
bun run format      # prettier
```

(Dùng `npm run ...` cũng được.) Thư mục `dist/` được commit sẵn trong repo để `bun add` từ GitHub và jsDelivr dùng được: chạy `bun run build` rồi commit `dist/` trước khi push.

`npm run build` gồm: xóa `dist`, đóng gói ESM bằng esbuild (giữ `hls.js` là dependency ngoài), chép `src/player.css` thành `dist/style.css` kèm `style.d.ts`, và sinh khai báo kiểu bằng `tsc`.

## Ghi chú trình duyệt

- AirPlay chỉ có trên Safari. Picture in Picture chỉ hiện khi trình duyệt hỗ trợ.
- Chuột phải trên player không mở menu của trình duyệt (tránh các mục như lưu video, copy địa chỉ).
- Hiệu ứng kính dùng `backdrop-filter`. Trình duyệt không hỗ trợ sẽ thấy nền trong suốt không nhòe.
- Người dùng bật `prefers-reduced-motion: reduce` sẽ không thấy animation và transition của player.
