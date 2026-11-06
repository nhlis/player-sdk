// src/auth.ts
var isPromise = (value) => typeof value?.then === "function";
function createAuth(token, origins, src) {
  if (!token) return void 0;
  const originOf = (url) => {
    try {
      return new URL(url, location.href).origin;
    } catch {
      return "";
    }
  };
  const allowed = origins === "*" ? null : new Set([src, ...origins ?? []].map(originOf));
  return {
    token(url) {
      if (allowed && !allowed.has(originOf(url))) return void 0;
      const value = typeof token === "function" ? token() : token;
      return isPromise(value) ? value.then((v) => v || void 0) : value || void 0;
    }
  };
}
function withToken(auth, url, use) {
  const token = auth.token(url);
  if (isPromise(token)) {
    return token.then((value) => {
      if (value) use(value);
    });
  }
  if (token) use(token);
}
async function authFetch(auth, url, init = {}) {
  const token = await auth?.token(url);
  if (!token) return fetch(url, init);
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  return fetch(url, { ...init, headers });
}

// src/utils.ts
var LABELS = {
  player: "Video player",
  play: "Play",
  pause: "Pause",
  replay: "Replay",
  mute: "Mute",
  unmute: "Unmute",
  volume: "Volume",
  seek: "Seek",
  captions: "Captions",
  settings: "Settings",
  quality: "Quality",
  speed: "Speed",
  auto: "Auto",
  off: "Off",
  on: "On",
  back: "Back",
  fullscreen: "Fullscreen",
  exitFullscreen: "Exit fullscreen",
  pip: "Picture in picture",
  exitPip: "Exit picture in picture",
  airplay: "AirPlay",
  live: "LIVE",
  level: "Level",
  track: "Track",
  subtitles: "Subtitles"
};
function formatTime(seconds) {
  const s = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  const h2 = Math.floor(s / 3600);
  const m = Math.floor(s % 3600 / 60);
  const x = String(s % 60).padStart(2, "0");
  return h2 ? `${h2}:${String(m).padStart(2, "0")}:${x}` : `${m}:${x}`;
}
function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [name, value] of Object.entries(props ?? {})) {
    if (value != null && value !== false) el.setAttribute(name, value === true ? "" : String(value));
  }
  el.append(...children.flat().filter((c) => c != null && c !== false));
  return el;
}

// src/captions.ts
function toVtt(text) {
  const t = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  if (/^WEBVTT/.test(t)) return t;
  return "WEBVTT\n\n" + t.replace(/^.*-->.*$/gm, (line) => line.replace(/(\d{1,2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2"));
}
var Captions = class {
  constructor(video, getEngine, t) {
    this.els = [];
    this.video = video;
    this.getEngine = getEngine;
    this.t = t;
  }
  async load(specs, alive, auth) {
    const texts = await Promise.all(
      specs.map(
        (s) => authFetch(auth, s.url).then((res) => res.ok ? res.text() : null).catch(() => null)
      )
    );
    if (!alive()) return;
    specs.forEach((s, i) => {
      const text = texts[i];
      if (text == null) return;
      const el = document.createElement("track");
      el.kind = "subtitles";
      el.label = s.label || s.lang || this.t.subtitles;
      el.srclang = s.lang || "";
      el.src = URL.createObjectURL(new Blob([toVtt(text)], { type: "text/vtt" }));
      this.video.appendChild(el);
      el.track.mode = "disabled";
      this.els.push(el);
    });
  }
  reset() {
    for (const el of this.els) {
      URL.revokeObjectURL(el.src);
      el.remove();
    }
    this.els = [];
  }
  native() {
    return Array.from(this.video.textTracks).filter((t) => /subtitles|captions/.test(t.kind));
  }
  external() {
    return this.els.map((el) => el.track);
  }
  managedCount() {
    const engine = this.getEngine();
    return engine.managed ? engine.texts().length : 0;
  }
  name(label, i) {
    return label || `${this.t.track} ${i + 1}`;
  }
  list() {
    const engine = this.getEngine();
    if (!engine.managed) return this.native().map((t, i) => ({ index: i, label: this.name(t.label || t.language, i) }));
    const managed = engine.texts().map((t, i) => ({ index: i, label: this.name(t.label, i) }));
    return [...managed, ...this.external().map((t, k) => ({ index: managed.length + k, label: t.label }))];
  }
  index() {
    const engine = this.getEngine();
    if (!engine.managed) return this.native().findIndex((t) => t.mode === "showing");
    if (engine.textIndex() >= 0) return engine.textIndex();
    const k = this.external().findIndex((t) => t.mode === "showing");
    return k < 0 ? -1 : this.managedCount() + k;
  }
  shown() {
    return this.native().filter((t) => t.mode === "showing");
  }
  set(i) {
    const engine = this.getEngine();
    if (!engine.managed) {
      this.native().forEach((t, k) => {
        t.mode = k === i ? "showing" : "disabled";
      });
      return;
    }
    const managed = this.managedCount();
    engine.setText(i >= 0 && i < managed ? i : -1);
    this.external().forEach((t, k) => {
      t.mode = i - managed === k ? "showing" : "disabled";
    });
  }
  label() {
    const i = this.index();
    return i < 0 ? this.t.off : this.list().find((c) => c.index === i)?.label || this.t.on;
  }
};
function cueNode(cue) {
  return cue.getCueAsHTML?.() ?? document.createTextNode(cue.text ?? "");
}
var CueLayer = class {
  constructor(video, layer, captions, signal) {
    this.drawn = "";
    this.video = video;
    this.layer = layer;
    this.captions = captions;
    const watched = /* @__PURE__ */ new WeakSet();
    const sync = () => {
      for (const track of Array.from(video.textTracks)) {
        if (watched.has(track)) continue;
        watched.add(track);
        track.addEventListener("cuechange", () => this.render(), { signal });
      }
      this.render();
    };
    for (const type of ["addtrack", "removetrack", "change"]) video.textTracks.addEventListener(type, sync, { signal });
    const recheck = () => this.render();
    for (const type of ["timeupdate", "seeked", "playing", "emptied"]) video.addEventListener(type, recheck, { signal });
    document.addEventListener("visibilitychange", recheck, { signal });
    sync();
  }
  render() {
    const { currentTime } = this.video;
    const cues = [];
    for (const track of this.captions.shown()) {
      for (const cue of Array.from(track.activeCues ?? [])) {
        if (cue.endTime > currentTime) cues.push(cue);
      }
    }
    const key = cues.map((cue) => `${cue.startTime}|${cue.endTime}|${cue.text ?? ""}`).join("\n");
    if (key === this.drawn) return;
    this.drawn = key;
    const lines = [];
    for (const cue of cues) {
      const text = h("span", { class: "vp-cue-t" }, cueNode(cue));
      if (text.textContent?.trim()) lines.push(h("div", { class: "vp-cue" }, text));
    }
    this.layer.replaceChildren(...lines);
  }
};

// src/worker.ts
var CONTROL_MS = 3e3;
var sources = /* @__PURE__ */ new Map();
var listening = false;
var keyOf = (src) => {
  const url = new URL(src, location.href);
  url.hash = "";
  return url.href;
};
function listen() {
  if (listening) return;
  listening = true;
  navigator.serviceWorker.addEventListener("message", (e) => {
    const { type, url } = e.data ?? {};
    const port = e.ports[0];
    if (type !== "player-sdk-sw:token" || typeof url !== "string" || !port) return;
    const auth = sources.get(url);
    port.postMessage({ mine: !!auth });
    if (!auth) return;
    const reply = (token) => port.postMessage({ token });
    Promise.resolve(auth.token(url)).then(
      (token) => reply(token || null),
      () => reply(null)
    );
  });
}
async function claimWorker(script, src, auth) {
  if (!("serviceWorker" in navigator)) {
    throw new Error("The bearer token of an MP4 needs a service worker, and this page cannot use one (they need HTTPS or localhost).");
  }
  const { serviceWorker } = navigator;
  const registration = await serviceWorker.register(script).catch((error) => {
    throw new Error(`Could not register the service worker "${script}" (${error instanceof Error ? error.message : String(error)}).`);
  });
  const worker = registration.installing ?? registration.waiting ?? registration.active;
  if (worker && worker.state !== "activated") {
    await new Promise((resolve, reject) => {
      worker.addEventListener("statechange", () => {
        if (worker.state === "activated") resolve();
        else if (worker.state === "redundant") reject(new Error("The service worker could not be installed."));
      });
    });
  }
  if (!serviceWorker.controller) {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(
          new Error(
            "The service worker does not control this page. Its scope has to cover the page (serve the file from a path above it, or with a Service-Worker-Allowed header), and a forced reload (Shift+reload) skips service workers."
          )
        ),
        CONTROL_MS
      );
      serviceWorker.addEventListener(
        "controllerchange",
        () => {
          clearTimeout(timer);
          resolve();
        },
        { once: true }
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

// src/engines.ts
var MAX_RETRIES = 3;
var RETRY_BACKOFF_MS = 700;
var NONE = {
  name: "none",
  liveSeek: false,
  levels: () => [],
  autoOn: () => true,
  levelId: () => -1,
  setLevel() {
  },
  current: () => void 0,
  managed: false,
  texts: () => [],
  textIndex: () => -1,
  setText() {
  },
  destroy() {
  }
};
var mbps = (bitsPerSecond) => (bitsPerSecond / 1e6).toFixed(1) + " Mbps";
function sortLevels(list) {
  const all = [...list].sort((a, b) => a.h - b.h || a.b - b.b);
  return all.map((o) => ({ ...o, dup: o.h > 0 && all.filter((x) => x.h === o.h).length > 1 }));
}
var levelText = ({ id, h: h2, b, dup }, word = "Level") => h2 ? `${h2}p${dup && b ? ` (${mbps(b)})` : ""}` : b ? mbps(b) : `${word} ${id + 1}`;
var playingText = (level) => level?.h ? `${level.h}p` : level?.b ? mbps(level.b) : "";
function detectType(src, type) {
  if (type === "mp4" || type === "hls") return type;
  if (type && type !== "auto") throw new Error(`Unknown source type "${String(type)}". Use 'mp4', 'hls' or 'auto'.`);
  if (/\.mpd(?:[?#]|$)/i.test(src)) throw new Error("DASH (.mpd) is not supported. Use MP4 or HLS.");
  return /\.m3u8(?:[?#]|$)/i.test(src) ? "hls" : "mp4";
}
async function createEngine(kind, video, src, ctx, hlsConfig) {
  return kind === "hls" ? hlsEngine(video, src, ctx, hlsConfig) : mp4Engine(video, src, ctx);
}
async function mp4Engine(video, src, ctx) {
  const { auth, worker, alive } = ctx;
  if (!auth || !worker) return nativeEngine("mp4", video, src, ctx);
  const release = await claimWorker(worker, src, auth);
  if (!alive()) {
    release();
    return NONE;
  }
  const engine = nativeEngine("mp4", video, src, ctx, true);
  return {
    ...engine,
    destroy() {
      engine.destroy();
      release();
    }
  };
}
function nativeEngine(name, video, src, { fatal, auth }, viaWorker = false) {
  if (auth && !viaWorker) {
    console.warn(
      `player-sdk: the bearerToken option is NOT sent for "${name}": the browser loads the URL itself and a <video> cannot add an Authorization header. ` + (name === "mp4" ? "Set the bearerWorker option (a service worker adds the header), or use a signed URL or a cookie." : "Use a signed URL or a cookie, or make hls.js play it (it was not used here: an iPhone before iOS 17.1, or hls.js could not be loaded).")
    );
  }
  const onError = async () => {
    const res = await (viaWorker ? authFetch(auth, src, { method: "HEAD" }) : fetch(src, { method: "HEAD" })).catch(() => null);
    const status = res?.status;
    fatal(
      status === 404 ? "Video not found (404)." : status === 401 || status === 403 ? `Access denied (${status}).${auth && !viaWorker ? " The bearer token is not sent for a video the browser loads itself." : ""}` : `Cannot play this video (${video.error?.message || `error code ${video.error?.code ?? "unknown"}`})`
    );
  };
  video.addEventListener("error", onError);
  video.src = src;
  return {
    ...NONE,
    name,
    destroy: () => video.removeEventListener("error", onError)
  };
}
async function loadHls() {
  const global = globalThis.Hls;
  if (typeof global?.isSupported === "function") return global;
  const mod = await import("hls.js").catch((error) => {
    console.warn('player-sdk: could not load hls.js (add a <script> tag for it, or bundle the "hls.js" package)', error);
    return null;
  });
  return mod?.default;
}
function authHooks(config, auth) {
  if (!auth) return config;
  const { xhrSetup, fetchSetup } = config;
  return {
    ...config,
    xhrSetup: (xhr, url, context) => {
      const own = xhrSetup?.(xhr, url, context);
      const add = () => {
        if (!xhr.readyState) xhr.open("GET", url, true);
        return withToken(auth, url, (token) => xhr.setRequestHeader("Authorization", `Bearer ${token}`));
      };
      return isPromise(own) ? own.then(add) : add();
    },
    fetchSetup: (context, init) => {
      const own = fetchSetup ? fetchSetup(context, init) : new Request(context.url, init);
      const add = (request) => {
        let out = request;
        const done = withToken(auth, context.url, (token) => {
          const headers = new Headers(request.headers);
          headers.set("Authorization", `Bearer ${token}`);
          out = new Request(request, { headers });
        });
        return isPromise(done) ? done.then(() => out) : out;
      };
      return isPromise(own) ? own.then(add) : add(own);
    }
  };
}
async function hlsEngine(video, src, ctx, config) {
  const { refresh, fatal, alive } = ctx;
  const Hls = await loadHls();
  if (!alive()) return NONE;
  if (!Hls?.isSupported()) {
    if (!video.canPlayType("application/vnd.apple.mpegurl"))
      throw new Error(Hls ? "This browser cannot play HLS streams." : "Could not load the player library (hls.js).");
    return nativeEngine("hls-native", video, src, ctx);
  }
  let retries = 0;
  let dead = false;
  let airplaySource;
  const hls = new Hls(authHooks({ capLevelToPlayerSize: true, ...config }, ctx.auth));
  hls.loadSource(src);
  hls.attachMedia(video);
  if ("WebKitPlaybackTargetAvailabilityEvent" in window) {
    video.disableRemotePlayback = false;
    airplaySource = document.createElement("source");
    airplaySource.src = src;
    airplaySource.type = "application/x-mpegURL";
    video.appendChild(airplaySource);
  }
  const E = Hls.Events;
  for (const event of [E.MANIFEST_PARSED, E.LEVEL_SWITCHED, E.SUBTITLE_TRACKS_UPDATED, E.SUBTITLE_TRACK_SWITCH]) hls.on(event, refresh);
  hls.on(E.FRAG_LOADED, () => {
    retries = 0;
  });
  hls.on(E.ERROR, (_, d) => {
    if (!d.fatal) return;
    const notFound = d.response?.code === 404;
    const denied = d.response?.code === 401 || d.response?.code === 403;
    if (d.details === Hls.ErrorDetails.MANIFEST_INCOMPATIBLE_CODECS_ERROR) {
      fatal("This browser cannot play the codecs of this stream.");
    } else if (d.type === Hls.ErrorTypes.NETWORK_ERROR && !notFound && retries++ < MAX_RETRIES) {
      const playlist = d.details === Hls.ErrorDetails.MANIFEST_LOAD_ERROR || d.details === Hls.ErrorDetails.MANIFEST_LOAD_TIMEOUT;
      setTimeout(() => {
        if (dead) return;
        if (playlist) hls.loadSource(src);
        else hls.startLoad();
      }, RETRY_BACKOFF_MS * retries);
    } else if (d.type === Hls.ErrorTypes.MEDIA_ERROR && retries++ < MAX_RETRIES) hls.recoverMediaError();
    else fatal(notFound ? "Stream not found (404)." : denied ? `Access denied (${d.response?.code}).` : `Cannot play this stream (${d.details})`);
  });
  return {
    ...NONE,
    name: "hls",
    liveSeek: true,
    levels: () => sortLevels(hls.levels.map((l, i) => ({ id: i, h: l.height || 0, b: l.bitrate || 0 }))),
    autoOn: () => hls.autoLevelEnabled,
    // hls.currentLevel is the level of the fragment being *played*: -1 right after a manual switch (the buffer was flushed).
    // The level the user pinned is manualLevel (-1 = auto).
    levelId: () => hls.manualLevel,
    setLevel: (id) => {
      hls.currentLevel = id;
    },
    current: () => {
      const l = hls.levels[hls.currentLevel] || hls.levels[hls.loadLevel];
      return l && { h: l.height || 0, b: l.bitrate || 0 };
    },
    managed: true,
    texts: () => hls.subtitleTracks.map((t) => ({ label: t.name || t.lang || "" })),
    textIndex: () => hls.subtitleTrack,
    setText: (i) => {
      hls.subtitleTrack = i;
    },
    destroy() {
      dead = true;
      hls.destroy();
      airplaySource?.remove();
    }
  };
}

// src/aspect.ts
var RATIO = /^\s*(\d+(?:\.\d+)?)\s*[:/]\s*(\d+(?:\.\d+)?)\s*$/;
function parseAspectRatio(aspectRatio) {
  const match = typeof aspectRatio === "string" ? RATIO.exec(aspectRatio) : null;
  const w = Number(match?.[1]);
  const h2 = Number(match?.[2]);
  if (w > 0 && h2 > 0) return { w, h: h2 };
  throw new Error(`Unknown aspect ratio "${String(aspectRatio)}". Use a ratio as 'width:height', such as '16:9' or '9:16'.`);
}

// src/icons.ts
var svg = (body, fill = "currentColor") => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18" fill="${fill}" overflow="visible" aria-hidden="true" focusable="false">${body}</svg>`;
var ICONS = {
  "airplay-enter": svg(
    '<path d="M14.5 2A3.5 3.5 0 0 1 18 5.5v5l-.005.18a3.5 3.5 0 0 1-3.027 3.288L13 12h1.5a1.5 1.5 0 0 0 1.5-1.5v-5A1.5 1.5 0 0 0 14.5 4h-11A1.5 1.5 0 0 0 2 5.5v5A1.5 1.5 0 0 0 3.5 12H5l-1.968 1.967A3.5 3.5 0 0 1 0 10.5v-5A3.5 3.5 0 0 1 3.5 2z"/><path d="M8.631 10.902a.5.5 0 0 1 .738 0l4.363 4.76a.5.5 0 0 1-.369.838H4.637a.5.5 0 0 1-.369-.838z"/>'
  ),
  "airplay-exit": svg(
    '<path d="M14.5 2A3.5 3.5 0 0 1 18 5.5v5a3.5 3.5 0 0 1-3.032 3.468L9.354 8.354a.5.5 0 0 0-.708 0l-5.615 5.614A3.5 3.5 0 0 1 0 10.5v-5A3.5 3.5 0 0 1 3.5 2z"/><path d="M14.5 2A3.5 3.5 0 0 1 18 5.5v5l-.005.18a3.5 3.5 0 0 1-3.027 3.288L13 12h1.5a1.5 1.5 0 0 0 1.5-1.5v-5A1.5 1.5 0 0 0 14.5 4h-11A1.5 1.5 0 0 0 2 5.5v5A1.5 1.5 0 0 0 3.5 12H5l-1.968 1.967A3.5 3.5 0 0 1 0 10.5v-5A3.5 3.5 0 0 1 3.5 2z"/><path d="M8.631 10.902a.5.5 0 0 1 .738 0l4.363 4.76a.5.5 0 0 1-.369.838H4.637a.5.5 0 0 1-.369-.838z" class="vp-air-tri"/>'
  ),
  // Caption lines (captions-off, menu-item-caption, captions-on): 2 thick, the same as the stroke-width of the outline, with fully round ends (rx 1).
  // Rows at y=7.5 and y=11: 1.5 apart, 1 above the inner edge of the border. captions-on cuts the same lines out of its filled body: change them together.
  "captions-off": svg(
    '<rect x="1" y="3" width="16" height="12" rx="2.5" stroke="currentColor" stroke-width="2"/><rect x="3" y="7.5" width="3" height="2" rx="1" fill="currentColor" fill-opacity="0.5"/><rect x="13" y="7.5" width="2" height="2" rx="1" fill="currentColor" fill-opacity="0.5"/><rect x="11" y="11" width="4" height="2" rx="1" fill="currentColor" fill-opacity="0.5"/><rect x="7" y="7.5" width="5" height="2" rx="1" fill="currentColor" fill-opacity="0.5"/><rect x="3" y="11" width="7" height="2" rx="1" fill="currentColor" fill-opacity="0.5"/>',
    "none"
  ),
  "captions-on": svg(
    '<path d="M14.5 2A3.5 3.5 0 0 1 18 5.5v7a3.5 3.5 0 0 1-3.5 3.5h-11A3.5 3.5 0 0 1 0 12.5v-7A3.5 3.5 0 0 1 3.5 2zM4 7.5a1 1 0 0 0 0 2h1a1 1 0 0 0 0-2h-1ZM8 7.5a1 1 0 0 0 0 2h3a1 1 0 0 0 0-2h-3ZM14 7.5a1 1 0 0 0 0 2a1 1 0 0 0 0-2ZM4 11a1 1 0 0 0 0 2h5a1 1 0 0 0 0-2h-5ZM12 11a1 1 0 0 0 0 2h2a1 1 0 0 0 0-2h-2Z"/>'
  ),
  "fullscreen-enter": svg(
    '<path d="M9.57 3.617A1 1 0 0 0 8.646 3H4c-.552 0-1 .449-1 1v4.646a.996.996 0 0 0 1.001 1 1 1 0 0 0 .706-.293l4.647-4.647a1 1 0 0 0 .216-1.089m4.812 4.812a1 1 0 0 0-1.089.217l-4.647 4.647a.998.998 0 0 0 .708 1.706H14c.552 0 1-.449 1-1V9.353a1 1 0 0 0-.618-.924"/>'
  ),
  "fullscreen-exit": svg(
    '<path d="M7.883 1.93a.99.99 0 0 0-1.09.217L2.146 6.793A.998.998 0 0 0 2.853 8.5H7.5c.551 0 1-.449 1-1V2.854a1 1 0 0 0-.617-.924m7.263 7.57H10.5c-.551 0-1 .449-1 1v4.646a.996.996 0 0 0 1.001 1.001 1 1 0 0 0 .706-.293l4.646-4.646a.998.998 0 0 0-.707-1.707z"/>'
  ),
  "menu-back": svg(
    '<path d="M11.964 9.014 7.014 4.064m0 9.9 4.95-4.95" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>',
    "none"
  ),
  "menu-item-accessibility": svg(
    '<path d="M9 18q-.213 0-.424-.012h.85Q9.214 18 9 18M9 2a8 8 0 0 1 8 8c0 1.975-.719 3.78-1.905 5.175a.75.75 0 0 1-1.204.018l-1.509-1.971a.75.75 0 0 1 .596-1.206h1.674a6 6 0 1 0-11.304 0h1.68a.75.75 0 0 1 .596 1.206l-1.507 1.971a.75.75 0 0 1-1.133.07l-.003.004A8 8 0 0 1 9 2"/><rect width="6" height="2" x="6" y="14" fill-opacity=".5" rx="1"/><path d="M8.3 6.318c.246-.64 1.154-.64 1.4 0L10.732 9h-.002a2 2 0 1 1-3.46 0h-.001z"/><g fill-opacity=".5"><circle cx="5" cy="10.25" r=".75"/><circle cx="13" cy="10.25" r=".75"/><circle cx="6" cy="7.25" r=".75"/><circle cx="12" cy="7.25" r=".75"/></g>'
  ),
  "menu-item-caption": svg(
    '<rect x="1" y="3" width="16" height="12" rx="2.5" stroke="currentColor" stroke-width="2"/><rect x="3" y="7.5" width="3" height="2" rx="1" fill="currentColor" fill-opacity="0.5"/><rect x="13" y="7.5" width="2" height="2" rx="1" fill="currentColor" fill-opacity="0.5"/><rect x="11" y="11" width="4" height="2" rx="1" fill="currentColor" fill-opacity="0.5"/><rect x="7" y="7.5" width="5" height="2" rx="1" fill="currentColor" fill-opacity="0.5"/><rect x="3" y="11" width="7" height="2" rx="1" fill="currentColor" fill-opacity="0.5"/>',
    "none"
  ),
  "menu-item-toggle": svg(
    '<path d="M12.5 9.5a3.5 3.5 0 1 1 0 7h-7a3.5 3.5 0 1 1 0-7zm-2 1.5a2 2 0 1 0 0 4h2a2 2 0 0 0 0-4z"/><path fill-opacity=".5" d="M12.5 1.5a3.5 3.5 0 1 1 0 7h-7a3.5 3.5 0 1 1 0-7zM5.5 3a2 2 0 1 0 0 4h2a2 2 0 0 0 0-4z"/>'
  ),
  mute: svg(
    '<path d="M.714 6.008h3.072l4.071-3.857c.5-.376 1.143 0 1.143.601V15.28c0 .602-.643.903-1.143.602l-4.071-3.858H.714c-.428 0-.714-.3-.714-.752V6.76c0-.451.286-.752.714-.752M14.5 7.586l-1.768-1.768a1 1 0 1 0-1.414 1.414L13.085 9l-1.767 1.768a1 1 0 0 0 1.414 1.414l1.768-1.768 1.768 1.768a1 1 0 0 0 1.414-1.414L15.914 9l1.768-1.768a1 1 0 0 0-1.414-1.414z"/>'
  ),
  pause: svg('<rect width="5" height="14" x="2" y="2" rx="1.75"/><rect width="5" height="14" x="11" y="2" rx="1.75"/>'),
  "pip-enter": svg(
    '<path d="M13 2a4 4 0 0 1 4 4v2.036A3.5 3.5 0 0 0 16.5 8H15V6.273C15 5.018 13.96 4 12.679 4H4.32C3.04 4 2 5.018 2 6.273v5.454C2 12.982 3.04 14 4.321 14H6v1.5q0 .255.036.5H4a4 4 0 0 1-4-4V6a4 4 0 0 1 4-4z"/><rect width="10" height="7" x="8" y="10" rx="2"/><path d="M7.129 5.547a.6.6 0 0 0-.656.13L3.677 8.473A.6.6 0 0 0 4.102 9.5h2.796c.332 0 .602-.27.602-.602V6.103a.6.6 0 0 0-.371-.556"/>'
  ),
  "pip-exit": svg(
    '<path d="M13 2a4 4 0 0 1 4 4v2.036A3.5 3.5 0 0 0 16.5 8H15V6.273C15 5.018 13.96 4 12.679 4H4.32C3.04 4 2 5.018 2 6.273v5.454C2 12.982 3.04 14 4.321 14H6v1.5q0 .255.036.5H4a4 4 0 0 1-4-4V6a4 4 0 0 1 4-4z"/><rect width="10" height="7" x="8" y="10" rx="2"/><path d="M4.871 10.454a.6.6 0 0 0 .656-.131l2.796-2.796A.6.6 0 0 0 7.898 6.5H5.102a.603.603 0 0 0-.602.602v2.795a.6.6 0 0 0 .371.556"/>'
  ),
  play: svg(
    '<path d="m14.051 10.723-7.985 4.964a1.98 1.98 0 0 1-2.758-.638A2.06 2.06 0 0 1 3 13.964V4.036C3 2.91 3.895 2 5 2c.377 0 .747.109 1.066.313l7.985 4.964a2.057 2.057 0 0 1 .627 2.808c-.16.257-.373.475-.627.637"/>'
  ),
  restart: svg(
    '<path d="M9 1a7.98 7.98 0 0 0-6.132 2.867l-1.441-1.44A.25.25 0 0 0 1 2.604V6.75c0 .138.112.25.25.25h4.146a.25.25 0 0 0 .177-.427L4.29 5.29A5.99 5.99 0 0 1 9 3a6 6 0 1 1-6 6H1a8 8 0 1 0 8-8"/><path d="m11.61 9.639-3.331 2.07a.826.826 0 0 1-1.15-.266.86.86 0 0 1-.129-.452V6.849C7 6.38 7.374 6 7.834 6c.158 0 .312.045.445.13l3.331 2.071a.858.858 0 0 1 0 1.438"/>'
  ),
  settings: svg(
    '<path d="M7.519 2.184c.357-1.578 2.605-1.579 2.962 0a1.518 1.518 0 0 0 2.292.949c1.368-.864 2.957.727 2.094 2.096-.56.886-.074 2.06.949 2.292 1.579.356 1.578 2.606 0 2.962a1.52 1.52 0 0 0-.95 2.293c.864 1.369-.725 2.96-2.093 2.095a1.52 1.52 0 0 0-2.292.95c-.357 1.578-2.606 1.578-2.962 0a1.52 1.52 0 0 0-2.292-.95c-1.368.864-2.957-.726-2.094-2.095a1.52 1.52 0 0 0-.949-2.293c-1.579-.356-1.579-2.606 0-2.962a1.52 1.52 0 0 0 .95-2.292c-.864-1.369.725-2.96 2.093-2.096.887.56 2.061.074 2.292-.95m1.48 3.474a3.343 3.343 0 1 0 .002 6.687 3.343 3.343 0 0 0-.002-6.687"/>'
  ),
  "volume-high": svg(
    '<path d="M15.6 3.3c-.4-.4-1-.4-1.4 0s-.4 1 0 1.4C15.4 5.9 16 7.4 16 9s-.6 3.1-1.8 4.3c-.4.4-.4 1 0 1.4.2.2.5.3.7.3.3 0 .5-.1.7-.3C17.1 13.2 18 11.2 18 9s-.9-4.2-2.4-5.7"/><path d="M.714 6.008h3.072l4.071-3.857c.5-.376 1.143 0 1.143.601V15.28c0 .602-.643.903-1.143.602l-4.071-3.858H.714c-.428 0-.714-.3-.714-.752V6.76c0-.451.286-.752.714-.752m10.568.59a.91.91 0 0 1 0-1.316.91.91 0 0 1 1.316 0c1.203 1.203 1.47 2.216 1.522 3.208q.012.255.011.51c0 1.16-.358 2.733-1.533 3.803a.7.7 0 0 1-.298.156c-.382.106-.873-.011-1.018-.156a.91.91 0 0 1 0-1.316c.57-.57.995-1.551.995-2.487 0-.944-.26-1.667-.995-2.402"/>'
  ),
  "volume-low": svg(
    '<path d="M.714 6.008h3.072l4.071-3.857c.5-.376 1.143 0 1.143.601V15.28c0 .602-.643.903-1.143.602l-4.071-3.858H.714c-.428 0-.714-.3-.714-.752V6.76c0-.451.286-.752.714-.752m10.568.59a.91.91 0 0 1 0-1.316.91.91 0 0 1 1.316 0c1.203 1.203 1.47 2.216 1.522 3.208q.012.255.011.51c0 1.16-.358 2.733-1.533 3.803a.7.7 0 0 1-.298.156c-.382.106-.873-.011-1.018-.156a.91.91 0 0 1 0-1.316c.57-.57.995-1.551.995-2.487 0-.944-.26-1.667-.995-2.402"/>'
  ),
  check: svg('<path d="m3.2 9.6 3.8 3.8 7.8-8.2" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>', "none"),
  "more-vertical": svg('<circle cx="9" cy="3.6" r="1.6"/><circle cx="9" cy="9" r="1.6"/><circle cx="9" cy="14.4" r="1.6"/>')
};
function icon(name, className = "vp-i") {
  const tpl = document.createElement("template");
  tpl.innerHTML = ICONS[name] ?? "";
  const el = tpl.content.firstElementChild;
  if (!el) throw new Error(`Unknown icon: ${name}`);
  el.setAttribute("class", className);
  return el;
}
var setIcon = (button, name) => button.replaceChildren(icon(name));

// src/menu.ts
var SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
var ROW_ICON = { quality: "menu-item-toggle", speed: "menu-item-accessibility", captions: "menu-item-caption" };
var PAGES = Object.keys(ROW_ICON);
var isPage = (value) => PAGES.includes(value);
var SettingsMenu = class {
  // what is rendered now: refresh() leaves the DOM alone while nothing changed, so a click is never lost to a re-render
  constructor(root, gear, menu, deps) {
    this.page = "root";
    this.sig = "";
    this.root = root;
    this.gear = gear;
    this.menu = menu;
    this.deps = deps;
    const { signal } = deps;
    gear.addEventListener("click", () => this.setOpen(!this.isOpen), { signal });
    document.addEventListener(
      "click",
      (e) => {
        const wrapper = this.menu.parentElement;
        if (!this.menu.hidden && !(wrapper && e.composedPath().includes(wrapper))) this.setOpen(false);
      },
      { signal }
    );
    menu.addEventListener("click", (e) => this.onRowClick(e), { signal });
    menu.addEventListener("keydown", (e) => this.onKeydown(e), { signal });
  }
  get isOpen() {
    return !this.menu.hidden;
  }
  setOpen(open) {
    this.menu.hidden = !open;
    this.gear.setAttribute("aria-expanded", String(open));
    if (open) {
      this.fit();
      this.show("root");
    }
    this.deps.onToggle();
  }
  fit() {
    if (this.menu.hidden) return;
    const k = this.deps.getIconScale();
    const floor = 140 * Math.min(k, 1);
    if (this.root.classList.contains("vp-simple")) {
      const room = this.root.clientHeight / this.deps.getZoom() - (56 * k + 2 + 8) - (22 * k + 8);
      this.menu.style.maxHeight = Math.max(floor, room) + "px";
      return;
    }
    const below = 57 * k + 2 + 8;
    const above = this.root.classList.contains("vp-air-up") ? 56 * k + 2 + 8 : 43;
    this.menu.style.maxHeight = Math.max(floor, this.root.clientHeight / this.deps.getZoom() - below - above) + "px";
  }
  refresh() {
    if (this.menu.hidden) return;
    const focused = this.rows().findIndex((row) => row === document.activeElement);
    this.render();
    if (focused >= 0) this.rows()[focused]?.focus();
  }
  rows() {
    return [...this.menu.querySelectorAll(".vp-mi")];
  }
  show(page) {
    this.page = page;
    this.render(true);
    this.rows()[0]?.focus();
  }
  onRowClick(e) {
    const row = e.target instanceof Element ? e.target.closest(".vp-mi") : null;
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
    if (!("back" in row.dataset)) {
      const { video, captions, getEngine } = this.deps;
      const value = Number(val);
      if (this.page === "quality") getEngine().setLevel(value);
      else if (this.page === "speed") video.playbackRate = value;
      else captions.set(value);
    }
    this.show("root");
  }
  onKeydown(e) {
    const rows = this.rows();
    const i = rows.findIndex((row) => row === document.activeElement);
    const swallow = () => {
      e.preventDefault();
      e.stopPropagation();
    };
    const focus = (n) => {
      swallow();
      rows[(n + rows.length) % rows.length]?.focus();
    };
    switch (e.key) {
      case "ArrowDown":
        focus(i + 1);
        break;
      case "ArrowUp":
        focus(i < 0 ? -1 : i - 1);
        break;
      case "Home":
        focus(0);
        break;
      case "End":
        focus(-1);
        break;
      case "ArrowRight":
        if (this.page === "root" && i >= 0) {
          swallow();
          rows[i]?.click();
        }
        break;
      case "ArrowLeft":
        if (this.page !== "root") {
          swallow();
          this.show("root");
        }
        break;
    }
  }
  qualityText() {
    const { t, getEngine } = this.deps;
    const engine = getEngine();
    if (engine.autoOn()) {
      const now = playingText(engine.current());
      return now ? `${t.auto} (${now})` : t.auto;
    }
    const pinned = engine.levels().find((l) => l.id === engine.levelId());
    return pinned ? levelText(pinned, t.level) : "";
  }
  options(page) {
    const { t, video, captions, getEngine } = this.deps;
    const engine = getEngine();
    switch (page) {
      case "quality": {
        const auto = engine.autoOn();
        return [
          { val: -1, text: auto ? this.qualityText() : t.auto, checked: auto },
          ...engine.levels().map((l) => ({
            val: l.id,
            text: l.h ? `${l.h}p` : l.b ? mbps(l.b) : `${t.level} ${l.id + 1}`,
            badge: l.h >= 2160 ? "4K" : l.h >= 1080 ? "HD" : "",
            pill: l.dup && l.b ? mbps(l.b) : "",
            checked: !auto && engine.levelId() === l.id
          }))
        ];
      }
      case "speed":
        return SPEEDS.map((s) => ({ val: s, text: `${s}\xD7`, checked: video.playbackRate === s }));
      case "captions": {
        const current = captions.index();
        return [
          { val: -1, text: t.off, checked: current < 0 },
          ...captions.list().map((c) => ({ val: c.index, text: c.label, checked: current === c.index }))
        ];
      }
    }
  }
  model() {
    const { t, video, captions, getEngine } = this.deps;
    if (this.page !== "root") return { page: this.page, title: t[this.page], rows: this.options(this.page) };
    const rows = [];
    if (getEngine().levels().length) rows.push({ go: "quality", text: t.quality, value: this.qualityText() });
    rows.push({ go: "speed", text: t.speed, value: `${video.playbackRate}\xD7` });
    if (captions.list().length) rows.push({ go: "captions", text: t.captions, value: captions.label() });
    const actions = this.deps.getActions().map(({ id, text, icon: icon2 }) => ({ id, text, icon: icon2 }));
    return { page: "root", rows, actions };
  }
  view(m) {
    const { t } = this.deps;
    const row = (props, ...kids) => h("button", { type: "button", class: "vp-mi", ...props }, ...kids);
    if (m.page === "root") {
      const rows2 = m.rows.map(
        (r) => row(
          { role: "menuitem", "data-go": r.go },
          icon(ROW_ICON[r.go]),
          h("span", { class: "vp-mi-t" }, r.text),
          h("span", { class: "vp-mi-v" }, r.value),
          icon("menu-back", "vp-i vp-chev")
        )
      );
      const actions = m.actions.map((a) => row({ role: "menuitem", "data-act": a.id }, icon(a.icon), h("span", { class: "vp-mi-t" }, a.text)));
      const sep = actions.length ? [h("div", { class: "vp-sep", role: "separator" })] : [];
      return [h("div", { class: "vp-list" }, ...rows2, ...sep, ...actions)];
    }
    const rows = m.rows.map(
      (r) => row(
        { role: "menuitemradio", "aria-checked": String(r.checked), "data-val": r.val },
        h("span", { class: "vp-mi-t" }, r.text, r.badge ? h("sup", { class: "vp-badge" }, r.badge) : null),
        r.pill ? h("span", { class: "vp-pill" }, r.pill) : null,
        r.checked ? icon("check", "vp-i vp-ck") : null
      )
    );
    const head = h(
      "button",
      { type: "button", class: "vp-mi vp-head", role: "menuitem", "data-back": true, "aria-label": `${t.back} (${m.title})` },
      icon("menu-back", "vp-i vp-back"),
      h("span", { class: "vp-mi-t" }, m.title)
    );
    return [head, h("div", { class: "vp-sep", role: "separator" }), h("div", { class: "vp-list" }, ...rows)];
  }
  render(centre = false) {
    const m = this.model();
    const sig = JSON.stringify(m);
    if (!centre && sig === this.sig) return;
    this.sig = sig;
    this.menu.replaceChildren(...this.view(m));
    if (!centre) return;
    const list = this.menu.querySelector(".vp-list");
    const on = list?.querySelector('[aria-checked="true"]');
    if (list) list.scrollTop = on ? on.offsetTop - (list.clientHeight - on.offsetHeight) / 2 : 0;
  }
};

// src/player.ts
var IDLE_MS = 2800;
var SEEK_STEP_S = 5;
var PLAY_FLASH_MS = 800;
var SCRUB_HIDE_MS = 900;
var SEEK_SCALE = 1e3;
var ZOOM_BASE_WIDTH = 960;
var ZOOM_MAX = 1.75;
var NARROW_WIDTH = 640;
var LIFT_WIDTH = { air: 760, pip: 720, vol: 680, fs: 640 };
var PLAY_WIDTH = 380;
var CC_WIDTH = 340;
var ICON_SIZE = { default: 20, min: 12, max: 40 };
var SEEK_WIDTH = 280;
var AUTO_ASPECT = { min: 1 / 3, max: 3.6 };
function applyAspectShape(root, shape) {
  const { style } = root;
  if (shape) {
    style.setProperty("--vp-aspect", `${shape.w} / ${shape.h}`);
    style.setProperty("--_ratio", String(shape.w / shape.h));
  } else {
    style.removeProperty("--vp-aspect");
    style.removeProperty("--_ratio");
  }
  root.classList.toggle("vp-portrait", !!shape && shape.h > shape.w);
}
function applyIconSize(root, iconSize) {
  if (iconSize == null) {
    root.style.removeProperty("--vp-icon-size");
    return;
  }
  if (typeof iconSize !== "number" || !Number.isFinite(iconSize) || iconSize <= 0) {
    throw new Error(`Player: iconSize must be a positive number of px (got ${String(iconSize)})`);
  }
  root.style.setProperty("--vp-icon-size", `${iconSize}px`);
}
function parseHideDelay(hideDelay) {
  if (hideDelay == null) return void 0;
  if (typeof hideDelay !== "number" || !Number.isFinite(hideDelay) || hideDelay < 0) {
    throw new Error(`Player: hideDelay must be a number of seconds, 0 or more (got ${String(hideDelay)})`);
  }
  return hideDelay * 1e3;
}
function createDom(t, options) {
  const button = (cls, label, iconName, hidden = false) => h("button", { type: "button", class: `vp-btn ${cls}`, "aria-label": label, hidden }, icon(iconName));
  const mute = button("vp-mute", t.mute, "volume-high");
  const volume = h("input", { class: "vp-range vp-volume", type: "range", min: 0, max: 1, step: 0.01, value: 1, "aria-label": t.volume });
  const volBox = h("div", { class: "vp-vol" }, mute, volume);
  const cur = h("span", { class: "vp-time" }, "0:00");
  const dur = h("button", { type: "button", class: "vp-time vp-dur" }, "0:00");
  const seek = h("input", { class: "vp-range vp-seek", type: "range", min: 0, max: SEEK_SCALE, step: 1, value: 0, "aria-label": t.seek });
  const gear = button("vp-gear", t.settings, options.simple ? "more-vertical" : "settings");
  gear.setAttribute("aria-haspopup", "menu");
  gear.setAttribute("aria-expanded", "false");
  const menu = h("div", { class: "vp-menu", role: "menu", hidden: true });
  const play = button("vp-play", t.play, "play");
  const mid = button("vp-play-mid", t.play, "play");
  const cc = button("vp-cc", t.captions, "captions-off", true);
  const air = button("vp-air", t.airplay, "airplay-enter", true);
  const pip = button("vp-pip", t.pip, "pip-enter", true);
  const fs = button("vp-fs", t.fullscreen, "fullscreen-enter", !options.fullscreen);
  const msg = h("div", { class: "vp-msg", role: "alert", hidden: true });
  const bar = h(
    "div",
    { class: "vp-bar" },
    play,
    volBox,
    h("div", { class: "vp-timeline" }, cur, seek, dur),
    cc,
    h("div", { class: "vp-set" }, gear, menu),
    h("div", { class: "vp-screen" }, h("div", { class: "vp-remote" }, air, pip), fs)
  );
  const cues = h("div", { class: "vp-cues", "aria-hidden": "true" });
  const ui = h("div", { class: "vp-ui" }, bar, mid, cues);
  const video = h("video", { class: "vp-video", playsinline: true });
  const rootClass = ["vp", options.glass ? "vp-glass" : "", options.simple ? "vp-simple" : ""].filter(Boolean).join(" ");
  const root = h("div", { class: rootClass, tabindex: -1, role: "group", "aria-label": t.player }, video, msg, ui);
  video.playsInline = true;
  video.preload = options.preload || "metadata";
  if (options.thumbnail) video.poster = options.thumbnail;
  video.muted = !!options.muted;
  video.loop = !!options.loop;
  video.autoplay = !!options.autoplay;
  applyAspectShape(root, options.aspectRatio == null ? void 0 : parseAspectRatio(options.aspectRatio));
  applyIconSize(root, options.iconSize);
  const el = { msg, play, mid, mute, volume, volBox, cur, dur, seek, cc, gear, menu, air, pip, fs, ui, cues };
  return { root, video, el };
}
var Player = class {
  constructor(target, options = {}) {
    this.ac = new AbortController();
    this.listeners = /* @__PURE__ */ new Map();
    this.engine = NONE;
    this.loadId = 0;
    this.lastCaption = 0;
    this.seeking = false;
    this.adjustingVolume = false;
    this.seekTarget = null;
    this.showRemaining = false;
    this.idleTimer = void 0;
    this.playTimer = void 0;
    this.scrubTimer = void 0;
    this.zoom = 1;
    this.autoAspect = false;
    this.autoRatio = 0;
    const host = typeof target === "string" ? document.querySelector(target) : target;
    if (!(host instanceof Element)) throw new Error(`Player: element not found (${String(target)})`);
    this.options = options;
    this.dots = !!options.simple;
    this.t = { ...LABELS, ...options.labels };
    this.hideDelayMs = parseHideDelay(options.hideDelay);
    const { root, video, el } = createDom(this.t, options);
    host.append(root);
    this.root = root;
    this.video = video;
    this.el = el;
    this.autoAspect = options.aspectRatio == null;
    this.captions = new Captions(this.video, () => this.engine, this.t);
    new CueLayer(this.video, this.el.cues, this.captions, this.ac.signal);
    this.menu = new SettingsMenu(this.root, this.el.gear, this.el.menu, {
      t: this.t,
      video: this.video,
      captions: this.captions,
      getEngine: () => this.engine,
      getZoom: () => this.zoom,
      getIconScale: () => this.iconScale(true),
      getActions: () => this.menuActions(),
      onToggle: () => this.wake(),
      signal: this.ac.signal
    });
    this.bindPlayback();
    this.bindVolume();
    this.bindProgress();
    this.bindCaptions();
    this.bindRemoteAndFullscreen();
    this.bindIdleAndKeyboard();
    this.bindResize();
    this.bindContextMenu();
    this.listen(this.video, "ratechange", () => this.refresh());
    for (const type of ["loadedmetadata", "resize"]) this.listen(this.video, type, () => this.syncAspect());
    this.tick();
    this.syncPlay();
    this.syncCaptionButton();
    this.video.dispatchEvent(new Event("volumechange"));
    if (options.src) void this.load(options.src, options);
  }
  async load(src, { type, subtitles = [] } = {}) {
    const id = ++this.loadId;
    this.unload();
    if (!src) return;
    const alive = () => id === this.loadId;
    const ctx = {
      alive,
      auth: createAuth(this.options.bearerToken, this.options.bearerOrigins, src),
      worker: this.options.bearerWorker,
      refresh: () => {
        if (alive()) this.refresh();
      },
      fatal: (message) => {
        if (alive()) this.fatal(message);
      }
    };
    try {
      const kind = detectType(src, type);
      void this.captions.load(subtitles, alive, ctx.auth).then(() => this.refresh());
      const engine = await createEngine(kind, this.video, src, ctx, this.options.hls);
      if (!alive()) return engine.destroy();
      this.engine = engine;
      this.emit("load", { src, type: kind, engine: engine.name });
    } catch (e) {
      if (alive()) this.showError(e instanceof Error ? e.message : String(e));
    }
    if (alive()) this.refresh();
  }
  play() {
    return this.video.play();
  }
  pause() {
    this.video.pause();
  }
  togglePlay() {
    const { video } = this;
    if (video.paused) video.play().catch(() => {
    });
    else video.pause();
  }
  toggleFullscreen() {
    const { root, video } = this;
    if (document.fullscreenElement === root) document.exitFullscreen().catch(() => {
    });
    else if (typeof root.requestFullscreen === "function") root.requestFullscreen().catch(() => {
    });
    else video.webkitEnterFullscreen?.();
  }
  setAspectRatio(aspectRatio) {
    applyAspectShape(this.root, aspectRatio == null ? void 0 : parseAspectRatio(aspectRatio));
    this.autoRatio = 0;
    this.autoAspect = aspectRatio == null;
    this.syncAspect();
  }
  setGlass(on = true) {
    this.root.classList.toggle("vp-glass", !!on);
  }
  setIconSize(iconSize) {
    applyIconSize(this.root, iconSize);
    this.layout();
  }
  setSimple(on = true) {
    const { classList } = this.root;
    classList.toggle("vp-simple", !!on);
    classList.remove("vp-playflash", "vp-scrub");
    clearTimeout(this.playTimer);
    clearTimeout(this.scrubTimer);
    this.menu.setOpen(false);
    this.layout();
  }
  showError(message) {
    this.el.msg.textContent = message;
    this.el.msg.hidden = false;
    this.emit("error", { message });
  }
  on(type, fn) {
    const set = this.listeners.get(type) ?? /* @__PURE__ */ new Set();
    set.add(fn);
    this.listeners.set(type, set);
    return this;
  }
  off(type, fn) {
    this.listeners.get(type)?.delete(fn);
    return this;
  }
  emit(type, detail) {
    this.listeners.get(type)?.forEach((fn) => fn(detail));
  }
  destroy() {
    this.loadId++;
    clearTimeout(this.idleTimer);
    clearTimeout(this.playTimer);
    clearTimeout(this.scrubTimer);
    this.ac.abort();
    if (document.fullscreenElement === this.root) document.exitFullscreen().catch(() => {
    });
    if (document.pictureInPictureElement === this.video) document.exitPictureInPicture().catch(() => {
    });
    this.unload();
    this.root.remove();
    this.listeners.clear();
  }
  listen(target, type, fn) {
    target.addEventListener(type, fn, { signal: this.ac.signal });
  }
  syncPlay() {
    const { video, t } = this;
    const state = video.ended ? "replay" : video.paused ? "play" : "pause";
    for (const btn of [this.el.play, this.el.mid]) {
      setIcon(btn, { replay: "restart", play: "play", pause: "pause" }[state]);
      btn.setAttribute("aria-label", t[state]);
    }
  }
  bindPlayback() {
    const { video } = this;
    this.listen(this.el.play, "click", () => this.pressPlay());
    this.listen(this.el.mid, "click", () => this.pressPlay());
    this.listen(video, "click", () => this.pressPlay());
    for (const type of ["play", "pause", "ended", "seeked", "emptied"]) {
      this.listen(video, type, () => {
        this.syncPlay();
        this.wake();
      });
    }
  }
  pressPlay() {
    this.togglePlay();
    this.flashPlay();
  }
  get simple() {
    return this.root.classList.contains("vp-simple");
  }
  flashPlay() {
    this.root.classList.add("vp-playflash");
    clearTimeout(this.playTimer);
    this.playTimer = setTimeout(() => this.root.classList.remove("vp-playflash"), PLAY_FLASH_MS);
  }
  showTime() {
    if (!this.simple) return;
    this.root.classList.add("vp-scrub");
    clearTimeout(this.scrubTimer);
    if (!this.seeking) this.scrubTimer = setTimeout(() => this.root.classList.remove("vp-scrub"), SCRUB_HIDE_MS);
  }
  menuActions() {
    if (!this.dots) return [];
    const { t, video } = this;
    const actions = [];
    if (!this.el.air.hidden) {
      const wireless = video.webkitCurrentPlaybackTargetIsWireless;
      actions.push({ id: "air", text: t.airplay, icon: wireless ? "airplay-exit" : "airplay-enter", run: () => this.pickAirPlay() });
    }
    if (!this.el.pip.hidden) {
      const on = document.pictureInPictureElement === video;
      actions.push({ id: "pip", text: on ? t.exitPip : t.pip, icon: on ? "pip-exit" : "pip-enter", run: () => this.togglePip() });
    }
    if (this.el.fs.hidden) return actions;
    const full = document.fullscreenElement === this.root;
    actions.push({
      id: "fs",
      text: full ? t.exitFullscreen : t.fullscreen,
      icon: full ? "fullscreen-exit" : "fullscreen-enter",
      run: () => this.toggleFullscreen()
    });
    return actions;
  }
  bindVolume() {
    const { video, t } = this;
    const { volume, volBox, mute } = this.el;
    this.listen(mute, "click", () => {
      if (video.muted || video.volume === 0) {
        video.muted = false;
        if (video.volume === 0) video.volume = 0.5;
      } else video.muted = true;
    });
    this.listen(volume, "input", () => {
      const value = Math.max(0, Math.min(1, Number(volume.value)));
      video.volume = value;
      video.muted = value === 0;
    });
    this.listen(volume, "pointerdown", () => {
      this.adjustingVolume = true;
      volBox.classList.add("vp-drag");
      volume.classList.add("vp-grab");
    });
    this.listen(video, "volumechange", () => {
      const level = video.muted ? 0 : video.volume;
      volume.value = String(level);
      volume.style.setProperty("--p", level * 100 + "%");
      setIcon(mute, level === 0 ? "mute" : level < 0.5 ? "volume-low" : "volume-high");
      mute.setAttribute("aria-label", level === 0 ? t.unmute : t.mute);
    });
  }
  bufferedEnd() {
    const { buffered, currentTime } = this.video;
    for (let i = 0; i < buffered.length; i++) {
      if (buffered.start(i) <= currentTime + 0.1 && currentTime <= buffered.end(i)) return buffered.end(i);
    }
    return currentTime;
  }
  tick() {
    const { video } = this;
    const { seek, cur, dur } = this.el;
    const d = video.duration;
    const known = Number.isFinite(d) && d > 0;
    if (!this.seeking) seek.value = String(known ? video.currentTime / d * SEEK_SCALE : 0);
    const position = Number(seek.value);
    const shown = this.seeking && known ? position / SEEK_SCALE * d : video.currentTime;
    cur.textContent = formatTime(shown);
    const live = d === Infinity;
    if (live) dur.textContent = this.t.live;
    else if (!known) dur.textContent = this.showRemaining ? "-0:00" : "0:00";
    else dur.textContent = this.showRemaining ? "-" + formatTime(Math.max(0, Math.floor(d) - Math.floor(shown))) : formatTime(d);
    if (dur.getAttribute("aria-disabled") !== String(live)) dur.setAttribute("aria-disabled", String(live));
    seek.style.setProperty("--p", position / 10 + "%");
    seek.style.setProperty("--b", (known ? Math.max(this.bufferedEnd() / d * 100, position / 10) : 0) + "%");
  }
  bindProgress() {
    const { video } = this;
    const { seek, dur, volume, volBox } = this.el;
    for (const type of ["timeupdate", "durationchange", "progress", "loadedmetadata", "seeked", "emptied"]) this.listen(video, type, () => this.tick());
    this.listen(dur, "click", () => {
      if (video.duration === Infinity) return;
      this.showRemaining = !this.showRemaining;
      this.tick();
    });
    this.listen(seek, "pointerdown", () => {
      this.seeking = true;
      seek.classList.add("vp-grab");
      this.showTime();
    });
    const endDrag = () => {
      if (!this.seeking && !this.adjustingVolume) return;
      const wasSeeking = this.seeking;
      this.seeking = false;
      this.adjustingVolume = false;
      volBox.classList.remove("vp-drag");
      volume.classList.remove("vp-grab");
      seek.classList.remove("vp-grab");
      this.wake();
      if (wasSeeking) this.showTime();
    };
    for (const type of ["pointerup", "pointercancel", "blur"]) this.listen(window, type, endDrag);
    this.listen(seek, "input", () => {
      this.showTime();
      if (Number.isFinite(video.duration)) {
        this.seekTarget = Number(seek.value) / SEEK_SCALE * video.duration;
        if (this.engine.liveSeek) video.currentTime = this.seekTarget;
      }
      this.tick();
    });
    this.listen(seek, "change", () => {
      if (this.seekTarget !== null) video.currentTime = this.seekTarget;
      this.seekTarget = null;
    });
  }
  syncCaptionButton() {
    const { cc } = this.el;
    const i = this.captions.index();
    if (i >= 0) this.lastCaption = i;
    cc.hidden = this.captions.list().length === 0;
    cc.classList.toggle("vp-on", i >= 0);
    cc.setAttribute("aria-pressed", String(i >= 0));
    setIcon(cc, i >= 0 ? "captions-on" : "captions-off");
  }
  bindCaptions() {
    const { video } = this;
    this.listen(this.el.cc, "click", () => {
      this.captions.set(this.captions.index() >= 0 ? -1 : Math.min(this.lastCaption, this.captions.list().length - 1));
      this.refresh();
    });
    this.listen(video.textTracks, "addtrack", () => this.refresh());
    this.listen(video.textTracks, "change", () => this.refresh());
  }
  refresh() {
    this.syncCaptionButton();
    this.menu.refresh();
  }
  applyZoom() {
    this.zoom = document.fullscreenElement === this.root ? Math.min(ZOOM_MAX, Math.max(1, this.root.clientWidth / ZOOM_BASE_WIDTH)) : 1;
    this.el.ui.style.zoom = String(this.zoom);
    this.menu.fit();
  }
  syncNativeCaptions() {
    const { video } = this;
    const mode = video.webkitPresentationMode;
    this.root.classList.toggle("vp-native", document.pictureInPictureElement === video || mode !== void 0 && mode !== "inline");
  }
  bindRemoteAndFullscreen() {
    const { video, t } = this;
    const { pip, air, fs } = this.el;
    if (this.options.pip && document.pictureInPictureEnabled && !video.disablePictureInPicture) pip.hidden = false;
    this.listen(pip, "click", () => this.togglePip());
    const syncPip = () => {
      const on = document.pictureInPictureElement === video;
      setIcon(pip, on ? "pip-exit" : "pip-enter");
      pip.setAttribute("aria-label", on ? t.exitPip : t.pip);
      this.syncNativeCaptions();
    };
    this.listen(video, "enterpictureinpicture", syncPip);
    this.listen(video, "leavepictureinpicture", syncPip);
    this.listen(video, "webkitpresentationmodechanged", () => this.syncNativeCaptions());
    if (this.options.airplay && "WebKitPlaybackTargetAvailabilityEvent" in window) {
      const webkitVideo = video;
      this.listen(video, "webkitplaybacktargetavailabilitychanged", (e) => {
        air.hidden = e.availability !== "available";
      });
      this.listen(video, "webkitcurrentplaybacktargetiswirelesschanged", () => {
        setIcon(air, webkitVideo.webkitCurrentPlaybackTargetIsWireless ? "airplay-exit" : "airplay-enter");
      });
      this.listen(air, "click", () => this.pickAirPlay());
    }
    this.listen(fs, "click", () => this.toggleFullscreen());
    this.listen(document, "fullscreenchange", () => {
      const on = document.fullscreenElement === this.root;
      setIcon(fs, on ? "fullscreen-exit" : "fullscreen-enter");
      fs.setAttribute("aria-label", on ? t.exitFullscreen : t.fullscreen);
      this.applyZoom();
    });
  }
  togglePip() {
    if (document.pictureInPictureElement) document.exitPictureInPicture().catch(() => {
    });
    else this.video.requestPictureInPicture().catch(() => {
    });
  }
  pickAirPlay() {
    this.video.webkitShowPlaybackTargetPicker?.();
  }
  bindResize() {
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => this.layout());
    observer.observe(this.root);
    this.ac.signal.addEventListener("abort", () => observer.disconnect());
  }
  iconScale(shrunk = false) {
    const style = getComputedStyle(this.root);
    const px = parseFloat(style.getPropertyValue("--vp-icon-size"));
    const fit = shrunk ? parseFloat(style.getPropertyValue("--_fit")) : 1;
    const size = (Number.isFinite(px) ? px : ICON_SIZE.default) * (fit > 0 ? fit : 1);
    return Math.min(ICON_SIZE.max, Math.max(ICON_SIZE.min, size)) / ICON_SIZE.default;
  }
  layout() {
    const { clientWidth } = this.root;
    const scale = this.iconScale();
    const at = (width) => SEEK_WIDTH + (width - SEEK_WIDTH) * scale;
    const tight = (width) => Math.max(at(width), width * scale);
    const { classList } = this.root;
    const simple = classList.contains("vp-simple");
    classList.toggle("vp-narrow", clientWidth <= NARROW_WIDTH);
    classList.toggle("vp-play-off", !simple && clientWidth <= tight(PLAY_WIDTH));
    classList.toggle("vp-cc-up", !simple && clientWidth <= tight(CC_WIDTH));
    classList.toggle("vp-air-up", clientWidth <= at(LIFT_WIDTH.air));
    classList.toggle("vp-pip-up", clientWidth <= at(LIFT_WIDTH.pip));
    classList.toggle("vp-vol-up", simple || clientWidth <= at(LIFT_WIDTH.vol));
    classList.toggle("vp-fs-up", clientWidth <= at(LIFT_WIDTH.fs));
    this.syncGear();
    this.applyZoom();
  }
  syncGear() {
    const { classList } = this.root;
    const dots = classList.contains("vp-simple") || classList.contains("vp-play-off");
    if (dots === this.dots) return;
    this.dots = dots;
    if (this.menu.isOpen) this.menu.setOpen(false);
    setIcon(this.el.gear, dots ? "more-vertical" : "settings");
  }
  syncAspect() {
    if (!this.autoAspect) return;
    const { videoWidth, videoHeight } = this.video;
    if (!(videoWidth > 0 && videoHeight > 0)) return;
    if (this.autoRatio === 0 && getComputedStyle(this.root).getPropertyValue("--vp-aspect").trim() !== "") {
      this.autoAspect = false;
      return;
    }
    const ratio = Math.min(AUTO_ASPECT.max, Math.max(AUTO_ASPECT.min, videoWidth / videoHeight));
    if (Math.abs(ratio / this.autoRatio - 1) < 5e-3) return;
    this.autoRatio = ratio;
    applyAspectShape(this.root, { w: ratio, h: 1 });
  }
  bindContextMenu() {
    this.listen(this.root, "contextmenu", (e) => e.preventDefault());
  }
  wake() {
    const { root } = this;
    root.classList.remove("vp-idle");
    clearTimeout(this.idleTimer);
    if (this.options.visible) return;
    this.idleTimer = setTimeout(() => this.hideControls(), IDLE_MS);
  }
  hideControls() {
    if (!this.video.paused && !this.menu.isOpen && !this.seeking && !this.adjustingVolume) this.root.classList.add("vp-idle");
  }
  onPointerLeave(e) {
    if (this.hideDelayMs === void 0 || this.options.visible || e.pointerType === "touch") return;
    clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => this.hideControls(), this.hideDelayMs);
  }
  onKeydown(e) {
    const { video } = this;
    const target = e.target;
    if (!(target instanceof Element)) return;
    const key = String(e.key).toLowerCase();
    if (key === "escape" && this.menu.isOpen) {
      this.menu.setOpen(false);
      this.el.gear.focus();
      return;
    }
    if (!this.options.keyboard || target.matches("input") || e.metaKey || e.ctrlKey || e.altKey) return;
    let action;
    switch (key) {
      case "k":
        action = () => this.pressPlay();
        break;
      case " ":
        if (!target.closest("button")) action = () => this.pressPlay();
        break;
      case "f":
        if (this.options.fullscreen) action = () => this.toggleFullscreen();
        break;
      case "m":
        action = () => {
          video.muted = !video.muted;
        };
        break;
      case "arrowleft":
        action = () => {
          video.currentTime -= SEEK_STEP_S;
          this.showTime();
        };
        break;
      case "arrowright":
        action = () => {
          video.currentTime += SEEK_STEP_S;
          this.showTime();
        };
        break;
    }
    if (action) {
      e.preventDefault();
      action();
    }
  }
  bindIdleAndKeyboard() {
    const { root } = this;
    for (const type of ["pointermove", "pointerdown", "keydown", "focusin"]) this.listen(root, type, () => this.wake());
    this.listen(root, "pointerleave", (e) => this.onPointerLeave(e));
    this.listen(root, "keydown", (e) => this.onKeydown(e));
  }
  unload() {
    this.engine.destroy();
    this.engine = NONE;
    this.captions.reset();
    this.lastCaption = 0;
    this.el.msg.hidden = true;
    this.video.removeAttribute("src");
    this.video.load();
    this.refresh();
  }
  fatal(message) {
    this.engine.destroy();
    this.engine = NONE;
    this.showError(message);
    this.refresh();
  }
};
export {
  ICONS,
  LABELS,
  Player,
  detectType
};
