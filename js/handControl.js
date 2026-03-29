import { HandLandmarker, FilesetResolver }
  from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18";

// Camera preview
const video = document.createElement('video');
video.playsInline = true;
video.muted = true;
Object.assign(video.style, {
  position: 'fixed', right: '16px', bottom: '16px',
  width: '200px', height: '150px', zIndex: '1000',
  borderRadius: '8px', transform: 'scaleX(-1)', objectFit: 'cover',
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
    video: { width: 160, height: 120, facingMode: "user" },
  });
  video.srcObject = stream;
  await video.play();

  let lastTime = -1;

  function loop() {
    const now = performance.now();
    if (video.currentTime !== lastTime) {
      lastTime = video.currentTime;
      const result = landmarker.detectForVideo(video, now);
      if (result.landmarks && result.landmarks.length > 0) {
        const lm = result.landmarks[0];
        // Palm centre Y only — X axis is not hand-controlled
        const py = (lm[0].y + lm[9].y) * 0.5;
        const rawY = 1 - py * 2;  // invert Y → range [-1, 1]
        // Light jitter filter (α=0.78) — absorbs sensor noise without adding lag
        if (typeof window.mousePos !== 'undefined') {
          window.mousePos.y += (rawY - window.mousePos.y) * 0.78;
        }
      }
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}

init().catch(err => console.error("[HandControl]", err));
