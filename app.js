"use strict";
// All geometry is measured in the shared 1440 × 810 scene coordinates.
const CONFIG = {
  // Opening between the two pillars, under the lower tie beam, down to the waterline.
  curtain: {
    x: 608,
    y: 296,
    width: 224,
    height: 234,
    strands: 22,
    characterSize: 7.5,
    spacing: 15,
  },
  parallax: { nearScale: 1, deepScale: 1.52, skyStart: 0.62, deepFocusY: 390 },
  physics: {
    gravity: 0.105,
    damping: 0.972,
    iterations: 12,
    idleSway: 0.009,
    pointerRadius: 38,
    pointerStrength: 0.22,
    maxPush: 13,
  },
  sound: { volume: 0.09, cooldown: 750, globalCooldown: 65 },
  words: [
    "時を越えて、もう一度。",
    "記憶の向こうで、君を待つ。",
    "この門の先で、また会おう。",
  ],
};
const canvas = document.querySelector("#curtain");
const ctx = canvas.getContext("2d");
const frame = document.querySelector("#frame");
const scene = document.querySelector("#scene");
const heroDepth = document.querySelector("#hero-depth");
const skyReveal = document.querySelector("#sky-reveal");
const kyotoLayout = document.querySelector(".kyoto-layout");
const experience = document.querySelector(".experience");
function updateParallax() {
  const settings = CONFIG.parallax;
  const stageDistance = Math.max(1, experience.offsetHeight - innerHeight);
  const target = clamp(scrollY / stageDistance, 0, 1);
  // Scrub directly from scroll position; easing below shapes the motion without
  // adding a delayed chase that makes the camera appear to lag behind the page.
  const progress = target;
  const ease = (value) => {
    const t = clamp(value, 0, 1);
    return t * t * (3 - 2 * t);
  };
  const cameraProgress = ease(progress);
  const scale =
    settings.nearScale +
    (settings.deepScale - settings.nearScale) * cameraProgress;
  const focusY = 420 + (settings.deepFocusY - 420) * cameraProgress;
  heroDepth.style.transformOrigin = `720px ${focusY}px`;
  heroDepth.style.transform = `scale(${scale})`;
  const reveal = ease((progress - settings.skyStart) / (1 - settings.skyStart));
  skyReveal.style.opacity = reveal.toFixed(3);
  kyotoLayout.style.opacity = (1 - reveal).toFixed(3);
}
const button = document.querySelector("#sound");
let strands = [],
  audio = null,
  master = null,
  muted = true,
  lastBell = -Infinity,
  bellCount = 0;
let pointer = null;
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
function rebuild() {
  const c = CONFIG.curtain;
  const count = Math.floor((c.height - c.characterSize) / c.spacing);
  strands = Array.from({ length: c.strands }, (_, i) => {
    const x =
      c.x +
      c.characterSize +
      (i * (c.width - 2 * c.characterSize)) / (c.strands - 1);
    return {
      anchor: x,
      lastSound: -Infinity,
      points: Array.from({ length: count + 1 }, (_, j) => ({
        x,
        y: c.y + j * c.spacing,
        px: x,
        py: c.y + j * c.spacing,
      })),
    };
  });
}
function resize() {
  // Cover the viewport with one uniformly scaled, centered composition.
  const scale = Math.max(innerWidth / 1440, innerHeight / 810);
  scene.style.left = `${(innerWidth - 1440 * scale) / 2}px`;
  scene.style.top = `${(innerHeight - 810 * scale) / 2}px`;
  scene.style.transform = `scale(${scale})`;
  const resolution =
    Math.min(devicePixelRatio || 1, 2) * scale * CONFIG.parallax.nearScale;
  canvas.width = Math.round(1440 * resolution);
  canvas.height = Math.round(810 * resolution);
  ctx.setTransform(canvas.width / 1440, 0, 0, canvas.height / 810, 0, 0);
  pointer = null;
}
async function prepareAudio() {
  if (!audio) {
    audio = new (window.AudioContext || window.webkitAudioContext)();
    master = audio.createGain();
    master.gain.value = 0;
    master.connect(audio.destination);
  }
  await audio.resume();
}
function updateSoundButton() {
  button.textContent = muted ? "CHIMES OFF" : "CHIMES ON";
  button.setAttribute(
    "aria-label",
    muted ? "Turn chimes on" : "Turn chimes off",
  );
  button.setAttribute("aria-pressed", String(!muted));
}
button.addEventListener("click", async () => {
  try {
    await prepareAudio();
    muted = !muted;
    master.gain.setTargetAtTime(muted ? 0 : 1, audio.currentTime, 0.035);
    updateSoundButton();
    if (!muted) bell(0, 0.5);
  } catch {
    button.textContent = "AUDIO UNAVAILABLE";
  }
});
async function enableChimesFromGate() {
  if (!muted) return;
  try {
    await prepareAudio();
    muted = false;
    master.gain.setTargetAtTime(1, audio.currentTime, 0.035);
    updateSoundButton();
  } catch {
    button.textContent = "AUDIO UNAVAILABLE";
  }
}
function bell(index, strength) {
  if (muted || !audio || audio.state !== "running") return;
  const time = audio.currentTime;
  const notes = [523.25, 587.33, 659.25, 783.99, 880];
  const frequency = notes[index % notes.length] * (index % 3 === 0 ? 1 : 0.5);
  [1, 2.002, 3.01].forEach((ratio, partial) => {
    const osc = audio.createOscillator(),
      gain = audio.createGain();
    osc.type = "sine";
    osc.frequency.value = frequency * ratio;
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(
      (CONFIG.sound.volume * strength) / (1 + partial * 3),
      time + 0.012,
    );
    gain.gain.exponentialRampToValueAtTime(0.00001, time + 1.8 / (partial + 1));
    osc.connect(gain);
    gain.connect(master);
    osc.start(time);
    osc.stop(time + 2);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  });
  bellCount++;
}
function move(event) {
  const r = canvas.getBoundingClientRect(),
    scale = r.width / 1440;
  const x = (event.clientX - r.left) / scale,
    y = (event.clientY - r.top) / scale;
  const now = performance.now();
  const dt = pointer ? Math.max(8, now - pointer.time) : 16;
  const vx = pointer ? clamp(((x - pointer.x) * 16.667) / dt, -85, 85) : 0;
  const vy = pointer ? clamp(((y - pointer.y) * 16.667) / dt, -85, 85) : 0;
  pointer = { x, y, vx, vy, time: now };
}
canvas.addEventListener("pointermove", move);
canvas.addEventListener("pointerdown", (e) => {
  pointer = null;
  move(e);
  canvas.setPointerCapture(e.pointerId);
  void enableChimesFromGate();
});
canvas.addEventListener("pointerleave", () => {
  pointer = null;
});
canvas.addEventListener("pointercancel", () => {
  pointer = null;
});
canvas.addEventListener("pointerup", (e) => {
  if (e.pointerType !== "mouse") pointer = null;
});
function step(time) {
  const c = CONFIG.curtain,
    p = CONFIG.physics;
  strands.forEach((strand, index) => {
    const nodes = strand.points;
    let brushed = 0;
    for (let j = 1; j < nodes.length; j++) {
      const n = nodes[j],
        depth = j / (nodes.length - 1);
      let vx = (n.x - n.px) * p.damping,
        vy = (n.y - n.py) * p.damping;
      n.px = n.x;
      n.py = n.y;
      vx += Math.sin(time * 0.0007 + index * 0.3 + depth) * p.idleSway * depth;
      if (pointer && time - pointer.time < 90) {
        const distance = Math.hypot(n.x - pointer.x, n.y - pointer.y);
        if (distance < p.pointerRadius) {
          const influence = (1 - distance / p.pointerRadius) * depth;
          const speed = Math.hypot(pointer.vx, pointer.vy);
          vx += clamp(
            (pointer.vx * p.pointerStrength +
              Math.sign(n.x - pointer.x) * 0.15) *
              influence,
            -p.maxPush,
            p.maxPush,
          );
          vy += clamp(
            pointer.vy * p.pointerStrength * influence,
            -p.maxPush,
            p.maxPush,
          );
          brushed = Math.max(brushed, influence * speed);
        }
      }
      n.x += vx;
      n.y += vy + p.gravity;
    }
    for (let k = 0; k < p.iterations; k++) {
      nodes[0].x = strand.anchor;
      nodes[0].y = c.y;
      for (let j = 1; j < nodes.length; j++) {
        const a = nodes[j - 1],
          b = nodes[j];
        const dx = b.x - a.x,
          dy = b.y - a.y,
          distance = Math.hypot(dx, dy) || 1;
        const correction = (distance - c.spacing) / distance;
        const weight = j === 1 ? 1 : 0.5;
        if (j > 1) {
          a.x += dx * correction * weight;
          a.y += dy * correction * weight;
        }
        b.x -= dx * correction * weight;
        b.y -= dy * correction * weight;
      }
    }
    if (
      brushed > 1.5 &&
      time - strand.lastSound > CONFIG.sound.cooldown &&
      time - lastBell > CONFIG.sound.globalCooldown &&
      !muted
    ) {
      bell(index, clamp(brushed / 22, 0.25, 0.85));
      strand.lastSound = time;
      lastBell = time;
    }
  });
}
function draw() {
  const c = CONFIG.curtain;
  ctx.clearRect(0, 0, 1440, 810);
  ctx.save();
  ctx.beginPath();
  ctx.rect(c.x, c.y, c.width, c.height);
  ctx.clip();
  ctx.font = `${c.characterSize}px "Yu Mincho", "Noto Serif CJK JP", "MS Mincho", serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(0,0,0,.7)";
  ctx.shadowBlur = 2;
  strands.forEach((strand, i) => {
    const word = CONFIG.words[i % CONFIG.words.length];
    strand.points.slice(1).forEach((n, j) => {
      ctx.fillStyle = `rgba(255,248,222,${0.9 - (j % 4) * 0.04})`;
      if (j < word.length) ctx.fillText(word[j], n.x, n.y);
    });
  });
  ctx.restore();
}
let previous = 0,
  accumulator = 0;
function animate(time) {
  const elapsed = Math.min(time - (previous || time), 50);
  updateParallax();
  accumulator += elapsed;
  previous = time;
  while (accumulator >= 1000 / 60) {
    step(time);
    accumulator -= 1000 / 60;
  }
  draw();
  requestAnimationFrame(animate);
}
document.addEventListener("visibilitychange", () => {
  previous = 0;
  accumulator = 0;
  pointer = null;
});
window.addEventListener("resize", resize);
window.addEventListener(
  "scroll",
  () => {
    pointer = null;
  },
  { passive: true },
);
window.shrine = {
  config: CONFIG,
  rebuild,
  snapshot: () => ({
    muted,
    audioState: audio?.state || "uninitialized",
    bellCount,
    strands: strands.map((s) => s.points.map((n) => ({ x: n.x, y: n.y }))),
  }),
};
rebuild();
resize();
updateParallax();
requestAnimationFrame(animate);
