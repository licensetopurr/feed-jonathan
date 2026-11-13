(() => {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const touch = window.matchMedia("(pointer: coarse)").matches;
  let W = 0, H = 0, GROUND = 0; // logical size + y of the road surface
  const dpr = Math.min(window.devicePixelRatio || 1, 2); // crisp on high-DPI screens

  // Phones in portrait get a narrower, taller play field so everything stays big enough.
  // Returns how far the road moved (so live objects can be shifted with it).
  function sizeCanvas() {
    // Phones always get the wide field: in portrait the page is rotated sideways (see updateOrientation).
    const narrow = !touch && window.innerWidth < 600;
    const nw = narrow ? 480 : 800;
    const nh = narrow ? 360 : 300;
    if (nw === W && nh === H) return 0;
    const oldGround = GROUND;
    W = nw; H = nh; GROUND = H - 50;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.aspectRatio = `${W} / ${H}`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return GROUND - oldGround;
  }
  sizeCanvas();

  // On a phone held upright, turn the whole game sideways so it fills the screen.
  // (CSS does the rotating; this just flags when it applies.)
  function updateOrientation() {
    document.documentElement.classList.toggle("rotated", touch && window.innerHeight > window.innerWidth);
  }
  updateOrientation();
  window.addEventListener("orientationchange", updateOrientation);

  // Jonathan is allergic to: eggs, all seafood, peanuts, and dairy.
  const ALLERGENS = [
    { emoji: "🥚", name: "egg", label: "eggs" },
    { emoji: "🍳", name: "fried egg", label: "eggs" },
    { emoji: "🦐", name: "shrimp", label: "seafood" },
    { emoji: "🦀", name: "crab", label: "seafood" },
    { emoji: "🦞", name: "lobster", label: "seafood" },
    { emoji: "🐟", name: "fish", label: "seafood" },
    { emoji: "🍣", name: "sushi", label: "seafood" },
    { emoji: "🦑", name: "squid", label: "seafood" },
    { emoji: "🦪", name: "oyster", label: "seafood" },
    { emoji: "🥜", name: "peanuts", label: "peanuts" },
    { emoji: "🥛", name: "milk", label: "dairy" },
    { emoji: "🧀", name: "cheese", label: "dairy" },
    { emoji: "🍦", name: "ice cream", label: "dairy" },
    { emoji: "🧈", name: "butter", label: "dairy" },
  ];
  const SAFE = [
    { emoji: "🍎", name: "apple" },
    { emoji: "🍌", name: "banana" },
    { emoji: "🍓", name: "strawberry" },
    { emoji: "🍇", name: "grapes" },
    { emoji: "🍉", name: "watermelon" },
    { emoji: "🍊", name: "orange" },
    { emoji: "🥕", name: "carrot" },
    { emoji: "🥦", name: "broccoli" },
    { emoji: "🌽", name: "corn" },
    { emoji: "🥔", name: "potato" },
  ];

  const GRAVITY = 1900;
  const JUMP_V = -640;
  const player = { x: 80, w: 30, h: 48, y: GROUND, vy: 0, jumps: 0 };

  let state = "ready"; // ready | playing | dead
  let items, popups, clouds, slurps, sparks;
  let speed, distance, runDist, eaten, score, spawnIn, runTime, mouthT, deathItem, deadAt = 0;
  let hi = 0;
  try { hi = Number(localStorage.getItem("feed-jonathan-hi")) || 0; } catch (_) {}

  function reset() {
    items = [];
    popups = [];
    slurps = [];
    sparks = [];
    clouds = clouds || Array.from({ length: 4 }, (_, i) => ({ x: i * 230 + 60, y: 30 + Math.random() * 70 }));
    speed = 320;
    distance = 0;
    runDist = 0;
    eaten = 0;
    score = 0;
    spawnIn = 0.8;
    runTime = 0;
    mouthT = 0;
    deathItem = null;
    player.y = GROUND;
    player.vy = 0;
    player.jumps = 0;
  }
  reset();

  // Keep the game intact when the phone rotates or the browser bar shows/hides.
  window.addEventListener("resize", () => {
    updateOrientation();
    const d = sizeCanvas();
    if (d) { player.y += d; items.forEach((it) => { it.cy += d; }); }
  });

  function onGround() { return player.y >= GROUND; }

  function jump() {
    if (state === "ready") { state = "playing"; }
    else if (state === "dead") {
      if (performance.now() - deadAt < 700) return; // don't skip the game-over screen by mashing
      reset(); state = "playing"; return;
    }
    if (state !== "playing") return;
    if (onGround()) {
      player.vy = JUMP_V;
      player.jumps = 1;
    } else if (player.jumps < 2) {
      player.vy = JUMP_V * 0.9; // second jump, slightly weaker
      player.jumps = 2;
    }
  }

  window.addEventListener("keydown", (e) => {
    if (e.code === "Space" || e.code === "ArrowUp" || e.code === "KeyW") {
      e.preventDefault();
      if (!e.repeat) jump();
    }
  });
  // Tap anywhere on the screen to jump.
  let triedLock = false;
  window.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    // Android Chrome: go fullscreen and lock to landscape on the first tap (iPhones ignore this).
    if (touch && !triedLock) {
      triedLock = true;
      const el = document.documentElement;
      if (el.requestFullscreen) {
        el.requestFullscreen()
          .then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock("landscape"))
          .catch(() => {});
      }
    }
    jump();
  });

  function spawn() {
    const isAllergen = Math.random() < 0.45;
    const list = isAllergen ? ALLERGENS : SAFE;
    const food = list[Math.floor(Math.random() * list.length)];
    // Some items float at head height: run under them, or jump into them.
    const high = Math.random() < 0.35;
    items.push({
      x: W + 30,
      cy: high ? GROUND - 62 : GROUND - 16,
      food,
      allergen: isAllergen,
      bob: Math.random() * 6,
    });
    // Gap scales with speed so every layout stays jumpable.
    spawnIn = (0.85 + Math.random() * 0.9) * (1 + (speed - 320) / 900);
  }

  function hits(it) {
    const r = 13;
    const px1 = player.x + 4, px2 = player.x + player.w - 4;
    const py1 = player.y - player.h + 4, py2 = player.y;
    return it.x + r > px1 && it.x - r < px2 && it.cy + r > py1 && it.cy - r < py2;
  }

  function die(it) {
    state = "dead";
    deadAt = performance.now();
    if (navigator.vibrate) navigator.vibrate(90);
    deathItem = it.food;
    if (score > hi) {
      hi = score;
      try { localStorage.setItem("feed-jonathan-hi", String(hi)); } catch (_) {}
    }
  }

  function update(dt) {
    clouds.forEach((c) => { c.x -= 20 * dt; if (c.x < -60) { c.x = W + 40; c.y = 30 + Math.random() * 70; } });
    popups.forEach((p) => { p.t += dt; p.y -= 40 * dt; });
    popups = popups.filter((p) => p.t < 0.7);
    mouthT = Math.max(0, mouthT - dt);
    slurps.forEach((s) => { s.t += dt; });
    slurps = slurps.filter((s) => s.t < 0.18);
    sparks.forEach((p) => { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 220 * dt; });
    sparks = sparks.filter((p) => p.t < 0.6);

    if (state !== "playing") return;

    runTime += dt;
    speed = Math.min(320 + runTime * 9, 720);
    // Narrow screens show less road, so scroll a bit slower to keep reaction time fair.
    const k = W < 800 ? 0.7 : 1;
    runDist += speed * dt;
    distance += speed * k * dt;
    score = Math.floor(runDist / 40) + eaten * 10;

    player.vy += GRAVITY * dt;
    player.y += player.vy * dt;
    if (player.y > GROUND) { player.y = GROUND; player.vy = 0; player.jumps = 0; }

    spawnIn -= dt;
    if (spawnIn <= 0) spawn();

    for (const it of items) it.x -= speed * k * dt;
    for (const it of items) {
      if (!it.eaten && hits(it)) {
        if (it.allergen) { die(it); return; }
        it.eaten = true;
        eaten++;
        mouthT = 0.5;
        slurps.push({ emoji: it.food.emoji, x: it.x, y: it.cy, t: 0 });
        for (let i = 0; i < 5; i++) {
          const ang = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
          sparks.push({
            x: player.x + 22, y: player.y - 30, t: 0,
            vx: Math.cos(ang) * (60 + Math.random() * 80), vy: Math.sin(ang) * (60 + Math.random() * 80),
            ch: Math.random() < 0.5 ? "✦" : "♥", c: Math.random() < 0.5 ? "#ffb703" : "#ff5d8f",
          });
        }
        popups.push({ x: it.x, y: it.cy - 10, t: 0, text: "+10 yum" });
      }
    }
    items = items.filter((it) => !it.eaten && it.x > -40);
  }

  // ---------- drawing ----------
  const INK = "#535353";

  function mouthShape(cx, my, kind, p) {
    // kind: closed | open | chew | dead
    ctx.save();
    if (kind === "closed") {
      ctx.strokeStyle = "#7a3b3b"; ctx.lineWidth = 2; ctx.lineCap = "round";
      ctx.beginPath(); ctx.arc(cx, my - 2, 4, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
    } else if (kind === "dead") {
      ctx.strokeStyle = "#7a3b3b"; ctx.lineWidth = 2; ctx.lineCap = "round";
      ctx.beginPath(); ctx.arc(cx, my + 4, 4, 1.15 * Math.PI, 1.85 * Math.PI); ctx.stroke();
    } else {
      const r = kind === "open" ? 8 : 3 + 5 * Math.abs(Math.sin(p));
      ctx.fillStyle = "#8c2f39";
      ctx.beginPath(); ctx.ellipse(cx, my, r * 0.85, r, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#ff8fa3"; // tongue
      ctx.beginPath(); ctx.ellipse(cx, my + r * 0.45, r * 0.55, r * 0.4, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  function drawPlayer() {
    const dead = state === "dead";
    const x = player.x, y = player.y;
    const air = !onGround();
    const phase = runTime * 16;
    const swing = air ? 0.9 : Math.sin(phase);
    const bob = dead || air ? 0 : Math.abs(Math.sin(phase)) * 2;
    const chewing = mouthT > 0;
    const chewP = (0.5 - mouthT) * 30;
    const nearFood = state === "playing" && items.some((it) => it.x - player.x > 10 && it.x - player.x < 120);

    const cx = x + 15;
    const hy = y - 32 - bob; // head centre
    const HEAD_R = 15;
    const SKIN = "#ffdcc0", OUTLINE = "#3d2b2b", SHIRT = "#4a90e2", HAIR = "#6b4226";

    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // feet
    ctx.fillStyle = "#e74c3c";
    const f1 = 9 * swing, f2 = -9 * swing;
    ctx.beginPath(); ctx.ellipse(cx - 3 + f1, y - 2 - (swing > 0 ? 3 : 0) * (air ? 0 : 1), 6, 3.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx - 3 + f2, y - 2 - (swing < 0 ? 3 : 0) * (air ? 0 : 1), 6, 3.5, 0, 0, Math.PI * 2); ctx.fill();

    // body (little round torso)
    ctx.fillStyle = SHIRT;
    ctx.strokeStyle = OUTLINE; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(cx, y - 13 - bob * 0.5, 9, 10, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

    // arms (tiny nubs)
    ctx.fillStyle = SKIN;
    const ay = y - 15 - bob * 0.5;
    ctx.beginPath(); ctx.ellipse(cx - 9, ay + 2 - 4 * swing, 3.5, 3.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(cx + 9, ay + 2 + 4 * swing, 3.5, 3.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

    // head (puffs out sideways while chewing)
    const puff = chewing ? 2 + Math.sin(chewP * 2) * 1.2 : 0;
    ctx.fillStyle = SKIN;
    ctx.beginPath(); ctx.ellipse(cx, hy, HEAD_R + puff, HEAD_R, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

    // hair tuft
    ctx.fillStyle = HAIR;
    ctx.beginPath();
    ctx.moveTo(cx - 12, hy - 7);
    ctx.quadraticCurveTo(cx - 4, hy - 22, cx + 8, hy - 13);
    ctx.quadraticCurveTo(cx + 12, hy - 11, cx + 14, hy - 7);
    ctx.quadraticCurveTo(cx + 2, hy - 12, cx - 12, hy - 7);
    ctx.fill();
    ctx.beginPath(); ctx.moveTo(cx - 2, hy - 15); ctx.quadraticCurveTo(cx, hy - 24, cx + 5, hy - 19); ctx.quadraticCurveTo(cx + 3, hy - 16, cx - 2, hy - 15); ctx.fill();

    // blush
    ctx.fillStyle = "rgba(255, 105, 140, 0.55)";
    ctx.beginPath(); ctx.ellipse(cx - 5 - puff * 0.5, hy + 5, 4, 2.6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx + 14 + puff * 0.5, hy + 5, 3.2, 2.6, 0, 0, Math.PI * 2); ctx.fill();

    // eyes
    if (dead) {
      ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2;
      [cx + 2, cx + 10].forEach((ex) => {
        ctx.beginPath();
        ctx.moveTo(ex - 2.5, hy - 5); ctx.lineTo(ex + 2.5, hy);
        ctx.moveTo(ex + 2.5, hy - 5); ctx.lineTo(ex - 2.5, hy);
        ctx.stroke();
      });
      ctx.fillStyle = "#6ec6ff"; // tears
      ctx.beginPath(); ctx.ellipse(cx + 2, hy + 4, 1.6, 3, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(cx + 10, hy + 4, 1.6, 3, 0, 0, Math.PI * 2); ctx.fill();
    } else {
      const happy = chewing; // ^ ^ eyes while chewing
      [cx + 2, cx + 10].forEach((ex) => {
        if (happy) {
          ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(ex, hy - 1, 3, 1.1 * Math.PI, 1.9 * Math.PI); ctx.stroke();
        } else {
          ctx.fillStyle = OUTLINE;
          ctx.beginPath(); ctx.ellipse(ex, hy - 2, 2.6, 4, 0, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = "#fff"; // shine
          ctx.beginPath(); ctx.arc(ex + 0.6, hy - 3.6, 1.1, 0, Math.PI * 2); ctx.fill();
        }
      });
    }

    // mouth
    const mx = cx + 6 + puff * 0.3, my = hy + 7;
    if (dead) mouthShape(mx, my, "dead");
    else if (chewing) mouthShape(mx, my, "chew", chewP);
    else if (nearFood) mouthShape(mx, my, "open");
    else mouthShape(mx, my, "closed");

    ctx.restore();
  }

  function drawSlurps() {
    for (const s of slurps) {
      const k = s.t / 0.18;
      const tx = player.x + 21, ty = player.y - 25;
      const px = s.x + (tx - s.x) * k * k;
      const py = s.y + (ty - s.y) * k * k;
      ctx.save();
      ctx.translate(px, py);
      ctx.scale(1 - k * 0.8, 1 - k * 0.8);
      ctx.font = "26px serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(s.emoji, 0, 0);
      ctx.restore();
    }
    for (const p of sparks) {
      ctx.globalAlpha = Math.max(0, 1 - p.t / 0.6);
      ctx.fillStyle = p.c;
      ctx.font = "bold 14px serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(p.ch, p.x, p.y);
      ctx.globalAlpha = 1;
    }
  }

  function drawItem(it) {
    ctx.font = "26px serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const bob = it.cy < GROUND - 30 ? Math.sin(performance.now() / 250 + it.bob) * 3 : 0;
    ctx.fillText(it.food.emoji, it.x, it.cy + bob);
  }

  function drawHud() {
    ctx.fillStyle = INK;
    ctx.font = "bold 16px ui-monospace, Menlo, monospace";
    ctx.textAlign = "right";
    ctx.textBaseline = "top";
    ctx.fillText(`HI ${String(hi).padStart(5, "0")}  ${String(score).padStart(5, "0")}`, W - 14, 12);

  }

  function centerText(lines) {
    ctx.fillStyle = INK;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    lines.forEach(([text, size, dy], i) => {
      ctx.font = `bold ${size}px ui-monospace, Menlo, monospace`;
      ctx.fillText(text, W / 2, H / 2 + dy);
    });
  }

  // ---------- black & white background ----------
  const wrap = (v, period) => ((v % period) + period) % period;

  function drawBackground() {
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, W, H);

    // pixel clouds
    ctx.fillStyle = "#e6e6e6";
    clouds.forEach((c) => { ctx.fillRect(c.x, c.y, 46, 10); ctx.fillRect(c.x + 10, c.y - 8, 26, 10); });

    // road
    ctx.fillStyle = INK;
    ctx.fillRect(0, GROUND, W, 2);
    ctx.fillStyle = "#b5b5b5";
    for (let i = 0; i < 40; i++) {
      const gx = wrap(i * 97 - distance, W + 100) - 50;
      ctx.fillRect(gx, GROUND + 8 + (i % 3) * 8, 6 + (i % 4) * 4, 2);
    }
  }

  function draw() {
    drawBackground();

    items.forEach(drawItem);
    popups.forEach((p) => {
      ctx.globalAlpha = 1 - p.t / 0.7;
      ctx.fillStyle = "#27ae60";
      ctx.font = "bold 14px ui-monospace, Menlo, monospace";
      ctx.textAlign = "center";
      ctx.fillText(p.text, p.x, p.y);
      ctx.globalAlpha = 1;
    });
    drawPlayer();
    drawSlurps();
    drawHud();

    if (state === "ready") {
      centerText([
        ["Jonathan is hungry.", 22, -20],
        [(touch ? "Tap" : "Press SPACE or tap") + " to start", 14, 14],
      ]);
    } else if (state === "dead") {
      centerText([
        ["G A M E   O V E R", 26, -34],
        [`Jonathan ate ${deathItem.emoji} ${deathItem.name}. Allergic to ${deathItem.label}!`, 15, -4],
        [`${eaten} foods eaten · score ${score}`, 14, 20],
        [(touch ? "Tap" : "Press SPACE or tap") + " to retry", 14, 48],
      ]);
    }
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    update(dt);
    draw();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
