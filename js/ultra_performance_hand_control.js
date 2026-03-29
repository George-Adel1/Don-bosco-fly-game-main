import { HandLandmarker, FilesetResolver }
  from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18";

// Camera preview (GPU-promoted for smoother compositor updates)
const video = document.createElement("video");
video.playsInline = true;
video.muted = true;
Object.assign(video.style, {
  position: "fixed",
  right: "16px",
  bottom: "16px",
  width: "200px",
  height: "150px",
  zIndex: "1000",
  borderRadius: "8px",
  objectFit: "cover",
  transform: "translate3d(0, 0, 0) scaleX(-1)",
  willChange: "transform",
  backfaceVisibility: "hidden",
});
document.body.appendChild(video);

async function init() {
  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm"
  );

  const landmarker = await HandLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
      delegate: "GPU",
    },
    runningMode: "VIDEO",
    numHands: 1,
  });

  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      width: { ideal: 320 },
      height: { ideal: 240 },
      frameRate: { ideal: 60, max: 60 },
      facingMode: "user",
    },
    audio: false,
  });

  video.srcObject = stream;
  await video.play();

  if (typeof window.mousePos === "undefined") {
    window.mousePos = { x: 0, y: 0 };
  }
  if (typeof window.handPointer === "undefined") {
    window.handPointer = { x: 0.5, y: 0.5, active: false };
  }

  // Shared state from detector -> renderer
  const handState = {
    hasHand: false,
    rawY: 0,
    velY: 0,
    lastUpdate: performance.now(),
  };

  // Double-buffered output positions to avoid per-frame object churn.
  const buffers = [{ y: 0 }, { y: 0 }];
  let writeIndex = 0;
  let readIndex = 1;

  const FILTER_ALPHA = 0.72;
  const PREDICTION_GAIN = 0.3; // Lead by 30% of estimated motion

  // Detection loop: runs as soon as new video frames arrive.
  function detectFrame() {
    const now = performance.now();
    if (window.controlMode === "mouse") {
      handState.hasHand = false;
      window.handPointer.active = false;
      if ("requestVideoFrameCallback" in video) {
        video.requestVideoFrameCallback(detectFrame);
      } else {
        requestAnimationFrame(detectFrame);
      }
      return;
    }

    const result = landmarker.detectForVideo(video, now);

    if (result.landmarks && result.landmarks.length > 0) {
      const lm = result.landmarks[0];
      const palmY = (lm[0].y + lm[9].y) * 0.5;
      const mappedY = 1 - palmY * 2; // [-1, 1], inverted
      const indexTip = lm[8];

      const dt = Math.max(1, now - handState.lastUpdate);
      const vel = (mappedY - handState.rawY) / dt;

      handState.rawY = mappedY;
      handState.velY = vel;
      handState.lastUpdate = now;
      handState.hasHand = true;
      window.handPointer.x = Math.max(0, Math.min(1, 1 - indexTip.x));
      window.handPointer.y = Math.max(0, Math.min(1, indexTip.y));
      window.handPointer.active = true;
    } else {
      handState.hasHand = false;
      window.handPointer.active = false;
    }

    if ("requestVideoFrameCallback" in video) {
      video.requestVideoFrameCallback(detectFrame);
    } else {
      requestAnimationFrame(detectFrame);
    }
  }

  if ("requestVideoFrameCallback" in video) {
    video.requestVideoFrameCallback(detectFrame);
  } else {
    requestAnimationFrame(detectFrame);
  }

  // Render loop: fixed 60Hz updates, independent from detector cadence.
  const FRAME_MS = 1000 / 60;
  let accumulator = 0;
  let lastTick = performance.now();
  let smoothY = 0;

  function renderLoop(now) {
    video.style.opacity = window.controlMode === "mouse" ? "0.35" : "1";
    accumulator += now - lastTick;
    lastTick = now;

    while (accumulator >= FRAME_MS) {
      accumulator -= FRAME_MS;

      if (handState.hasHand) {
        // Predictive tracking: extrapolate slightly forward for lower felt latency.
        const predictedY = handState.rawY + handState.velY * FRAME_MS * PREDICTION_GAIN;
        const clampedY = Math.max(-1, Math.min(1, predictedY));
        smoothY += (clampedY - smoothY) * FILTER_ALPHA;
      } else {
        smoothY += (0 - smoothY) * 0.12;
      }

      buffers[writeIndex].y = smoothY;
      const temp = readIndex;
      readIndex = writeIndex;
      writeIndex = temp;
    }

    window.mousePos.y = buffers[readIndex].y;
    requestAnimationFrame(renderLoop);
  }

  requestAnimationFrame(renderLoop);
}

init().catch((err) => console.error("[UltraHandControl]", err));
