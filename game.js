/* =====================================================================
   SYLHET HIGHWAY — a top-down Bangladeshi village road racer
   Pure canvas. No dependencies. Works offline.
   ===================================================================== */
(() => {
  "use strict";

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  const el = {
    score: document.getElementById("score"),
    hudBest: document.getElementById("hudBest"),
    speedVal: document.getElementById("speedVal"),
    menuBest: document.getElementById("menuBest"),
    finalScore: document.getElementById("finalScore"),
    finalBest: document.getElementById("finalBest"),
    crashText: document.getElementById("crashText"),
    overlay: document.getElementById("overlay"),
    menuScreen: document.getElementById("menuScreen"),
    overScreen: document.getElementById("overScreen"),
    pauseScreen: document.getElementById("pauseScreen"),
    startBtn: document.getElementById("startBtn"),
    restartBtn: document.getElementById("restartBtn"),
    resumeBtn: document.getElementById("resumeBtn"),
    pauseBtn: document.getElementById("pauseBtn"),
    soundBtn: document.getElementById("soundBtn"),
    leftBtn: document.getElementById("leftBtn"),
    rightBtn: document.getElementById("rightBtn"),
  };

  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
  const mod = (n, m) => ((n % m) + m) % m;

  // Deterministic random for roadside scenery.
  let seed = 7331;
  const srand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  // ------------------------------- layout -------------------------------
  let W = 0,
    H = 0,
    DPR = 1;
  let roadX = 0,
    roadW = 0,
    laneW = 0,
    playerY = 0;
  let groundGrad, roadGrad;
  let asphaltPattern = null;
  let scenery = [];
  const SCENERY_PERIOD = 2400;

  const bike = { w: 34, h: 80 };
  const player = {
    lane: 1,
    x: 0,
    vx: 0,
    lean: 0,
    angle: 0,
    angleVel: 0,
    dead: false,
  };

  const state = {
    mode: "menu", // menu | playing | paused | crash | over
    score: 0,
    best: loadBest(),
    speed: 360,
    targetSpeed: 360,
    scroll: 0,
    elapsed: 0,
    spawnTimer: 0.7,
    level: 1,
    time: 0,
    shake: 0,
    flash: 0,
    crashTimer: 0,
    crashKind: "",
    streakAcc: 0,
    dustAcc: 0,
    hornTimer: 5,
    lastScoreShown: -1,
    lastSpeedShown: -1,
    demoTimer: 1.2,
  };

  const vehicles = [];
  const particles = [];
  const floats = [];
  const streaks = [];

  let soundOn = true;

  function loadBest() {
    try {
      return parseInt(localStorage.getItem("sylhet-highway-best") || "0", 10) || 0;
    } catch (_) {
      return 0;
    }
  }
  function saveBest(v) {
    try {
      localStorage.setItem("sylhet-highway-best", String(v));
    } catch (_) {
      /* private mode */
    }
  }

  function laneX(i) {
    return roadX + laneW * (i + 0.5);
  }

  function resize() {
    W = window.innerWidth;
    H = window.innerHeight;
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

    const side = clamp(W * 0.075, 16, 92);
    roadW = Math.min(W - side * 2, 740);
    roadX = (W - roadW) / 2;
    laneW = roadW / 4;
    playerY = H - Math.max(115, H * 0.18);
    bike.w = laneW * 0.36;
    bike.h = laneW * 0.94;

    player.x = clamp(player.x || laneX(1), roadX + bike.w * 0.5, roadX + roadW - bike.w * 0.5);

    // Cached backgrounds.
    groundGrad = ctx.createLinearGradient(0, 0, 0, H);
    groundGrad.addColorStop(0, "#3f8138");
    groundGrad.addColorStop(0.45, "#4d963f");
    groundGrad.addColorStop(1, "#3a7a32");

    roadGrad = ctx.createLinearGradient(roadX, 0, roadX + roadW, 0);
    roadGrad.addColorStop(0, "#393e42");
    roadGrad.addColorStop(0.45, "#454b4f");
    roadGrad.addColorStop(0.55, "#464c50");
    roadGrad.addColorStop(1, "#373c40");

    buildScenery();
  }

  // ------------------------------- scenery ------------------------------
  function buildScenery() {
    seed = 7331;
    scenery = [];
    const wide = roadX;
    for (const side of [-1, 1]) {
      let y = srand() * 260 - 130;
      while (y < SCENERY_PERIOD) {
        const r = srand();
        let type = "grass";
        if (r < 0.24) type = "tree";
        else if (r < 0.42) type = "palm";
        else if (r < 0.62) type = "grass";
        else if (r < 0.73) type = "pole";
        else if (r < 0.83 && wide > 110) type = "hut";
        else if (r < 0.91 && wide > 66) type = "pond";
        else if (wide > 62) type = "paddy";

        scenery.push({
          side,
          y,
          type,
          depth: type === "pole" ? srand() * 0.16 : 0.12 + srand() * 0.82,
          v: srand(),
          phase: srand() * TAU,
        });
        y += 58 + srand() * 150;
      }
    }
  }

  function scenerySize(item) {
    const s = laneW;
    const maxW = Math.max(10, roadX * 0.86);
    let size;
    switch (item.type) {
      case "tree":
        size = s * (0.18 + item.v * 0.11);
        break;
      case "palm":
        size = s * (0.17 + item.v * 0.09);
        break;
      case "hut":
        size = Math.min(s * (0.95 + item.v * 0.5), maxW);
        break;
      case "pond":
        size = Math.min(s * (1.9 + item.v * 0.9), maxW * 1.25);
        break;
      case "paddy":
        size = Math.min(s * (1.6 + item.v * 0.7), maxW * 1.1);
        break;
      case "pole":
        size = s * 0.16;
        break;
      default:
        size = s * (0.09 + item.v * 0.06);
    }
    return Math.max(3, size);
  }

  function drawScenery(t) {
    const off = mod(state.scroll * 0.92, SCENERY_PERIOD);
    for (const item of scenery) {
      let y = mod(item.y - off, SCENERY_PERIOD);
      if (y < -260 || y > H + 260) continue;
      drawSceneryItem(item, y, t);
    }
  }

  function drawSceneryItem(item, y, t) {
    const size = scenerySize(item);
    const sideW = roadX;
    const pad = 7;
    const spread = Math.max(0, sideW - pad * 2 - size);
    const dist = pad + size * 0.5 + item.depth * spread;
    const x = item.side < 0 ? roadX - dist : roadX + roadW + dist;

    switch (item.type) {
      case "tree":
        drawTree(x, y, size, item.v);
        break;
      case "palm":
        drawPalm(x, y, size, item.v, t, item.phase);
        break;
      case "hut":
        drawHut(x, y, size, item.v);
        break;
      case "pond":
        drawPond(x, y, size, item.v, item.phase);
        break;
      case "paddy":
        drawPaddy(x, y, size, item.v);
        break;
      case "pole":
        drawFlagPole(x, y, size, t, item.phase, item.side);
        break;
      default:
        drawGrassTuft(x, y, size, item.v);
    }
  }

  function drawTree(x, y, r, v) {
    ctx.save();
    ctx.fillStyle = "rgba(8,38,18,.25)";
    ctx.beginPath();
    ctx.ellipse(x + r * 0.28, y + r * 0.38, r * 0.98, r * 0.58, 0.2, 0, TAU);
    ctx.fill();

    const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.08, x, y, r);
    g.addColorStop(0, v > 0.5 ? "#8fce63" : "#7fc45c");
    g.addColorStop(0.55, "#4f9d40");
    g.addColorStop(1, "#2c6c2c");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();

    ctx.fillStyle = "rgba(22,68,26,.45)";
    ctx.beginPath();
    ctx.arc(x + r * 0.34, y + r * 0.28, r * 0.52, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.12)";
    ctx.beginPath();
    ctx.arc(x - r * 0.3, y - r * 0.34, r * 0.4, 0, TAU);
    ctx.fill();

    if (v > 0.78) {
      ctx.fillStyle = "#f0b93c";
      for (let i = 0; i < 4; i++) {
        const a = v * 9 + i * 1.7;
        ctx.beginPath();
        ctx.arc(x + Math.cos(a) * r * 0.6, y + Math.sin(a) * r * 0.6, r * 0.06, 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function drawPalm(x, y, r, v, t, phase) {
    ctx.save();
    ctx.fillStyle = "rgba(8,38,18,.23)";
    ctx.beginPath();
    ctx.ellipse(x + r * 0.45, y + r * 0.4, r * 1.1, r * 0.5, 0.3, 0, TAU);
    ctx.fill();

    const sway = Math.sin(t * 1.3 + phase) * 0.06;
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU + sway + v * 2;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a);
      const g = ctx.createLinearGradient(0, 0, r * 1.15, 0);
      g.addColorStop(0, "#2f7d34");
      g.addColorStop(1, "#6bb448");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(r * 0.6, -r * 0.3, r * 1.18, 0);
      ctx.quadraticCurveTo(r * 0.6, r * 0.3, 0, 0);
      ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = "#6b4b26";
    ctx.beginPath();
    ctx.arc(x, y, r * 0.19, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#b98a45";
    ctx.beginPath();
    ctx.arc(x - r * 0.04, y - r * 0.04, r * 0.08, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function drawHut(x, y, size, v) {
    const w = size;
    const h = size * (0.58 + v * 0.06);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((v - 0.5) * 0.16);

    ctx.fillStyle = "rgba(8,38,18,.25)";
    pathRound(-w / 2 + 8, -h / 2 + 10, w, h, 7);
    ctx.fill();

    // small dirt yard
    ctx.fillStyle = "rgba(160,127,77,.42)";
    pathRound(-w * 0.58, -h * 0.56, w * 1.16, h * 1.16, 10);
    ctx.fill();

    const g = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
    g.addColorStop(0, "#c9d0cc");
    g.addColorStop(0.5, "#9da9a5");
    g.addColorStop(1, "#778480");
    ctx.fillStyle = g;
    pathRound(-w / 2, -h / 2, w, h, 5);
    ctx.fill();
    ctx.strokeStyle = "rgba(40,54,48,.5)";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // corrugated tin roof
    ctx.strokeStyle = "rgba(60,74,68,.34)";
    ctx.lineWidth = Math.max(1, w * 0.015);
    for (let i = 1; i < 12; i++) {
      const lx = -w / 2 + (w / 12) * i;
      ctx.beginPath();
      ctx.moveTo(lx, -h / 2 + 2);
      ctx.lineTo(lx, h / 2 - 2);
      ctx.stroke();
    }
    ctx.strokeStyle = "rgba(60,74,68,.55)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-w / 2 + 2, 0);
    ctx.lineTo(w / 2 - 2, 0);
    ctx.stroke();

    // little red flag on the roof
    ctx.fillStyle = "#5a4630";
    ctx.fillRect(w * 0.3, -h * 0.5 - h * 0.22, 2, h * 0.24);
    ctx.fillStyle = "#006a4e";
    ctx.fillRect(w * 0.3 + 2, -h * 0.5 - h * 0.22, w * 0.15, h * 0.12);
    ctx.fillStyle = "#f42a41";
    ctx.beginPath();
    ctx.arc(w * 0.3 + 2 + w * 0.045, -h * 0.5 - h * 0.16, w * 0.028, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function drawPond(x, y, size, v, phase) {
    const w = size;
    const h = size * (0.52 + v * 0.16);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((v - 0.5) * 0.2);
    ctx.fillStyle = "rgba(120,150,60,.5)";
    ctx.beginPath();
    ctx.ellipse(0, 0, w / 2 + 4, h / 2 + 4, 0, 0, TAU);
    ctx.fill();

    const g = ctx.createRadialGradient(-w * 0.15, -h * 0.18, 2, 0, 0, w * 0.55);
    g.addColorStop(0, "#7fc7cf");
    g.addColorStop(0.6, "#3f95a7");
    g.addColorStop(1, "#246d83");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, TAU);
    ctx.fill();

    ctx.strokeStyle = "rgba(255,255,255,.28)";
    ctx.lineWidth = 1.5;
    const ph = Math.sin(phase) * 0.3;
    ctx.beginPath();
    ctx.ellipse(-w * 0.08, -h * 0.1, w * 0.22, h * 0.14, ph, 0.4, 2.4);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(w * 0.18, h * 0.12, w * 0.12, h * 0.08, -ph, 0.2, 2.8);
    ctx.stroke();

    // lily pads
    ctx.fillStyle = "rgba(74,148,62,.85)";
    for (let i = 0; i < 3; i++) {
      const a = phase + i * 2.2;
      ctx.beginPath();
      ctx.ellipse(Math.cos(a) * w * 0.28, Math.sin(a) * h * 0.22, w * 0.045, h * 0.06, a, 0, TAU);
      ctx.fill();
    }
    if (v > 0.45) {
      ctx.fillStyle = "#f6c9d0";
      ctx.beginPath();
      ctx.arc(w * 0.26, -h * 0.2, Math.max(1.5, w * 0.018), 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawPaddy(x, y, size, v) {
    const w = size;
    const h = size * (0.5 + v * 0.18);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((v - 0.5) * 0.1);
    ctx.fillStyle = "rgba(94,70,40,.5)";
    pathRound(-w / 2 - 3, -h / 2 - 3, w + 6, h + 6, 3);
    ctx.fill();
    ctx.fillStyle = v > 0.5 ? "#75b540" : "#68a93b";
    pathRound(-w / 2, -h / 2, w, h, 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(45,105,35,.55)";
    ctx.lineWidth = Math.max(1, w * 0.008);
    const rows = Math.max(4, Math.floor(h / 10));
    for (let i = 1; i < rows; i++) {
      const ly = -h / 2 + (h / rows) * i;
      ctx.beginPath();
      ctx.moveTo(-w / 2 + 3, ly);
      ctx.lineTo(w / 2 - 3, ly);
      ctx.stroke();
    }
    if (v > 0.7) {
      ctx.fillStyle = "rgba(255,220,100,.7)";
      for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        ctx.arc(rand(-w * 0.4, w * 0.4), rand(-h * 0.4, h * 0.4), 1.2, 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function drawFlagPole(x, y, size, t, phase, side) {
    const h = size * 7.5;
    ctx.save();
    ctx.fillStyle = "rgba(8,38,18,.22)";
    ctx.beginPath();
    ctx.ellipse(x + 7, y + 3, size * 0.9, size * 0.4, 0, 0, TAU);
    ctx.fill();

    ctx.strokeStyle = "#6d5434";
    ctx.lineWidth = Math.max(2, size * 0.32);
    ctx.beginPath();
    ctx.moveTo(x, y + 4);
    ctx.lineTo(x, y - h);
    ctx.stroke();

    const wave = Math.sin(t * 3.2 + phase) * h * 0.1;
    const fw = h * 0.58;
    const fh = h * 0.34;
    const dir = side < 0 ? 1 : -1;
    const top = y - h;
    ctx.translate(x, top);
    if (dir < 0) ctx.scale(-1, 1);
    ctx.fillStyle = "#006a4e";
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(fw * 0.5, wave * 0.4, fw, wave);
    ctx.lineTo(fw, fh + wave);
    ctx.quadraticCurveTo(fw * 0.5, fh + wave * 0.3, 0, fh);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#f42a41";
    ctx.beginPath();
    ctx.arc(fw * 0.4, fh * 0.5 + wave * 0.7, fh * 0.26, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function drawGrassTuft(x, y, size, v) {
    ctx.save();
    ctx.strokeStyle = v > 0.5 ? "rgba(38,104,46,.55)" : "rgba(30,88,38,.45)";
    ctx.lineWidth = Math.max(1, size * 0.16);
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(x + i * size * 0.28, y + size * 0.35);
      ctx.quadraticCurveTo(
        x + i * size * 0.4,
        y - size * 0.1,
        x + i * size * 0.62 + (v - 0.5) * size,
        y - size * 0.5
      );
      ctx.stroke();
    }
    ctx.restore();
  }

  // --------------------------- drawing helpers --------------------------
  function pathRound(x, y, w, h, r) {
    r = Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function circle(x, y, r) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
  }

  function ellipse(x, y, rx, ry, rot = 0) {
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, rot, 0, TAU);
    ctx.fill();
  }

  // ------------------------------ vehicles ------------------------------
  const BUS_PALETTES = [
    { body: "#b23a33", roof: "#e9e2d3", trim: "#f2c94c" },
    { body: "#1d7a4a", roof: "#f0ead9", trim: "#f2994a" },
    { body: "#265f92", roof: "#eef1f4", trim: "#f2c94c" },
    { body: "#bf6a20", roof: "#f3ecdc", trim: "#0f7a4a" },
  ];
  const TOMTOM_PALETTES = [
    { body: "#1f7fa8", roof: "#f2f6f5", trim: "#ef7d32" },
    { body: "#2b8a5a", roof: "#f6f1df", trim: "#f2c94c" },
    { body: "#b73b52", roof: "#f8efe2", trim: "#f2c94c" },
  ];
  const RICKSHAW_PALETTES = [
    { body: "#b42f3c", trim: "#f5c542", inner: "#0b7a4b" },
    { body: "#1c7d4e", trim: "#f2c94c", inner: "#b42f3c" },
    { body: "#2b5f9e", trim: "#f5c542", inner: "#c8452f" },
    { body: "#8c3f8f", trim: "#f2c94c", inner: "#0b7a4b" },
  ];

  function vehicleLabel(type) {
    return type === "cng" ? "CNG" : type === "tomtom" ? "TomTom" : type === "bus" ? "BUS" : "RICKSHAW";
  }

  function drawVehicle(v, t) {
    ctx.save();
    ctx.translate(v.x, v.y);
    const sway = Math.sin(v.sway + t * 1.6) * 0.006;
    ctx.rotate(sway);

    switch (v.type) {
      case "bus":
        drawBus(v);
        break;
      case "cng":
        drawCng(v);
        break;
      case "tomtom":
        drawTomtom(v);
        break;
      default:
        drawRickshaw(v);
    }
    ctx.restore();
  }

  function drawHeadlightGlow(w, l, strength) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const g = ctx.createRadialGradient(0, l * 0.56, 0, 0, l * 0.56, w * 1.4);
    g.addColorStop(0, `rgba(255,240,175,${0.16 * strength})`);
    g.addColorStop(0.6, `rgba(255,235,160,${0.06 * strength})`);
    g.addColorStop(1, "rgba(255,235,160,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, l * 0.6, w * 0.9, l * 0.42, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function drawBus(v) {
    const w = v.w,
      l = v.l;
    const c = v.palette;

    ctx.fillStyle = "rgba(0,0,0,.28)";
    pathRound(-w / 2 + 7, -l / 2 + 9, w, l, w * 0.1);
    ctx.fill();

    // wheels
    ctx.fillStyle = "#15181a";
    for (const sx of [-1, 1]) {
      for (const sy of [-0.28, 0.26]) {
        pathRound(sx * w * 0.47 - w * 0.045, sy * l - l * 0.06, w * 0.09, l * 0.12, w * 0.03);
        ctx.fill();
      }
    }

    drawHeadlightGlow(w, l, 1);

    // body
    const bg = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
    bg.addColorStop(0, "rgba(0,0,0,.22)");
    bg.addColorStop(0.25, "rgba(255,255,255,.08)");
    bg.addColorStop(0.75, "rgba(255,255,255,.05)");
    bg.addColorStop(1, "rgba(0,0,0,.25)");
    ctx.fillStyle = c.body;
    pathRound(-w / 2, -l / 2, w, l, w * 0.11);
    ctx.fill();
    ctx.fillStyle = bg;
    pathRound(-w / 2, -l / 2, w, l, w * 0.11);
    ctx.fill();
    ctx.strokeStyle = "rgba(15,20,18,.5)";
    ctx.lineWidth = 2;
    ctx.stroke();

    // roof panel
    const rx = -w * 0.33,
      ry = -l * 0.44,
      rw = w * 0.66,
      rh = l * 0.7;
    const rg = ctx.createLinearGradient(0, ry, 0, ry + rh);
    rg.addColorStop(0, c.roof);
    rg.addColorStop(1, "rgba(190,185,170,.9)");
    ctx.fillStyle = rg;
    pathRound(rx, ry, rw, rh, w * 0.06);
    ctx.fill();
    ctx.strokeStyle = "rgba(60,60,55,.25)";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // roof ribs
    ctx.strokeStyle = "rgba(70,70,62,.16)";
    ctx.lineWidth = 1;
    for (let i = 1; i < 7; i++) {
      const yy = ry + (rh / 7) * i;
      ctx.beginPath();
      ctx.moveTo(rx + 3, yy);
      ctx.lineTo(rx + rw - 3, yy);
      ctx.stroke();
    }

    // side window strips
    ctx.fillStyle = "rgba(27,45,55,.82)";
    for (let i = 0; i < 5; i++) {
      const wy = -l * 0.35 + i * l * 0.115;
      pathRound(-w * 0.465, wy, w * 0.055, l * 0.085, 2);
      ctx.fill();
      pathRound(w * 0.41, wy, w * 0.055, l * 0.085, 2);
      ctx.fill();
    }

    // colored roof stripe
    ctx.fillStyle = c.trim;
    pathRound(rx + rw * 0.12, -l * 0.5 + l * 0.025, rw * 0.76, l * 0.018, 2);
    ctx.fill();
    pathRound(rx + rw * 0.12, ry + rh - l * 0.012, rw * 0.76, l * 0.018, 2);
    ctx.fill();

    // front destination board
    ctx.fillStyle = "#f6ecd2";
    pathRound(-w * 0.24, l * 0.14, w * 0.48, l * 0.055, 2);
    ctx.fill();
    ctx.fillStyle = "#22332c";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `900 ${Math.max(5, Math.min(11, w * 0.1))}px Lato, Arial, sans-serif`;
    ctx.fillText("SYLHET", 0, l * 0.168);

    // windshield
    const wg = ctx.createLinearGradient(0, l * 0.22, 0, l * 0.4);
    wg.addColorStop(0, "#2d4b57");
    wg.addColorStop(1, "#152a34");
    ctx.fillStyle = wg;
    pathRound(-w * 0.32, l * 0.22, w * 0.64, l * 0.17, w * 0.04);
    ctx.fill();
    ctx.strokeStyle = "rgba(240,240,230,.3)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.strokeStyle = "rgba(240,240,230,.16)";
    ctx.beginPath();
    ctx.moveTo(0, l * 0.22);
    ctx.lineTo(0, l * 0.39);
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,.14)";
    pathRound(-w * 0.28, l * 0.245, w * 0.22, l * 0.03, 1);
    ctx.fill();

    // bumper + headlights
    ctx.fillStyle = "rgba(25,28,28,.75)";
    pathRound(-w * 0.41, l * 0.44, w * 0.82, l * 0.035, 2);
    ctx.fill();
    ctx.fillStyle = "#ffe8a3";
    circle(-w * 0.3, l * 0.44, w * 0.055);
    circle(w * 0.3, l * 0.44, w * 0.055);
    ctx.fillStyle = "rgba(255,255,255,.75)";
    circle(-w * 0.3, l * 0.435, w * 0.022);
    circle(w * 0.3, l * 0.435, w * 0.022);

    // mirrors
    ctx.fillStyle = "#252b2b";
    ctx.fillRect(-w * 0.55, l * 0.28, w * 0.09, l * 0.012);
    ctx.fillRect(w * 0.46, l * 0.28, w * 0.09, l * 0.012);

    // roof text
    if (w > 60) {
      ctx.fillStyle = "rgba(40,60,52,.4)";
      ctx.font = `900 ${w * 0.095}px Lato, Arial, sans-serif`;
      ctx.fillText("BANGLADESH", 0, ry + rh * 0.46);
    }
  }

  function drawCng(v) {
    const w = v.w,
      l = v.l;

    ctx.fillStyle = "rgba(0,0,0,.27)";
    pathRound(-w / 2 + 6, -l / 2 + 7, w, l, w * 0.22);
    ctx.fill();

    // wheels
    ctx.fillStyle = "#15181a";
    pathRound(-w * 0.49, -l * 0.27, w * 0.1, l * 0.12, w * 0.04);
    ctx.fill();
    pathRound(w * 0.39, -l * 0.27, w * 0.1, l * 0.12, w * 0.04);
    ctx.fill();
    pathRound(-w * 0.08, l * 0.3, w * 0.16, l * 0.14, w * 0.05);
    ctx.fill();

    drawHeadlightGlow(w, l, 0.9);

    // body
    const bg = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
    bg.addColorStop(0, "#0a6e3e");
    bg.addColorStop(0.35, "#159a53");
    bg.addColorStop(0.7, "#0d8849");
    bg.addColorStop(1, "#075c33");
    ctx.fillStyle = bg;
    pathRound(-w / 2, -l / 2, w, l, w * 0.24);
    ctx.fill();
    ctx.strokeStyle = "rgba(5,50,28,.8)";
    ctx.lineWidth = 2;
    ctx.stroke();

    // front cowl
    ctx.fillStyle = "rgba(4,88,46,.95)";
    pathRound(-w * 0.44, l * 0.12, w * 0.88, l * 0.34, w * 0.16);
    ctx.fill();

    // windshield
    const wg = ctx.createLinearGradient(0, l * 0.16, 0, l * 0.34);
    wg.addColorStop(0, "#3b6471");
    wg.addColorStop(1, "#11262e");
    ctx.fillStyle = wg;
    pathRound(-w * 0.34, l * 0.16, w * 0.68, l * 0.16, w * 0.06);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,.22)";
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // yellow canopy
    const cg = ctx.createLinearGradient(0, -l * 0.42, 0, l * 0.16);
    cg.addColorStop(0, "#ffd84d");
    cg.addColorStop(0.55, "#f2bf25");
    cg.addColorStop(1, "#d9a012");
    ctx.fillStyle = cg;
    pathRound(-w * 0.37, -l * 0.4, w * 0.74, l * 0.52, w * 0.2);
    ctx.fill();
    ctx.strokeStyle = "rgba(90,60,5,.55)";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // canopy inset + green trim
    ctx.strokeStyle = "rgba(9,104,54,.9)";
    ctx.lineWidth = 2;
    pathRound(-w * 0.3, -l * 0.33, w * 0.6, l * 0.38, w * 0.15);
    ctx.stroke();

    if (w > 42) {
      ctx.fillStyle = "rgba(60,50,10,.82)";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `900 ${w * 0.2}px Lato, Arial, sans-serif`;
      ctx.fillText("CNG", 0, -l * 0.14);
    }

    // headlight + plate
    ctx.fillStyle = "#fff0ad";
    circle(0, l * 0.4, w * 0.075);
    ctx.fillStyle = "rgba(255,255,255,.8)";
    circle(0, l * 0.395, w * 0.028);
    ctx.fillStyle = "#f4f1e1";
    pathRound(-w * 0.11, l * 0.44, w * 0.22, l * 0.035, 1);
    ctx.fill();

    // mirrors
    ctx.fillStyle = "#1d2924";
    ctx.fillRect(-w * 0.56, l * 0.22, w * 0.12, l * 0.01);
    ctx.fillRect(w * 0.44, l * 0.22, w * 0.12, l * 0.01);

    // little roof highlight
    ctx.fillStyle = "rgba(255,255,255,.16)";
    pathRound(-w * 0.28, -l * 0.36, w * 0.28, l * 0.08, w * 0.1);
    ctx.fill();
  }

  function drawTomtom(v) {
    const w = v.w,
      l = v.l;
    const c = v.palette;

    ctx.fillStyle = "rgba(0,0,0,.27)";
    pathRound(-w / 2 + 6, -l / 2 + 8, w, l, w * 0.16);
    ctx.fill();

    ctx.fillStyle = "#15181a";
    for (const sx of [-1, 1]) {
      pathRound(sx * w * 0.47 - w * 0.045, -l * 0.32, w * 0.09, l * 0.1, w * 0.03);
      ctx.fill();
      pathRound(sx * w * 0.47 - w * 0.045, l * 0.22, w * 0.09, l * 0.1, w * 0.03);
      ctx.fill();
    }

    drawHeadlightGlow(w, l, 0.8);

    const bg = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
    bg.addColorStop(0, "rgba(0,0,0,.25)");
    bg.addColorStop(0.3, c.body);
    bg.addColorStop(0.75, c.body);
    bg.addColorStop(1, "rgba(0,0,0,.28)");
    ctx.fillStyle = bg;
    pathRound(-w / 2, -l / 2, w, l, w * 0.16);
    ctx.fill();
    ctx.strokeStyle = "rgba(13,35,44,.65)";
    ctx.lineWidth = 2;
    ctx.stroke();

    // canopy roof
    const rg = ctx.createLinearGradient(0, -l * 0.4, 0, l * 0.18);
    rg.addColorStop(0, "#ffffff");
    rg.addColorStop(0.6, c.roof);
    rg.addColorStop(1, "#d9d9cc");
    ctx.fillStyle = rg;
    pathRound(-w * 0.36, -l * 0.38, w * 0.72, l * 0.5, w * 0.12);
    ctx.fill();
    ctx.strokeStyle = "rgba(30,50,50,.45)";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // trim stripe
    ctx.fillStyle = c.trim;
    pathRound(-w * 0.36, -l * 0.37, w * 0.72, l * 0.035, 2);
    ctx.fill();
    pathRound(-w * 0.36, l * 0.09, w * 0.72, l * 0.03, 2);
    ctx.fill();

    // windshield
    const wg = ctx.createLinearGradient(0, l * 0.16, 0, l * 0.35);
    wg.addColorStop(0, "#3c6572");
    wg.addColorStop(1, "#132932");
    ctx.fillStyle = wg;
    pathRound(-w * 0.36, l * 0.16, w * 0.72, l * 0.17, w * 0.04);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,.25)";
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // roof lettering
    if (w > 40) {
      ctx.fillStyle = "rgba(30,60,72,.72)";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `900 ${Math.max(5, w * 0.115)}px Lato, Arial, sans-serif`;
      ctx.fillText("TomTom", 0, -l * 0.16);
    }

    // lights & plate
    ctx.fillStyle = "#ffeaa8";
    circle(-w * 0.28, l * 0.4, w * 0.055);
    circle(w * 0.28, l * 0.4, w * 0.055);
    ctx.fillStyle = "#f2efdf";
    pathRound(-w * 0.1, l * 0.445, w * 0.2, l * 0.03, 1);
    ctx.fill();

    // mirror stalks
    ctx.fillStyle = "#203036";
    ctx.fillRect(-w * 0.54, l * 0.22, w * 0.1, l * 0.01);
    ctx.fillRect(w * 0.44, l * 0.22, w * 0.1, l * 0.01);
  }

  function drawRickshaw(v) {
    const w = v.w,
      l = v.l;
    const c = v.palette;

    ctx.fillStyle = "rgba(0,0,0,.27)";
    pathRound(-w / 2 + 5, -l / 2 + 7, w, l, w * 0.28);
    ctx.fill();

    // wheels
    ctx.fillStyle = "#171a1b";
    pathRound(-w * 0.53, -l * 0.24, w * 0.08, l * 0.2, w * 0.03);
    ctx.fill();
    pathRound(w * 0.45, -l * 0.24, w * 0.08, l * 0.2, w * 0.03);
    ctx.fill();
    pathRound(-w * 0.055, l * 0.42, w * 0.11, l * 0.13, w * 0.06);
    ctx.fill();

    // canopy
    const rg = ctx.createLinearGradient(0, -l / 2, 0, l * 0.2);
    rg.addColorStop(0, c.body);
    rg.addColorStop(1, "rgba(0,0,0,.35)");
    ctx.fillStyle = c.body;
    pathRound(-w / 2, -l / 2, w, l * 0.72, w * 0.3);
    ctx.fill();
    ctx.strokeStyle = "rgba(50,15,15,.45)";
    ctx.lineWidth = 2;
    ctx.stroke();

    // inner canopy
    ctx.fillStyle = c.inner;
    pathRound(-w * 0.36, -l * 0.41, w * 0.72, l * 0.5, w * 0.22);
    ctx.fill();

    // canopy ribs + scalloped fringe
    ctx.strokeStyle = "rgba(255,255,255,.15)";
    ctx.lineWidth = 1;
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(i * w * 0.13, -l * 0.39);
      ctx.lineTo(i * w * 0.13, l * 0.05);
      ctx.stroke();
    }

    ctx.strokeStyle = c.trim;
    ctx.lineWidth = Math.max(1.5, w * 0.035);
    pathRound(-w * 0.42, -l * 0.44, w * 0.84, l * 0.56, w * 0.24);
    ctx.stroke();

    ctx.fillStyle = c.trim;
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI * 0.86 + (i / 5) * Math.PI * 0.72;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * w * 0.5, Math.sin(a) * l * 0.36 - l * 0.02, w * 0.055, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = "rgba(255,255,255,.7)";
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.arc((i - 2) * w * 0.14, -l * 0.44, w * 0.028, 0, TAU);
      ctx.fill();
    }

    // driver bench / hood
    ctx.fillStyle = "rgba(14,52,38,.95)";
    pathRound(-w * 0.38, l * 0.2, w * 0.76, l * 0.22, w * 0.1);
    ctx.fill();
    ctx.fillStyle = "#0d2c21";
    pathRound(-w * 0.3, l * 0.13, w * 0.6, l * 0.08, w * 0.06);
    ctx.fill();

    // tiny driver
    ctx.fillStyle = "#e8d3b0";
    circle(0, l * 0.12, w * 0.13);
    ctx.fillStyle = "#0c6e43";
    pathRound(-w * 0.19, l * 0.155, w * 0.38, l * 0.12, w * 0.06);
    ctx.fill();

    // handlebars
    ctx.strokeStyle = "#2c2a26";
    ctx.lineWidth = Math.max(2, w * 0.045);
    ctx.beginPath();
    ctx.moveTo(-w * 0.32, l * 0.33);
    ctx.lineTo(w * 0.32, l * 0.33);
    ctx.stroke();

    // front lamp
    ctx.fillStyle = "#ffeaa8";
    circle(0, l * 0.38, w * 0.05);
  }

  // ------------------------------- player -------------------------------
  function drawPlayer(t) {
    const bob = state.mode === "playing" ? Math.sin(t * 11) * 1.2 : Math.sin(t * 3) * 0.6;
    const w = bike.w,
      h = bike.h;
    ctx.save();
    ctx.translate(player.x, playerY + bob);
    ctx.rotate(player.lean + player.angle);

    // shadow
    ctx.fillStyle = "rgba(0,0,0,.3)";
    ellipse(3, 4, w * 0.44, h * 0.42);

    // wheels
    ctx.fillStyle = "#141617";
    pathRound(-w * 0.13, -h * 0.46, w * 0.26, h * 0.22, w * 0.1);
    ctx.fill();
    pathRound(-w * 0.15, h * 0.25, w * 0.3, h * 0.2, w * 0.1);
    ctx.fill();
    ctx.fillStyle = "#4d5456";
    ctx.fillRect(-w * 0.03, -h * 0.43, w * 0.06, h * 0.15);
    ctx.fillRect(-w * 0.03, h * 0.28, w * 0.06, h * 0.13);

    // exhaust
    ctx.strokeStyle = "#b8c1c4";
    ctx.lineWidth = Math.max(1.5, w * 0.07);
    ctx.beginPath();
    ctx.moveTo(w * 0.24, h * 0.08);
    ctx.lineTo(w * 0.27, h * 0.4);
    ctx.stroke();

    // frame / body
    const bg = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
    bg.addColorStop(0, "#a50f1c");
    bg.addColorStop(0.5, "#e63946");
    bg.addColorStop(1, "#8d0a15");
    ctx.fillStyle = bg;
    pathRound(-w * 0.3, -h * 0.22, w * 0.6, h * 0.5, w * 0.14);
    ctx.fill();

    // front cowl
    ctx.fillStyle = "#c9202e";
    pathRound(-w * 0.26, -h * 0.37, w * 0.52, h * 0.19, w * 0.12);
    ctx.fill();

    // handlebar
    ctx.strokeStyle = "#26292a";
    ctx.lineWidth = Math.max(2, w * 0.09);
    ctx.beginPath();
    ctx.moveTo(-w * 0.55, -h * 0.24);
    ctx.lineTo(w * 0.55, -h * 0.24);
    ctx.stroke();
    ctx.fillStyle = "#111313";
    circle(-w * 0.55, -h * 0.24, w * 0.075);
    circle(w * 0.55, -h * 0.24, w * 0.075);

    // headlamp
    ctx.fillStyle = "#fff4c2";
    circle(0, -h * 0.42, w * 0.1);
    ctx.fillStyle = "rgba(255,255,255,.9)";
    circle(0, -h * 0.425, w * 0.04);

    // tail light
    ctx.fillStyle = "#ff5252";
    pathRound(-w * 0.12, h * 0.42, w * 0.24, h * 0.035, 2);
    ctx.fill();

    // rider legs
    ctx.fillStyle = "#143b2c";
    ellipse(-w * 0.26, h * 0.03, w * 0.12, h * 0.12);
    ellipse(w * 0.26, h * 0.03, w * 0.12, h * 0.12);

    // rider torso
    const tg = ctx.createLinearGradient(-w * 0.4, 0, w * 0.4, 0);
    tg.addColorStop(0, "#087a4a");
    tg.addColorStop(0.5, "#12a05f");
    tg.addColorStop(1, "#06603a");
    ctx.fillStyle = tg;
    ellipse(0, h * 0.02, w * 0.4, h * 0.21);

    // arms
    ctx.strokeStyle = "#0b8450";
    ctx.lineWidth = Math.max(2.5, w * 0.1);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-w * 0.25, -h * 0.04);
    ctx.lineTo(-w * 0.5, -h * 0.21);
    ctx.moveTo(w * 0.25, -h * 0.04);
    ctx.lineTo(w * 0.5, -h * 0.21);
    ctx.stroke();

    // helmet
    const hg = ctx.createRadialGradient(-w * 0.1, -h * 0.13, 1, 0, -h * 0.09, w * 0.35);
    hg.addColorStop(0, "#ff5b63");
    hg.addColorStop(0.55, "#e21f2f");
    hg.addColorStop(1, "#9e0f1b");
    ctx.fillStyle = hg;
    circle(0, -h * 0.09, w * 0.33);
    ctx.strokeStyle = "rgba(70,5,10,.35)";
    ctx.lineWidth = 1;
    ctx.stroke();
    // visor
    ctx.strokeStyle = "#2b3238";
    ctx.lineWidth = Math.max(2, w * 0.08);
    ctx.beginPath();
    ctx.arc(0, -h * 0.094, w * 0.23, -Math.PI * 0.82, -Math.PI * 0.18);
    ctx.stroke();
    // flag-green shoulder flash
    ctx.fillStyle = "rgba(255,247,230,.85)";
    pathRound(-w * 0.09, -h * 0.02, w * 0.18, h * 0.035, 2);
    ctx.fill();

    ctx.restore();
  }

  // ---------------------------- ground & road ---------------------------
  function drawGround(t) {
    ctx.fillStyle = groundGrad;
    ctx.fillRect(0, 0, W, H);

    const bandH = 190;
    const off = mod(state.scroll * 0.55, bandH * 2);
    ctx.fillStyle = "rgba(255,241,160,.035)";
    for (let y = -bandH * 2 + off; y < H + bandH; y += bandH * 2) {
      ctx.fillRect(0, y, W, bandH);
    }

    // faint field furrows on the shoulders
    ctx.strokeStyle = "rgba(22,78,30,.16)";
    ctx.lineWidth = 1;
    const furrowGap = 34;
    const foff = mod(state.scroll * 0.55, furrowGap);
    for (let y = -furrowGap + foff; y < H + furrowGap; y += furrowGap) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(Math.max(0, roadX - 16), y + 7);
      ctx.moveTo(Math.min(W, roadX + roadW + 16), y + 4);
      ctx.lineTo(W, y - 3);
      ctx.stroke();
    }
  }

  function drawRoad(t) {
    // dirt shoulders
    ctx.fillStyle = "#7c6542";
    ctx.fillRect(roadX - 9, 0, 9, H);
    ctx.fillRect(roadX + roadW, 0, 9, H);
    ctx.fillStyle = "rgba(30,24,15,.22)";
    ctx.fillRect(roadX - 2, 0, 2, H);
    ctx.fillRect(roadX + roadW, 0, 2, H);

    // asphalt
    ctx.fillStyle = roadGrad;
    ctx.fillRect(roadX, 0, roadW, H);

    ctx.save();
    ctx.beginPath();
    ctx.rect(roadX, 0, roadW, H);
    ctx.clip();
    ctx.translate(0, mod(state.scroll, 220));
    if (asphaltPattern) {
      ctx.fillStyle = asphaltPattern;
      ctx.fillRect(roadX, -220, roadW, H + 440);
    }
    ctx.restore();

    // tire tracks
    ctx.fillStyle = "rgba(10,12,12,.07)";
    for (let i = 0; i < 4; i++) {
      const x = laneX(i);
      ctx.fillRect(x - laneW * 0.26, 0, laneW * 0.15, H);
      ctx.fillRect(x + laneW * 0.11, 0, laneW * 0.15, H);
    }

    // lane markings
    const lw = Math.max(3, laneW * 0.032);
    const dash = laneW * 0.34;
    const gap = laneW * 0.28;
    ctx.strokeStyle = "rgba(246,243,230,.82)";
    ctx.lineWidth = lw;
    ctx.lineCap = "butt";
    ctx.setLineDash([dash, gap]);
    ctx.lineDashOffset = -mod(state.scroll, dash + gap);
    for (const i of [1, 3]) {
      const x = roadX + laneW * i;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // centre double yellow
    ctx.strokeStyle = "rgba(238,190,74,.9)";
    ctx.lineWidth = Math.max(2, laneW * 0.02);
    for (const dx of [-laneW * 0.045, laneW * 0.045]) {
      const x = roadX + laneW * 2 + dx;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }

    // solid edge lines
    ctx.strokeStyle = "rgba(246,243,230,.9)";
    ctx.lineWidth = Math.max(2.5, laneW * 0.026);
    for (const x of [roadX + laneW * 0.055, roadX + roadW - laneW * 0.055]) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }

    // edge rumble strips
    const seg = Math.max(12, laneW * 0.15);
    const rOff = mod(state.scroll, seg * 2);
    for (let y = -seg * 2 + rOff; y < H + seg; y += seg * 2) {
      ctx.fillStyle = "rgba(214,69,61,.7)";
      ctx.fillRect(roadX + 2, y, Math.max(3, laneW * 0.02), seg);
      ctx.fillRect(roadX + roadW - 2 - Math.max(3, laneW * 0.02), y + seg, Math.max(3, laneW * 0.02), seg);
    }

    // occasional road patch
    const patchOff = mod(state.scroll * 1, 900);
    ctx.fillStyle = "rgba(15,17,17,.12)";
    for (let i = 0; i < 3; i++) {
      const py = mod(i * 337 - patchOff, 900) - 120;
      const px = roadX + laneW * (0.6 + i * 1.2);
      ctx.beginPath();
      ctx.ellipse(px, py, laneW * 0.22, laneW * 0.12, i, 0, TAU);
      ctx.fill();
    }
  }

  // ------------------------------- effects ------------------------------
  function drawStreaks() {
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,.22)";
    ctx.lineWidth = 1.4;
    for (const s of streaks) {
      ctx.globalAlpha = s.a;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(s.x, s.y + s.len);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawParticles() {
    for (const p of particles) {
      const a = clamp(p.life / p.max, 0, 1);
      ctx.globalAlpha = a * p.alpha;
      ctx.fillStyle = p.color;
      if (p.kind === "smoke") {
        const r = p.size * (1.8 - a * 0.8);
        circle(p.x, p.y, r);
      } else {
        circle(p.x, p.y, p.size);
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawFloats() {
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const f of floats) {
      const a = clamp(f.life / f.max, 0, 1);
      ctx.globalAlpha = a;
      ctx.font = `900 ${f.size}px Lato, Arial, sans-serif`;
      ctx.fillStyle = "rgba(0,0,0,.35)";
      ctx.fillText(f.text, f.x + 1, f.y + 2);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  // -------------------------------- audio --------------------------------
  const Sound = {
    ctx: null,
    master: null,
    engine: null,
    init() {
      if (this.ctx) {
        if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
        return;
      }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try {
        const ac = new AC();
        this.ctx = ac;
        const master = ac.createGain();
        master.gain.value = soundOn ? 0.85 : 0;
        master.connect(ac.destination);
        this.master = master;

        const gain = ac.createGain();
        gain.gain.value = 0;
        gain.connect(master);

        const filter = ac.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.value = 300;
        filter.Q.value = 1.5;
        filter.connect(gain);

        const o1 = ac.createOscillator();
        o1.type = "sawtooth";
        o1.frequency.value = 54;
        const o2 = ac.createOscillator();
        o2.type = "square";
        o2.frequency.value = 41;
        const o2g = ac.createGain();
        o2g.gain.value = 0.45;

        o1.connect(filter);
        o2.connect(o2g);
        o2g.connect(filter);
        o1.start();
        o2.start();
        this.engine = { gain, filter, o1, o2 };
      } catch (_) {
        this.ctx = null;
      }
    },
    startEngine() {
      this.init();
      if (!this.ctx || !this.engine) return;
      if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
      const now = this.ctx.currentTime;
      this.engine.gain.gain.cancelScheduledValues(now);
      this.engine.gain.gain.setTargetAtTime(0.026, now, 0.25);
    },
    stopEngine(quick) {
      if (!this.ctx || !this.engine) return;
      const now = this.ctx.currentTime;
      this.engine.gain.gain.cancelScheduledValues(now);
      this.engine.gain.gain.setTargetAtTime(0, now, quick ? 0.03 : 0.18);
    },
    setSpeed(px) {
      if (!this.ctx || !this.engine) return;
      const now = this.ctx.currentTime;
      const f = 40 + px * 0.038;
      this.engine.o1.frequency.setTargetAtTime(f, now, 0.18);
      this.engine.o2.frequency.setTargetAtTime(f * 0.76, now, 0.18);
      this.engine.filter.frequency.setTargetAtTime(220 + px * 0.45, now, 0.2);
      this.engine.gain.gain.setTargetAtTime(0.024 + px * 0.000016, now, 0.25);
    },
    crash() {
      this.init();
      if (!this.ctx) return;
      const ac = this.ctx;
      const now = ac.currentTime;

      const dur = 0.8;
      const buffer = ac.createBuffer(1, Math.floor(ac.sampleRate * dur), ac.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 2.2);
      }
      const src = ac.createBufferSource();
      src.buffer = buffer;
      const filt = ac.createBiquadFilter();
      filt.type = "lowpass";
      filt.frequency.value = 1700;
      const g = ac.createGain();
      g.gain.setValueAtTime(0.55, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + dur);
      src.connect(filt);
      filt.connect(g);
      g.connect(this.master);
      src.start(now);

      const osc = ac.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(95, now);
      osc.frequency.exponentialRampToValueAtTime(32, now + 0.45);
      const og = ac.createGain();
      og.gain.setValueAtTime(0.5, now);
      og.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
      osc.connect(og);
      og.connect(this.master);
      osc.start(now);
      osc.stop(now + 0.6);
    },
    horn() {
      if (!this.ctx || !soundOn) return;
      const ac = this.ctx;
      const now = ac.currentTime;
      [0, 0.26].forEach((delay) => {
        [349, 440].forEach((freq) => {
          const o = ac.createOscillator();
          o.type = "square";
          o.frequency.value = freq;
          const g = ac.createGain();
          g.gain.setValueAtTime(0.0001, now + delay);
          g.gain.linearRampToValueAtTime(0.035, now + delay + 0.02);
          g.gain.setValueAtTime(0.035, now + delay + 0.13);
          g.gain.exponentialRampToValueAtTime(0.0001, now + delay + 0.19);
          o.connect(g);
          g.connect(this.master);
          o.start(now + delay);
          o.stop(now + delay + 0.22);
        });
      });
    },
    toggle() {
      soundOn = !soundOn;
      if (this.ctx && this.master) {
        const now = this.ctx.currentTime;
        this.master.gain.cancelScheduledValues(now);
        this.master.gain.setTargetAtTime(soundOn ? 0.85 : 0, now, 0.05);
      }
      updateSoundBtn();
    },
  };

  function updateSoundBtn() {
    el.soundBtn.classList.toggle("muted", !soundOn);
    el.soundBtn.setAttribute("aria-label", soundOn ? "Mute sound" : "Unmute sound");
  }

  // ------------------------------ spawning ------------------------------
  const TYPE_DIMS = {
    bus: { wf: 0.82, lf: 2.5, on: [95, 145] },
    cng: { wf: 0.76, lf: 1.32, on: [140, 205] },
    tomtom: { wf: 0.74, lf: 1.52, on: [150, 215] },
    rickshaw: { wf: 0.64, lf: 1.3, on: [85, 145] },
  };

  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  function pickVehicleType() {
    const r = Math.random();
    if (r < 0.29) return "cng";
    if (r < 0.55) return "rickshaw";
    if (r < 0.82) return "tomtom";
    return "bus";
  }

  function spawnVehicle(lane, forcedType) {
    const type = forcedType || pickVehicleType();
    const d = TYPE_DIMS[type];
    const w = laneW * d.wf;
    const l = laneW * d.lf;
    let palette = null;
    if (type === "bus") palette = pick(BUS_PALETTES);
    else if (type === "tomtom") palette = pick(TOMTOM_PALETTES);
    else if (type === "rickshaw") palette = pick(RICKSHAW_PALETTES);

    const v = {
      type,
      lane,
      w,
      l,
      x: laneX(lane) + rand(-laneW * 0.035, laneW * 0.035),
      y: -l / 2 - rand(20, 55),
      sway: rand(0, TAU),
      onSpeed: rand(d.on[0], d.on[1]),
      palette,
      passed: false,
    };
    vehicles.push(v);
    return v;
  }

  function shuffled(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function spawnWave() {
    const level = state.level;
    const r = Math.random();
    let count;
    if (level < 3) count = r < 0.82 ? 1 : 2;
    else if (level < 6) count = r < 0.52 ? 1 : 2;
    else count = r < 0.3 ? 1 : r < 0.82 ? 2 : 3;

    const lanes = shuffled([0, 1, 2, 3]).slice(0, count);
    lanes.forEach((lane, i) => {
      const v = spawnVehicle(lane);
      v.y -= i * rand(laneW * 0.35, laneW * 0.9);
    });
  }

  function updateVehicles(dt, slow) {
    for (let i = vehicles.length - 1; i >= 0; i--) {
      const v = vehicles[i];
      const factor = slow ? 0.14 : 1;
      v.y += (state.speed + v.onSpeed * factor) * dt;
      v.sway += dt * 1.7;

      if (!v.passed && v.y - v.l * 0.5 > playerY + bike.h * 0.5) {
        v.passed = true;
        if (state.mode === "playing") {
          const dx = Math.abs(v.x - player.x);
          if (dx < laneW * 1.02) {
            const pts = dx < laneW * 0.7 ? 30 : 15;
            state.score += pts;
            addFloat(
              "+" + pts + (pts > 20 ? "  CLOSE!" : "  NEAR MISS"),
              player.x,
              playerY - 52,
              "#ffcf4a",
              0.85,
              Math.max(11, laneW * 0.085)
            );
          }
        }
      }

      if (v.y - v.l * 0.5 > H + 140) vehicles.splice(i, 1);
    }
  }

  // ------------------------------- effects ------------------------------
  function addFloat(text, x, y, color, life, size) {
    floats.push({ text, x, y, color, life, max: life, size, vy: -48 });
  }

  function spawnDust(dt) {
    if (state.mode !== "playing") return;
    state.dustAcc += dt;
    const rate = 0.07;
    if (state.dustAcc < rate) return;
    state.dustAcc = 0;
    particles.push({
      x: player.x + rand(-bike.w * 0.28, bike.w * 0.28),
      y: playerY + bike.h * 0.4,
      vx: rand(-22, 22),
      vy: rand(30, 90) + state.speed * 0.18,
      life: rand(0.25, 0.48),
      max: 0.48,
      size: rand(1.3, 3),
      color: "#cfc7ab",
      alpha: 0.26,
      kind: "dust",
    });
  }

  function spawnCrashParticles() {
    for (let i = 0; i < 56; i++) {
      const spark = i < 24;
      const life = spark ? rand(0.3, 0.8) : rand(0.5, 1.3);
      particles.push({
        x: player.x + rand(-bike.w * 0.5, bike.w * 0.5),
        y: playerY + rand(-bike.h * 0.4, bike.h * 0.4),
        vx: rand(-300, 300),
        vy: rand(-340, 140),
        life,
        max: life,
        size: spark ? rand(1.2, 3) : rand(4, 10),
        color: spark ? (Math.random() < 0.5 ? "#ffd166" : "#ff7a3d") : "#6f716b",
        alpha: spark ? 0.95 : 0.4,
        kind: spark ? "spark" : "smoke",
      });
    }
  }

  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.985;
      p.vy += (p.kind === "smoke" ? -18 : 220) * dt;
      if (p.kind === "smoke") p.size += dt * 9;
    }
    if (particles.length > 260) particles.splice(0, particles.length - 260);
  }

  function updateFloats(dt) {
    for (let i = floats.length - 1; i >= 0; i--) {
      const f = floats[i];
      f.life -= dt;
      f.y += f.vy * dt;
      if (f.life <= 0) floats.splice(i, 1);
    }
  }

  function updateStreaks(dt, factor = 1) {
    const rate = (state.speed / 78) * factor;
    state.streakAcc += rate * dt;
    while (state.streakAcc >= 1) {
      state.streakAcc -= 1;
      streaks.push({
        x: rand(roadX + laneW * 0.2, roadX + roadW - laneW * 0.2),
        y: rand(-120, -20),
        len: rand(25, 80),
        a: rand(0.04, 0.13),
      });
    }
    for (let i = streaks.length - 1; i >= 0; i--) {
      const s = streaks[i];
      s.y += state.speed * 1.45 * dt;
      if (s.y > H + 120) streaks.splice(i, 1);
    }
  }

  // ------------------------------ game flow -----------------------------
  function resetRun() {
    vehicles.length = 0;
    particles.length = 0;
    floats.length = 0;
    streaks.length = 0;
    state.score = 0;
    state.speed = 370;
    state.targetSpeed = 370;
    state.scroll = 0;
    state.elapsed = 0;
    state.spawnTimer = 0.7;
    state.level = 1;
    state.crashTimer = 0;
    state.crashKind = "";
    state.shake = 0;
    state.flash = 0;
    state.streakAcc = 0;
    state.dustAcc = 0;
    state.hornTimer = rand(5, 9);
    state.lastScoreShown = -1;
    state.lastSpeedShown = -1;
    player.lane = 1;
    player.x = laneX(1);
    player.vx = 0;
    player.lean = 0;
    player.angle = 0;
    player.angleVel = 0;
    player.dead = false;
    updateHud(true);
  }

  function startGame() {
    Sound.init();
    Sound.startEngine();
    resetRun();
    state.mode = "playing";
    document.body.dataset.state = "playing";
    hideOverlay();
  }

  function endRun() {
    if (state.mode === "over") return;
    state.mode = "over";
    document.body.dataset.state = "over";
    if (state.score > state.best) {
      state.best = Math.floor(state.score);
      saveBest(state.best);
    }
    Sound.stopEngine(true);

    const labels = {
      bus: "A speeding bus ended the ride.",
      cng: "A CNG caught you napping.",
      tomtom: "A TomTom took you out.",
      rickshaw: "A rickshaw clipped your handlebars.",
    };
    el.crashText.textContent = labels[state.crashKind] || "The village rush got you.";
    el.finalScore.textContent = Math.floor(state.score);
    el.finalBest.textContent = state.best;
    el.menuBest.textContent = state.best;
    el.hudBest.textContent = state.best;
    showScreen("overScreen");
  }

  function crash(v) {
    if (state.mode !== "playing") return;
    state.mode = "crash";
    state.crashTimer = 0;
    state.crashKind = v.type;
    state.shake = 28;
    state.flash = 1;
    player.dead = true;
    player.angleVel = rand(4, 8) * (Math.random() < 0.5 ? -1 : 1);
    Sound.crash();
    Sound.stopEngine(true);
    spawnCrashParticles();
    addFloat("CRASH!", W / 2, playerY - 100, "#ff5b63", 1.2, Math.max(26, laneW * 0.2));
  }

  function checkCollisions() {
    const bw = bike.w * 0.34;
    const bh = bike.h * 0.42;
    for (const v of vehicles) {
      if (
        Math.abs(v.x - player.x) < v.w * 0.37 + bw &&
        Math.abs(v.y - playerY) < v.l * 0.44 + bh
      ) {
        crash(v);
        break;
      }
    }
  }

  function togglePause() {
    if (state.mode === "playing") {
      state.mode = "paused";
      document.body.dataset.state = "paused";
      Sound.stopEngine();
      showScreen("pauseScreen");
    } else if (state.mode === "paused") {
      state.mode = "playing";
      document.body.dataset.state = "playing";
      Sound.startEngine();
      Sound.setSpeed(state.speed);
      hideOverlay();
    }
  }

  function showScreen(id) {
    el.overlay.classList.remove("hidden");
    for (const s of [el.menuScreen, el.overScreen, el.pauseScreen]) {
      s.classList.toggle("hidden", s.id !== id);
    }
  }
  function hideOverlay() {
    el.overlay.classList.add("hidden");
  }

  function updateHud(force) {
    const shown = Math.floor(state.score);
    if (force || shown !== state.lastScoreShown) {
      el.score.textContent = shown;
      state.lastScoreShown = shown;
    }
    const kmh = Math.round(28 + state.speed * 0.095);
    if (force || kmh !== state.lastSpeedShown) {
      el.speedVal.textContent = kmh;
      state.lastSpeedShown = kmh;
    }
    el.hudBest.textContent = state.best;
  }

  function steer(dir) {
    if (state.mode !== "playing") return;
    player.lane = clamp(player.lane + dir, 0, 3);
  }

  // -------------------------------- update ------------------------------
  function updatePlayer(dt) {
    const prev = player.x;
    const target = laneX(player.lane);
    player.x += (target - player.x) * Math.min(1, dt * 13);
    const vx = (player.x - prev) / Math.max(dt, 0.001);
    player.lean = lerp(player.lean, clamp(vx * 0.00055, -0.32, 0.32), Math.min(1, dt * 9));
  }

  function updateDemo(dt) {
    state.scroll += 235 * dt;
    state.speed = 235;
    state.spawnTimer -= dt;
    if (state.spawnTimer <= 0) {
      state.spawnTimer = rand(1.1, 2);
      spawnVehicle(Math.floor(rand(0, 4)));
    }
    state.demoTimer -= dt;
    if (state.demoTimer <= 0) {
      state.demoTimer = rand(1.5, 3.2);
      player.lane = clamp(player.lane + (Math.random() < 0.5 ? -1 : 1), 0, 3);
    }
    updatePlayer(dt);
    updateVehicles(dt);
    updateParticles(dt);
    updateFloats(dt);
    updateStreaks(dt, 0.6);
  }

  function update(dt) {
    state.time += dt;

    if (state.mode === "paused") return;

    if (state.mode === "menu") {
      updateDemo(dt);
      return;
    }

    if (state.mode === "crash") {
      state.crashTimer += dt;
      state.speed *= Math.pow(0.06, dt);
      state.scroll += state.speed * dt;
      player.angle += player.angleVel * dt;
      player.angleVel *= Math.pow(0.25, dt);
      state.shake = Math.max(0, state.shake - dt * 34);
      state.flash = Math.max(0, state.flash - dt * 2.4);
      updateVehicles(dt, true);
      updateParticles(dt);
      updateFloats(dt);
      updateStreaks(dt, 0.25);
      updateHud();
      if (state.crashTimer > 1.05) endRun();
      return;
    }

    if (state.mode === "over") {
      state.speed = Math.max(0, state.speed - dt * 220);
      state.scroll += state.speed * dt;
      state.shake = Math.max(0, state.shake - dt * 34);
      state.flash = Math.max(0, state.flash - dt * 2.4);
      updateVehicles(dt, true);
      updateParticles(dt);
      updateFloats(dt);
      updateStreaks(dt, 0.2);
      return;
    }

    // playing
    state.elapsed += dt;
    state.targetSpeed = Math.min(1010, 372 + state.score * 0.36 + state.elapsed * 1.2);
    state.speed += (state.targetSpeed - state.speed) * Math.min(1, dt * 1.1);
    state.scroll += state.speed * dt;
    state.score += (dt * state.speed) / 34;

    const lvl = 1 + Math.floor(state.score / 260);
    if (lvl > state.level) {
      state.level = lvl;
      addFloat("SPEED UP!", W / 2, H * 0.34, "#ffcf4a", 1.1, Math.max(20, laneW * 0.14));
    }

    state.spawnTimer -= dt;
    if (state.spawnTimer <= 0) {
      spawnWave();
      const base = clamp(1.1 - state.level * 0.055, 0.5, 1.1);
      state.spawnTimer = base + rand(-0.06, 0.16);
    }

    state.hornTimer -= dt;
    if (state.hornTimer <= 0) {
      state.hornTimer = rand(7, 14);
      Sound.horn();
    }

    updatePlayer(dt);
    updateVehicles(dt);
    spawnDust(dt);
    updateParticles(dt);
    updateFloats(dt);
    updateStreaks(dt);
    state.shake = Math.max(0, state.shake - dt * 50);
    state.flash = Math.max(0, state.flash - dt * 3.2);

    checkCollisions();
    updateHud();
    Sound.setSpeed(state.speed);
  }

  // -------------------------------- render ------------------------------
  function render(t) {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);

    ctx.save();
    if (state.shake > 0.1) {
      ctx.translate(rand(-1, 1) * state.shake * 0.55, rand(-1, 1) * state.shake * 0.55);
    }

    drawGround(t);
    drawScenery(t);
    drawRoad(t);
    drawStreaks();

    const ordered = vehicles.slice().sort((a, b) => a.y - b.y);
    for (const v of ordered) drawVehicle(v, t);

    drawPlayer(t);
    drawParticles();
    drawFloats();
    ctx.restore();

    // vignette
    if (!render._vig || render._vigW !== W || render._vigH !== H) {
      const g = ctx.createRadialGradient(W / 2, H * 0.45, Math.min(W, H) * 0.22, W / 2, H * 0.5, Math.max(W, H) * 0.78);
      g.addColorStop(0, "rgba(0,18,10,0)");
      g.addColorStop(0.65, "rgba(0,18,10,.1)");
      g.addColorStop(1, "rgba(0,14,8,.42)");
      render._vig = g;
      render._vigW = W;
      render._vigH = H;
    }
    ctx.fillStyle = render._vig;
    ctx.fillRect(0, 0, W, H);

    if (state.flash > 0.01) {
      ctx.fillStyle = `rgba(255,70,55,${state.flash * 0.22})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  // -------------------------------- input --------------------------------
  function handleKey(e) {
    const k = e.key;
    if (k === "ArrowLeft" || k === "a" || k === "A") {
      e.preventDefault();
      if (!e.repeat) steer(-1);
    } else if (k === "ArrowRight" || k === "d" || k === "D") {
      e.preventDefault();
      if (!e.repeat) steer(1);
    } else if (k === " " || k === "Enter") {
      if (state.mode === "menu" || state.mode === "over") {
        e.preventDefault();
        startGame();
      } else if (state.mode === "paused") {
        e.preventDefault();
        togglePause();
      }
    } else if (k === "p" || k === "P" || k === "Escape") {
      if (state.mode === "playing" || state.mode === "paused") {
        e.preventDefault();
        togglePause();
      }
    } else if (k === "m" || k === "M") {
      Sound.toggle();
    }
  }

  function handlePointerSteer(e) {
    if (state.mode !== "playing") return;
    const x = e.clientX;
    steer(x < W / 2 ? -1 : 1);
  }

  // ------------------------------- startup ------------------------------
  function makeAsphaltPattern() {
    const p = document.createElement("canvas");
    p.width = 220;
    p.height = 220;
    const c = p.getContext("2d");
    c.fillStyle = "#41474a";
    c.fillRect(0, 0, 220, 220);
    for (let i = 0; i < 900; i++) {
      const light = Math.random() < 0.5;
      c.fillStyle = light ? "rgba(255,255,255,.026)" : "rgba(0,0,0,.05)";
      const s = Math.random() * 1.8 + 0.4;
      c.fillRect(Math.random() * 220, Math.random() * 220, s, s);
    }
    asphaltPattern = ctx.createPattern(p, "repeat");
  }

  function init() {
    makeAsphaltPattern();
    resize();
    player.lane = 1;
    player.x = laneX(1);
    el.menuBest.textContent = state.best;
    el.hudBest.textContent = state.best;
    updateSoundBtn();
    updateHud(true);
    showScreen("menuScreen");

    window.addEventListener("resize", resize);
    window.addEventListener("orientationchange", () => setTimeout(resize, 120));
    window.addEventListener("keydown", handleKey);

    canvas.addEventListener("pointerdown", handlePointerSteer);

    el.startBtn.addEventListener("click", startGame);
    el.restartBtn.addEventListener("click", startGame);
    el.resumeBtn.addEventListener("click", togglePause);
    el.pauseBtn.addEventListener("click", togglePause);
    el.soundBtn.addEventListener("click", () => Sound.toggle());

    const bindSteer = (btn, dir) => {
      btn.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        steer(dir);
      });
      btn.addEventListener("contextmenu", (e) => e.preventDefault());
    };
    bindSteer(el.leftBtn, -1);
    bindSteer(el.rightBtn, 1);

    document.addEventListener("visibilitychange", () => {
      if (document.hidden && state.mode === "playing") {
        state.mode = "paused";
        document.body.dataset.state = "paused";
        Sound.stopEngine();
        showScreen("pauseScreen");
      }
    });

    // Prevent page-level touch gestures from fighting the game.
    document.addEventListener(
      "touchmove",
      (e) => {
        if (e.target === canvas) e.preventDefault();
      },
      { passive: false }
    );

    let last = performance.now();
    function frame(now) {
      const dt = clamp((now - last) / 1000, 0, 0.05);
      last = now;
      update(dt);
      render(now / 1000);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  init();
})();
