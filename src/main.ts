import "@tensorflow/tfjs-backend-webgl";
import * as tf from "@tensorflow/tfjs-core";
import * as bodySegmentation from "@tensorflow-models/body-segmentation";
import "./style.css";

const MEDIAPIPE_SELFIE_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation";

type Mode = "blur" | "replaceColor" | "replaceImage";

const app = document.querySelector<HTMLDivElement>("#app")!;

app.innerHTML = `
  <div class="app-header">
    <h1>Background Removal Camera</h1>
    <p class="sub" id="app-sub">Webcam + MediaPipe selfie segmentation. Tuned for smooth preview and reliable person detection.</p>
  </div>
  <div class="layout">
    <div class="preview-wrap">
      <button type="button" class="preview-obs-toggle" id="preview-obs-toggle" aria-pressed="false" title="Hide all controls and fill the window — best for OBS window capture">
        Fill window
      </button>
      <canvas id="output" width="960" height="540" aria-label="Processed camera output"></canvas>
      <div id="placeholder" class="preview-placeholder">Camera off — click Start</div>
    </div>
    <div class="panel">
      <h2>Controls</h2>
      <button type="button" class="primary" id="toggle-cam">Start camera</button>
      <label class="field">
        <span>Detection sensitivity <span id="sense-val">0.38</span> <span class="field-hint">(raise if you disappear, lower if background leaks)</span></span>
        <input type="range" id="sensitivity" min="0.22" max="0.55" step="0.01" value="0.38" />
      </label>
      <label class="field">
        <span>Edge stability <span id="stab-val">75</span>% <span class="field-hint">(temporal smoothing — higher = less jitter)</span></span>
        <input type="range" id="stability" min="0" max="90" value="75" />
      </label>
      <label class="field">
        <span>Mask feather <span id="feather-val">4</span>px <span class="field-hint">(softens the cutout edge)</span></span>
        <input type="range" id="feather" min="0" max="12" value="4" />
      </label>
      <label class="field">
        <span>Mode</span>
        <select id="mode">
          <option value="blur" selected>Blur background</option>
          <option value="replaceColor">Solid color</option>
          <option value="replaceImage">Custom image</option>
        </select>
      </label>
      <div id="blur-controls">
        <label class="field">
          <span>Background blur <span id="blur-val">6</span></span>
          <input type="range" id="blur" min="1" max="20" value="6" />
        </label>
      </div>
      <div id="replace-controls" class="hidden">
        <div id="replace-color-panel">
          <label class="field">
            <span>Background color</span>
            <input type="color" id="bg-color" value="#1a2332" />
          </label>
        </div>
        <div id="replace-image-panel" class="hidden">
          <label class="field">
            <span>Background image</span>
            <input type="file" id="bg-image" accept="image/*" class="file-input" />
          </label>
          <p class="file-name" id="bg-image-label">No file chosen</p>
        </div>
      </div>
      <label class="toggle">
        <input type="checkbox" id="mirror" checked />
        <span>Mirror preview (keep on for front camera)</span>
      </label>
      <div class="akvcam-panel hidden" id="akvcam-panel">
        <h3 class="akvcam-heading">System camera (Windows)</h3>
        <label class="toggle">
          <input type="checkbox" id="akvcam-virtual" disabled />
          <span>Stream processed output to AKVirtualCamera</span>
        </label>
        <p class="hint akvcam-hint" id="akvcam-status">Checking AKVirtualCamera…</p>
        <button type="button" class="ghost" id="akvcam-install">Install / update AKVirtualCamera…</button>
      </div>
      <p class="status" id="status">Loading AI model…</p>
      <p class="hint">Uses a 960×540 camera feed for smoother processing. Allow camera when prompted.</p>
    </div>
  </div>
`;

const output = document.querySelector<HTMLCanvasElement>("#output")!;
const placeholder = document.querySelector<HTMLDivElement>("#placeholder")!;
const toggleCam = document.querySelector<HTMLButtonElement>("#toggle-cam")!;
const modeSelect = document.querySelector<HTMLSelectElement>("#mode")!;
const blurControls = document.querySelector<HTMLDivElement>("#blur-controls")!;
const replaceControls = document.querySelector<HTMLDivElement>("#replace-controls")!;
const blurInput = document.querySelector<HTMLInputElement>("#blur")!;
const blurVal = document.querySelector<HTMLSpanElement>("#blur-val")!;
const stabilityInput = document.querySelector<HTMLInputElement>("#stability")!;
const stabVal = document.querySelector<HTMLSpanElement>("#stab-val")!;
const featherInput = document.querySelector<HTMLInputElement>("#feather")!;
const featherVal = document.querySelector<HTMLSpanElement>("#feather-val")!;
const bgColorInput = document.querySelector<HTMLInputElement>("#bg-color")!;
const replaceColorPanel = document.querySelector<HTMLDivElement>(
  "#replace-color-panel",
)!;
const replaceImagePanel = document.querySelector<HTMLDivElement>(
  "#replace-image-panel",
)!;
const bgImageInput = document.querySelector<HTMLInputElement>("#bg-image")!;
const bgImageLabel = document.querySelector<HTMLParagraphElement>("#bg-image-label")!;
const mirrorInput = document.querySelector<HTMLInputElement>("#mirror")!;
const sensitivityInput = document.querySelector<HTMLInputElement>("#sensitivity")!;
const senseVal = document.querySelector<HTMLSpanElement>("#sense-val")!;
const statusEl = document.querySelector<HTMLParagraphElement>("#status")!;
const akvcamPanel = document.querySelector<HTMLDivElement>("#akvcam-panel");
const akvcamToggle = document.querySelector<HTMLInputElement>("#akvcam-virtual");
const akvcamStatusEl = document.querySelector<HTMLParagraphElement>("#akvcam-status");
const akvcamInstallBtn = document.querySelector<HTMLButtonElement>("#akvcam-install");

/** Raw RGB24 for AkVCamManager stream (width × height × 3). */
let rgbScratch: Uint8Array | null = null;
let virtualCamStreaming = false;
let akvcamUnsubStreamError: (() => void) | undefined;

let video: HTMLVideoElement | null = null;
let stream: MediaStream | null = null;
let segmenter: bodySegmentation.BodySegmenter | null = null;
let cameraOn = false;
let rafId = 0;
let vfcHandle = 0;
let _recovering = false;

/** Loaded from the file picker; drawn behind the segmented person. */
let backgroundImage: HTMLImageElement | null = null;

const personCanvas = document.createElement("canvas");
const maskCanvas = document.createElement("canvas");
const maskScratchCanvas = document.createElement("canvas");
const blurredBgCanvas = document.createElement("canvas");

/** Per-pixel alpha history for temporal mask smoothing (0–1). Reset on size/camera change. */
let prevMaskAlpha: Float32Array | null = null;

function setStatus(text: string, isError = false) {
  statusEl.textContent = text;
  statusEl.classList.toggle("error", isError);
}

function getMode(): Mode {
  const v = modeSelect.value;
  if (v === "replaceColor") return "replaceColor";
  if (v === "replaceImage") return "replaceImage";
  return "blur";
}

function getForegroundThreshold(): number {
  return Number(sensitivityInput.value);
}

function syncModeUI() {
  const m = getMode();
  blurControls.classList.toggle("hidden", m !== "blur");
  const showReplace = m === "replaceColor" || m === "replaceImage";
  replaceControls.classList.toggle("hidden", !showReplace);
  replaceColorPanel.classList.toggle("hidden", m !== "replaceColor");
  replaceImagePanel.classList.toggle("hidden", m !== "replaceImage");
}

modeSelect.addEventListener("change", syncModeUI);
syncModeUI();

bgImageInput.addEventListener("change", () => {
  const file = bgImageInput.files?.[0];
  if (!file) {
    backgroundImage = null;
    bgImageLabel.textContent = "No file chosen";
    return;
  }
  bgImageLabel.textContent = file.name;
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    URL.revokeObjectURL(url);
    backgroundImage = img;
  };
  img.onerror = () => {
    URL.revokeObjectURL(url);
    backgroundImage = null;
    bgImageLabel.textContent = "Could not load image";
  };
  img.src = url;
});

blurInput.addEventListener("input", () => {
  blurVal.textContent = blurInput.value;
});
stabilityInput.addEventListener("input", () => {
  stabVal.textContent = stabilityInput.value;
});
featherInput.addEventListener("input", () => {
  featherVal.textContent = featherInput.value;
});
sensitivityInput.addEventListener("input", () => {
  senseVal.textContent = Number(sensitivityInput.value).toFixed(2);
});

async function loadModel() {
  await tf.setBackend("webgl");
  await tf.ready();
  segmenter = await bodySegmentation.createSegmenter(
    bodySegmentation.SupportedModels.MediaPipeSelfieSegmentation,
    {
      runtime: "mediapipe",
      /** Landscape model matches typical 16:9 webcams (faster + often better framing). */
      modelType: "landscape",
      solutionPath: MEDIAPIPE_SELFIE_URL,
    },
  );
  setStatus("Model ready. Start the camera when you are.");
}

loadModel().catch((err: unknown) => {
  console.error(err);
  setStatus(
    `Could not load model: ${err instanceof Error ? err.message : String(err)}`,
    true,
  );
});

/**
 * Test whether the TF.js WebGL backend is still functional. Returns false if the
 * GPU context was lost (e.g. after a window minimize on Windows).
 */
function isWebGLAlive(): boolean {
  try {
    const t = tf.tensor1d([1]);
    t.dataSync();
    t.dispose();
    return true;
  } catch {
    return false;
  }
}

/**
 * Rebuild the TF.js WebGL backend and segmenter from scratch after a GPU context
 * loss. The camera MediaStream survives minimize — only the GPU dies.
 */
async function recoverWebGLContext(): Promise<boolean> {
  if (_recovering) return false;
  _recovering = true;
  setStatus("Recovering GPU context…");
  try {
    if (segmenter) {
      try { segmenter.dispose(); } catch { /* may already be gone */ }
      segmenter = null;
    }

    try { tf.engine().reset(); } catch { /* best-effort */ }
    await tf.setBackend("webgl");
    await tf.ready();

    segmenter = await bodySegmentation.createSegmenter(
      bodySegmentation.SupportedModels.MediaPipeSelfieSegmentation,
      {
        runtime: "mediapipe",
        modelType: "landscape",
        solutionPath: MEDIAPIPE_SELFIE_URL,
      },
    );

    if (video && video.readyState >= 2) {
      try {
        await segmenter.segmentPeople(video, { flipHorizontal: false });
      } catch { /* warm-up best-effort */ }
    }

    setStatus("Running — recovered from GPU context loss.");
    _recovering = false;
    return true;
  } catch (err) {
    console.error("WebGL recovery failed:", err);
    setStatus(
      `Recovery failed: ${err instanceof Error ? err.message : String(err)}`,
      true,
    );
    _recovering = false;
    return false;
  }
}

function resizeCanvases(w: number, h: number) {
  output.width = w;
  output.height = h;
  personCanvas.width = w;
  personCanvas.height = h;
  maskCanvas.width = w;
  maskCanvas.height = h;
  maskScratchCanvas.width = w;
  maskScratchCanvas.height = h;
  blurredBgCanvas.width = w;
  blurredBgCanvas.height = h;
  prevMaskAlpha = null;
}

function resetMaskStabilizer() {
  prevMaskAlpha = null;
}

function fillPrevFromImageData(im: ImageData) {
  const n = im.width * im.height;
  if (!prevMaskAlpha || prevMaskAlpha.length !== n) {
    prevMaskAlpha = new Float32Array(n);
  }
  const d = im.data;
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    prevMaskAlpha[i] = d[p + 3]! / 255;
  }
}

/**
 * Exponential moving average on mask alpha to reduce frame-to-frame chatter.
 */
function temporalBlendMask(
  raw: ImageData,
  prev: Float32Array | null,
  prevWeight: number,
): { imageData: ImageData; nextAlpha: Float32Array } {
  const w = raw.width;
  const h = raw.height;
  const n = w * h;
  const src = raw.data;
  const out = new ImageData(w, h);
  const dst = out.data;
  const nextAlpha = new Float32Array(n);
  const cw = 1 - prevWeight;
  const hasPrev = prev !== null && prev.length === n;

  for (let i = 0, p = 0; i < n; i++, p += 4) {
    const cur = src[p + 3]! / 255;
    const old = hasPrev ? prev[i]! : cur;
    const sm = prevWeight * old + cw * cur;
    nextAlpha[i] = sm;
    const a = Math.max(0, Math.min(255, Math.round(sm * 255)));
    dst[p] = 255;
    dst[p + 1] = 255;
    dst[p + 2] = 255;
    dst[p + 3] = a;
  }
  return { imageData: out, nextAlpha };
}

/**
 * Builds `maskCanvas`: binary mask from the model, then temporal + feather smoothing.
 */
async function buildStabilizedMask(
  seg: Awaited<ReturnType<NonNullable<typeof segmenter>["segmentPeople"]>>,
  fgThreshold: number,
  w: number,
  h: number,
) {
  const raw = await bodySegmentation.toBinaryMask(
    seg,
    { r: 255, g: 255, b: 255, a: 255 },
    { r: 0, g: 0, b: 0, a: 0 },
    false,
    fgThreshold,
  );

  const stabilityPct = Number(stabilityInput.value);
  const prevW = stabilityPct / 100;

  let imageData: ImageData;
  if (prevW < 0.02) {
    imageData = raw;
    fillPrevFromImageData(raw);
  } else {
    const { imageData: blended, nextAlpha } = temporalBlendMask(
      raw,
      prevMaskAlpha,
      prevW,
    );
    prevMaskAlpha = nextAlpha;
    imageData = blended;
  }

  const sctx = maskScratchCanvas.getContext("2d")!;
  sctx.putImageData(imageData, 0, 0);

  const featherPx = Number(featherInput.value);
  const mctx = maskCanvas.getContext("2d")!;
  mctx.clearRect(0, 0, w, h);
  if (featherPx > 0) {
    mctx.filter = `blur(${featherPx}px)`;
    mctx.drawImage(maskScratchCanvas, 0, 0);
    mctx.filter = "none";
  } else {
    mctx.drawImage(maskScratchCanvas, 0, 0);
  }
}

/** Background blur using the same stabilized mask as replace mode. */
function drawBokehWithStabilizedMask(
  mirror: boolean,
  bgBlurPx: number,
) {
  const v = video!;
  const w = output.width;
  const h = output.height;

  const bctx = blurredBgCanvas.getContext("2d")!;
  bctx.clearRect(0, 0, w, h);
  bctx.filter = `blur(${bgBlurPx}px)`;
  bctx.drawImage(v, 0, 0, w, h);
  bctx.filter = "none";

  const ctx = output.getContext("2d")!;
  ctx.save();
  if (mirror) {
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(v, 0, 0, w, h);
  ctx.globalCompositeOperation = "destination-in";
  ctx.drawImage(maskCanvas, 0, 0, w, h);
  ctx.globalCompositeOperation = "destination-over";
  ctx.drawImage(blurredBgCanvas, 0, 0, w, h);
  ctx.globalCompositeOperation = "source-over";
  ctx.restore();
}

/** Scale image to cover the destination rectangle (like CSS object-fit: cover). */
function drawImageCover(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource,
  dw: number,
  dh: number,
) {
  const iw =
    img instanceof HTMLImageElement
      ? img.naturalWidth || img.width
      : img instanceof HTMLVideoElement
        ? img.videoWidth
        : (img as HTMLCanvasElement).width;
  const ih =
    img instanceof HTMLImageElement
      ? img.naturalHeight || img.height
      : img instanceof HTMLVideoElement
        ? img.videoHeight
        : (img as HTMLCanvasElement).height;
  if (iw < 1 || ih < 1) {
    return;
  }
  const scale = Math.max(dw / iw, dh / ih);
  const sw = dw / scale;
  const sh = dh / scale;
  const sx = (iw - sw) / 2;
  const sy = (ih - sh) / 2;
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, dw, dh);
}

async function drawReplace(
  ctx: CanvasRenderingContext2D,
  mirror: boolean,
  bgKind: "color" | "image",
) {
  const w = output.width;
  const h = output.height;

  const pctx = personCanvas.getContext("2d")!;
  pctx.clearRect(0, 0, w, h);
  /** Raw video + raw mask share the same pixel coordinates (no mirror here). */
  pctx.drawImage(video!, 0, 0, w, h);
  pctx.globalCompositeOperation = "destination-in";
  pctx.drawImage(maskCanvas, 0, 0, w, h);
  pctx.globalCompositeOperation = "source-over";

  const drawBackground = () => {
    if (
      bgKind === "image" &&
      backgroundImage &&
      backgroundImage.naturalWidth > 0
    ) {
      drawImageCover(ctx, backgroundImage, w, h);
    } else if (bgKind === "image") {
      ctx.fillStyle = "#1a1f2a";
      ctx.fillRect(0, 0, w, h);
    } else {
      ctx.fillStyle = bgColorInput.value;
      ctx.fillRect(0, 0, w, h);
    }
  };

  /** Mirror the full frame so background and person stay aligned (selfie preview). */
  if (mirror) {
    ctx.save();
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
    drawBackground();
    ctx.drawImage(personCanvas, 0, 0);
    ctx.restore();
  } else {
    drawBackground();
    ctx.drawImage(personCanvas, 0, 0);
  }
}

async function processFrame() {
  if (!cameraOn || !video || !segmenter || video.readyState < 2) {
    return;
  }

  const ctx = output.getContext("2d")!;
  const mirror = mirrorInput.checked;
  const fg = getForegroundThreshold();

  /**
   * Segment in sensor / bitmap space (flipHorizontal: false) so the mask lines up
   * with HTMLVideoElement pixels. Mirroring for a selfie preview is applied only
   * when drawing (see drawBokehWithStabilizedMask and drawReplace). Pairing segment flip
   * with draw flip caused the mask to slide opposite your movement.
   */
  const seg = await segmenter.segmentPeople(video, {
    flipHorizontal: false,
  });

  if (!seg?.length) {
    return;
  }

  const mode = getMode();
  const w = output.width;
  const h = output.height;

  await buildStabilizedMask(seg, fg, w, h);

  if (mode === "blur") {
    const bgBlur = Number(blurInput.value);
    drawBokehWithStabilizedMask(mirror, bgBlur);
  } else if (mode === "replaceColor") {
    await drawReplace(ctx, mirror, "color");
  } else {
    await drawReplace(ctx, mirror, "image");
  }
}

/**
 * Frame loop with automatic WebGL recovery.
 *
 * Visible  → rVFC / rAF (display-sync, smooth preview).
 * Hidden   → loop pauses (on Windows, minimize kills the GPU context anyway).
 * Restored → detects context loss, rebuilds TF.js + segmenter, resumes.
 */
function scheduleFrameLoop() {
  if (!cameraOn || !video) return;

  const v = video;
  let consecutiveErrors = 0;

  function stopLoop() {
    if (v.cancelVideoFrameCallback && vfcHandle) {
      v.cancelVideoFrameCallback(vfcHandle);
      vfcHandle = 0;
    }
    if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
  }

  const loop = async () => {
    if (!cameraOn || !v) return;

    if (v.paused) {
      try { await v.play(); } catch { /* ignore */ }
    }

    try {
      await processFrame();
      pushVirtualCamFrame();
      consecutiveErrors = 0;
    } catch {
      consecutiveErrors++;
      if (consecutiveErrors >= 3 && !_recovering) {
        const ok = await recoverWebGLContext();
        if (ok) consecutiveErrors = 0;
      }
    }

    if (!cameraOn || !video) return;
    if (typeof v.requestVideoFrameCallback === "function") {
      vfcHandle = v.requestVideoFrameCallback(() => void loop());
    } else {
      rafId = requestAnimationFrame(() => void loop());
    }
  };

  const onVisibilityChange = async () => {
    if (!cameraOn || !v) return;

    if (!document.hidden) {
      // Window restored — ensure the video is playing
      if (v.paused) {
        try { await v.play(); } catch { /* ignore */ }
      }

      // Check if the WebGL context survived the minimize
      if (!isWebGLAlive()) {
        await recoverWebGLContext();
      }

      // Restart the visible frame loop
      stopLoop();
      void loop();
    }
  };

  document.removeEventListener("visibilitychange", onVisibilityChange);
  document.addEventListener("visibilitychange", onVisibilityChange);

  stopLoop();
  if (typeof v.requestVideoFrameCallback === "function") {
    vfcHandle = v.requestVideoFrameCallback(() => void loop());
  } else {
    rafId = requestAnimationFrame(() => void loop());
  }
}

function pushVirtualCamFrame() {
  const api = window.akvcam;
  if (!virtualCamStreaming || !api) return;
  const w = output.width;
  const h = output.height;
  const need = w * h * 3;
  if (!rgbScratch || rgbScratch.length !== need) {
    rgbScratch = new Uint8Array(need);
  }
  const ctx = output.getContext("2d")!;
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0, j = 0; i < d.length; i += 4, j += 3) {
    rgbScratch[j] = d[i]!;
    rgbScratch[j + 1] = d[i + 1]!;
    rgbScratch[j + 2] = d[i + 2]!;
  }
  api.pushFrame(rgbScratch.buffer.slice(0, need) as ArrayBuffer);
}

function stopCamera() {
  cameraOn = false;
  virtualCamStreaming = false;
  if (akvcamToggle) {
    akvcamToggle.checked = false;
    akvcamToggle.disabled = true;
  }
  void window.akvcam?.stop();

  if (video && typeof video.cancelVideoFrameCallback === "function" && vfcHandle) {
    video.cancelVideoFrameCallback(vfcHandle);
    vfcHandle = 0;
  }
  cancelAnimationFrame(rafId);
  rafId = 0;

  if (stream) {
    for (const t of stream.getTracks()) {
      t.stop();
    }
    stream = null;
  }
  if (video) {
    video.srcObject = null;
    video.remove();
    video = null;
  }
  placeholder.classList.remove("hidden");
  toggleCam.textContent = "Start camera";
  resetMaskStabilizer();
}

toggleCam.addEventListener("click", async () => {
  if (cameraOn) {
    stopCamera();
    setStatus(segmenter ? "Camera stopped." : "Loading model…");
    return;
  }

  if (!segmenter) {
    setStatus("Model is still loading. Wait a moment.", true);
    return;
  }

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "user",
        width: { ideal: 960, max: 1280 },
        height: { ideal: 540, max: 720 },
        frameRate: { ideal: 30, max: 30 },
      },
      audio: false,
    });
  } catch (e) {
    setStatus(
      `Camera blocked or unavailable: ${e instanceof Error ? e.message : String(e)}`,
      true,
    );
    return;
  }

  video = document.createElement("video");
  video.playsInline = true;
  video.muted = true;
  video.srcObject = stream;
  await video.play();

  resizeCanvases(video.videoWidth, video.videoHeight);
  placeholder.classList.add("hidden");
  cameraOn = true;
  toggleCam.textContent = "Stop camera";
  if (akvcamToggle) akvcamToggle.disabled = false;
  setStatus(
    "Running — if your outline is wrong, adjust sensitivity or mirror setting.",
  );

  try {
    await segmenter.segmentPeople(video, { flipHorizontal: false });
  } catch {
    /* warm-up is best-effort */
  }

  scheduleFrameLoop();
});

const appSub = document.querySelector<HTMLParagraphElement>("#app-sub")!;
const previewObsToggle = document.querySelector<HTMLButtonElement>("#preview-obs-toggle")!;

if (navigator.userAgent.includes("Electron")) {
  appSub.textContent =
    "Desktop app — same processing as the browser, packaged with Electron.";
}

function setCleanPreview(on: boolean) {
  app.classList.toggle("clean-preview", on);
  previewObsToggle.setAttribute("aria-pressed", on ? "true" : "false");
  previewObsToggle.textContent = on ? "Show controls" : "Fill window";
  previewObsToggle.classList.toggle("preview-obs-toggle--exit", on);
  document.body.classList.toggle("clean-preview-active", on);
}

previewObsToggle.addEventListener("click", () => {
  setCleanPreview(!app.classList.contains("clean-preview"));
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && app.classList.contains("clean-preview")) {
    setCleanPreview(false);
  }
});

window.addEventListener("beforeunload", () => {
  akvcamUnsubStreamError?.();
  akvcamUnsubStreamError = undefined;
  stopCamera();
  segmenter?.dispose();
});

async function initAkvcamUi() {
  if (!akvcamPanel || !akvcamToggle || !akvcamStatusEl || !akvcamInstallBtn) return;
  if (!window.akvcam) return;
  akvcamPanel.classList.remove("hidden");
  const r = await window.akvcam.resolve();
  if (r.hasManager) {
    akvcamStatusEl.textContent =
      "AKVirtualCamera found. Start the camera, then enable streaming for other apps.";
  } else if (r.hasInstaller) {
    akvcamStatusEl.textContent =
      "Driver/tools not detected. Run the installer (needs admin), then restart this app.";
  } else {
    akvcamStatusEl.textContent =
      "Run npm run akvcam:fetch before building, or install AKVirtualCamera from GitHub.";
  }
  akvcamInstallBtn.addEventListener("click", () => {
    void window.akvcam!.openInstaller();
  });
  akvcamUnsubStreamError = window.akvcam.onStreamError((msg) => {
    virtualCamStreaming = false;
    if (akvcamToggle) akvcamToggle.checked = false;
    akvcamStatusEl.textContent = `Stream stopped (${msg}). Uncheck and enable again to retry.`;
    setStatus(`Virtual camera: ${msg}`, true);
  });
  akvcamToggle.addEventListener("change", async () => {
    if (!window.akvcam || !cameraOn) {
      akvcamToggle.checked = false;
      return;
    }
    if (akvcamToggle.checked) {
      const r2 = await window.akvcam.resolve();
      if (!r2.hasManager) {
        setStatus(
          "Install AKVirtualCamera first (button below), then restart this app.",
          true,
        );
        akvcamToggle.checked = false;
        return;
      }
      const res = await window.akvcam.start({
        width: output.width,
        height: output.height,
        fps: 30,
      });
      if (!res.ok) {
        setStatus(res.error ?? "Could not start virtual camera stream.", true);
        akvcamToggle.checked = false;
        return;
      }
      virtualCamStreaming = true;
    } else {
      virtualCamStreaming = false;
      await window.akvcam.stop();
    }
  });
}

void initAkvcamUi();
