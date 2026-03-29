const SignatureSystem = (function () {
  var overlay = null;
  var canvas = null;
  var ctx = null;
  var timerLabel = null;
  var summaryLabel = null;
  var hintLabel = null;
  var clearBtn = null;
  var saveBtn = null;

  var isActive = false;
  var rafId = 0;
  var countdownMs = 10000;
  var startTime = 0;
  var lastSample = null;
  var smoothPoint = null;
  var score = 0;
  var level = 1;
  var didSave = false;

  function createUi() {
    overlay = document.createElement("div");
    overlay.id = "signatureOverlay";
    Object.assign(overlay.style, {
      position: "fixed",
      inset: "0",
      zIndex: "1100",
      backgroundColor: "#ffffff",
      display: "flex",
      flexDirection: "column",
    });

    var topBar = document.createElement("div");
    Object.assign(topBar.style, {
      padding: "14px 20px",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      borderBottom: "1px solid #e7e7e7",
      fontFamily: "Arial, sans-serif",
    });

    summaryLabel = document.createElement("div");
    summaryLabel.style.fontWeight = "700";

    timerLabel = document.createElement("div");
    Object.assign(timerLabel.style, {
      fontWeight: "700",
      color: "#f25346",
      marginLeft: "12px",
    });

    var rightBar = document.createElement("div");
    Object.assign(rightBar.style, {
      display: "flex",
      alignItems: "center",
      gap: "8px",
    });

    clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.textContent = "Clear";
    clearBtn.addEventListener("click", clearCanvas, false);

    saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.textContent = "Save now";
    saveBtn.addEventListener("click", function () {
      saveResultImage();
      stop();
    }, false);

    [clearBtn, saveBtn].forEach(function (btn) {
      Object.assign(btn.style, {
        border: "0",
        borderRadius: "8px",
        padding: "8px 12px",
        cursor: "pointer",
        backgroundColor: "#68c3c0",
        color: "#fff",
        fontWeight: "700",
      });
    });

    rightBar.appendChild(timerLabel);
    rightBar.appendChild(clearBtn);
    rightBar.appendChild(saveBtn);

    topBar.appendChild(summaryLabel);
    topBar.appendChild(rightBar);

    hintLabel = document.createElement("div");
    hintLabel.textContent = "Draw your signature in the air";
    Object.assign(hintLabel.style, {
      textAlign: "center",
      padding: "10px 12px",
      fontFamily: "Arial, sans-serif",
      color: "#404040",
    });

    canvas = document.createElement("canvas");
    Object.assign(canvas.style, {
      width: "100%",
      height: "100%",
      touchAction: "none",
      cursor: "crosshair",
      flex: "1",
      display: "block",
    });

    overlay.appendChild(topBar);
    overlay.appendChild(hintLabel);
    overlay.appendChild(canvas);
    document.body.appendChild(overlay);

    ctx = canvas.getContext("2d");
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas, false);

    // Mouse fallback input
    canvas.addEventListener("mousedown", onMouseDown, false);
    window.addEventListener("mousemove", onMouseMove, false);
    window.addEventListener("mouseup", onMouseUp, false);
  }

  function destroyUi() {
    if (!overlay) return;
    window.removeEventListener("resize", resizeCanvas, false);
    canvas.removeEventListener("mousedown", onMouseDown, false);
    window.removeEventListener("mousemove", onMouseMove, false);
    window.removeEventListener("mouseup", onMouseUp, false);
    overlay.remove();
    overlay = null;
    canvas = null;
    ctx = null;
  }

  function resizeCanvas() {
    if (!canvas || !ctx) return;
    var prev = null;
    try {
      prev = ctx.getImageData(0, 0, canvas.width, canvas.height);
    } catch (err) {
      prev = null;
    }
    canvas.width = Math.max(1, Math.floor(window.innerWidth * window.devicePixelRatio));
    canvas.height = Math.max(1, Math.floor((window.innerHeight - 80) * window.devicePixelRatio));
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    clearCanvas();
    if (prev) {
      // Best effort transfer when resizing; keeps user signature if possible.
      try {
        ctx.putImageData(prev, 0, 0);
      } catch (err2) {}
    }
  }

  function clearCanvas() {
    if (!ctx || !canvas) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    lastSample = null;
    smoothPoint = null;
  }

  function getDrawPoint() {
    if (!canvas) return null;

    if (window.controlMode === "hand") {
      var hp = window.handPointer;
      if (!hp || !hp.active) {
        return null;
      }

      var x = hp.x * (canvas.width / window.devicePixelRatio);
      var y = hp.y * (canvas.height / window.devicePixelRatio);
      return { x: x, y: y, fromHand: true };
    }

    if (mouseState.down) {
      return { x: mouseState.x, y: mouseState.y, fromHand: false };
    }

    return null;
  }

  function drawFrame() {
    if (!isActive) return;

    var now = performance.now();
    var elapsed = now - startTime;
    var remaining = Math.max(0, countdownMs - elapsed);
    timerLabel.textContent = "Auto save: " + (remaining / 1000).toFixed(1) + "s";

    var point = getDrawPoint();
    if (!point) {
      lastSample = null;
      smoothPoint = null;
    } else {
      if (!smoothPoint) {
        smoothPoint = { x: point.x, y: point.y };
      } else {
        smoothPoint.x += (point.x - smoothPoint.x) * 0.35;
        smoothPoint.y += (point.y - smoothPoint.y) * 0.35;
      }

      if (!lastSample) {
        lastSample = { x: smoothPoint.x, y: smoothPoint.y, t: now };
      } else {
        var dx = smoothPoint.x - lastSample.x;
        var dy = smoothPoint.y - lastSample.y;
        var dist = Math.sqrt(dx * dx + dy * dy);
        var dt = Math.max(1, now - lastSample.t);
        var speed = dist / dt;
        var lineWidth = Math.max(2, Math.min(8, 8 - speed * 12));

        ctx.strokeStyle = "#111111";
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.lineWidth = lineWidth;
        ctx.beginPath();
        ctx.moveTo(lastSample.x, lastSample.y);
        ctx.lineTo(smoothPoint.x, smoothPoint.y);
        ctx.stroke();

        lastSample = { x: smoothPoint.x, y: smoothPoint.y, t: now };
      }
    }

    if (remaining <= 0 && !didSave) {
      saveResultImage();
      stop();
      return;
    }

    rafId = requestAnimationFrame(drawFrame);
  }

  function saveResultImage() {
    if (!canvas || didSave) return;
    didSave = true;

    var exportCanvas = document.createElement("canvas");
    exportCanvas.width = canvas.width;
    exportCanvas.height = canvas.height + Math.floor(90 * window.devicePixelRatio);
    var ectx = exportCanvas.getContext("2d");

    ectx.fillStyle = "#ffffff";
    ectx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
    ectx.drawImage(canvas, 0, Math.floor(90 * window.devicePixelRatio));

    ectx.fillStyle = "#111111";
    ectx.font = (24 * window.devicePixelRatio) + "px Arial";
    ectx.fillText(
      "Score: " + score + " | Level: " + level,
      24 * window.devicePixelRatio,
      52 * window.devicePixelRatio
    );

    var stamp = Date.now();
    var filename = "flygame_score_" + score + "_" + stamp + ".png";
    var dataUrl = exportCanvas.toDataURL("image/png");

    var a = document.createElement("a");
    a.href = dataUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  var mouseState = { down: false, x: 0, y: 0 };

  function onMouseDown(e) {
    if (!isActive || window.controlMode !== "mouse") return;
    mouseState.down = true;
    var rect = canvas.getBoundingClientRect();
    mouseState.x = e.clientX - rect.left;
    mouseState.y = e.clientY - rect.top;
  }

  function onMouseMove(e) {
    if (!isActive || !mouseState.down || window.controlMode !== "mouse") return;
    var rect = canvas.getBoundingClientRect();
    mouseState.x = e.clientX - rect.left;
    mouseState.y = e.clientY - rect.top;
  }

  function onMouseUp() {
    mouseState.down = false;
    if (window.controlMode === "mouse") {
      lastSample = null;
      smoothPoint = null;
    }
  }

  function start(options) {
    if (isActive) return;
    score = options.score || 0;
    level = options.level || 1;
    isActive = true;
    didSave = false;
    createUi();
    summaryLabel.textContent = "Score: " + score + " | Level: " + level;
    clearCanvas();
    startTime = performance.now();
    rafId = requestAnimationFrame(drawFrame);
  }

  function stop() {
    isActive = false;
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
    destroyUi();
  }

  return {
    start: start,
    stop: stop,
    isActive: function () {
      return isActive;
    },
  };
})();

window.SignatureSystem = SignatureSystem;
