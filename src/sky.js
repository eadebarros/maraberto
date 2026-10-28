// Starry sky behind the whole page: twinkling stars drifting slowly, with an occasional shooting star.
const canvas = document.getElementById('sky');
const ctx = canvas.getContext('2d');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let w = 0;
let h = 0;
let dpr = 1;
let stars = [];
let meteor = null;
let nextMeteorAt = performance.now() + 3000 + Math.random() * 4000;

function makeStars() {
  // Density scales with area so phones and desktops look alike.
  const count = Math.round((w * h) / 2600);
  stars = Array.from({ length: count }, () => {
    const big = Math.random() < 0.06;
    return {
      x: Math.random() * w,
      y: Math.random() * h,
      r: big ? 0.9 + Math.random() * 0.7 : 0.3 + Math.random() * 0.6,
      base: big ? 0.6 + Math.random() * 0.3 : 0.15 + Math.random() * 0.4,
      twinkle: 0.5 + Math.random() * 2.2, // speed
      phase: Math.random() * Math.PI * 2,
      depth: 0.3 + Math.random() * 0.7,   // parallax / drift speed
    };
  });
}

function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  w = window.innerWidth;
  h = window.innerHeight;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  makeStars();
}

function spawnMeteor(now) {
  // Starts in the upper part of the screen and falls down-left or down-right.
  const dir = Math.random() < 0.5 ? -1 : 1;
  const angle = (20 + Math.random() * 25) * (Math.PI / 180);
  const speed = 0.9 + Math.random() * 0.6; // px per ms
  meteor = {
    x: dir > 0 ? Math.random() * w * 0.6 : w * 0.4 + Math.random() * w * 0.6,
    y: Math.random() * h * 0.35,
    vx: Math.cos(angle) * speed * dir,
    vy: Math.sin(angle) * speed,
    len: 120 + Math.random() * 120,
    life: 0,
    duration: 700 + Math.random() * 500,
    start: now,
  };
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(now - last, 50);
  last = now;
  const t = now / 1000;

  ctx.clearRect(0, 0, w, h);

  // Stars: slow sideways drift plus a soft twinkle.
  for (const s of stars) {
    if (!reduceMotion) {
      s.x -= s.depth * dt * 0.004;
      if (s.x < -2) s.x += w + 4;
    }
    const tw = reduceMotion ? 1 : 0.65 + 0.35 * Math.sin(t * s.twinkle + s.phase);
    ctx.globalAlpha = s.base * tw;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  if (!reduceMotion) {
    if (!meteor && now >= nextMeteorAt) spawnMeteor(now);
    if (meteor) {
      const m = meteor;
      m.life = (now - m.start) / m.duration;
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      // fade in fast, out slow
      const alpha = m.life < 0.15 ? m.life / 0.15 : Math.max(0, 1 - (m.life - 0.15) / 0.85);
      const mag = Math.hypot(m.vx, m.vy);
      const tx = m.x - (m.vx / mag) * m.len;
      const ty = m.y - (m.vy / mag) * m.len;
      const grad = ctx.createLinearGradient(m.x, m.y, tx, ty);
      grad.addColorStop(0, `rgba(255,255,255,${alpha})`);
      grad.addColorStop(0.3, `rgba(255,255,255,${0.45 * alpha})`);
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.strokeStyle = grad;
      ctx.lineWidth = 1.8;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(m.x, m.y);
      ctx.lineTo(tx, ty);
      ctx.stroke();
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(m.x, m.y, 1.6, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.globalAlpha = 1;
      if (m.life >= 1) {
        meteor = null;
        nextMeteorAt = now + 5000 + Math.random() * 9000;
      }
    }
  }

  requestAnimationFrame(frame);
}

resize();
window.addEventListener('resize', resize);
requestAnimationFrame(frame);
