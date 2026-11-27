const STEP = 1 / 120;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

function createRun(courseIndex = 0) {
  const course = COURSES[courseIndex];
  return {
    courseIndex, course,
    player: { x: PLAYFIELD.spawn, y: PLAYFIELD.floor - 42, w: PLAYFIELD.courierWidth, h: 42, vx: 0, vy: 0, facing: 1,
      grounded: true, springing: false, grace: 0, bufferedJump: 0, invulnerable: 0 },
    seeds: course.seeds.map(([x, y]) => ({ x, y, taken: false })),
    enemies: course.enemies.map(([x, base, min, max], index) => ({
      x, y: base - 27, w: 32, h: 27, min, max, dir: index % 2 ? 1 : -1, alive: true,
    })),
    lives: 3, count: 0, checkpoint: 0, phase: "playing", progress: 0, events: [],
  };
}

function overlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function respawnAtPost(run) {
  const p = run.player;
  p.x = run.checkpoint ? run.course.checkpoints[run.checkpoint - 1] + 34 : PLAYFIELD.spawn;
  p.y = PLAYFIELD.floor - p.h - 3;
  p.vx = 0;
  p.vy = 0;
  p.facing = 1;
  p.grounded = false;
  p.springing = false;
  p.grace = 0;
  p.bufferedJump = 0;
  p.invulnerable = 1.45;
}

function loseLife(run, fall, direction = -run.player.facing) {
  const p = run.player;
  if (!fall && p.invulnerable > 0) return;
  run.lives -= 1;
  run.events.push({ type: "hurt", x: p.x + p.w / 2, y: p.y + 20 });
  if (!run.lives) {
    run.phase = "lost";
    return;
  }
  if (fall) {
    respawnAtPost(run);
    return;
  }
  p.invulnerable = 1.45;
  p.grounded = false;
  p.springing = false;
  p.grace = 0;
  p.bufferedJump = 0;
  p.vx = direction * 250;
  p.vy = -335;
}

function advanceRun(run, input, dt = STEP) {
  if (run.phase !== "playing") return;
  const p = run.player;
  p.invulnerable = Math.max(0, p.invulnerable - dt);
  p.grace = p.grounded ? .095 : Math.max(0, p.grace - dt);
  p.bufferedJump = input.jumpPressed ? .118 : Math.max(0, p.bufferedJump - dt);
  if (p.bufferedJump && p.grace) {
    p.vy = -700;
    p.grounded = false;
    p.springing = false;
    p.grace = 0;
    p.bufferedJump = 0;
    run.events.push({ type: "jump", x: p.x + p.w / 2, y: p.y + p.h });
  }

  const direction = Number(input.right) - Number(input.left);
  const desired = direction * 345;
  const acceleration = (p.grounded ? 2590 : 1470) * dt;
  p.vx += clamp(desired - p.vx, -acceleration, acceleration);
  if (direction) p.facing = direction;
  p.x = clamp(p.x + p.vx * dt, 8, run.course.end - p.w);
  const cell = run.course.cells[Math.floor(p.x / COLLISION_CELL_WIDTH)];

  const previousBottom = p.y + p.h;
  const fallingGravity = !input.jumpHeld && !p.springing && p.vy < -210 ? 3000 : 1780;
  p.vy = Math.min(860, p.vy + fallingGravity * dt);
  p.y += p.vy * dt;
  p.grounded = false;
  if (p.vy >= 0) {
    let landing;
    for (const platform of cell.platforms) {
      if (p.x + p.w > platform.x && p.x < platform.x + platform.w &&
          previousBottom <= platform.y + .01 && p.y + p.h >= platform.y &&
          (!landing || platform.y < landing.y)) {
        landing = platform;
      }
    }
    if (landing) {
      if (landing.spring || p.vy > 350) {
        run.events.push({ type: landing.spring ? "spring" : "land", x: p.x + p.w / 2, y: landing.y });
      }
      p.y = landing.y - p.h;
      p.vy = landing.spring ? -910 : 0;
      p.springing = Boolean(landing.spring);
      p.grounded = !landing.spring;
    }
  }

  if (p.y > PLAYFIELD.height + 46) {
    loseLife(run, true);
    return;
  }

  for (const enemy of run.enemies) {
    if (!enemy.alive) continue;
    enemy.x += enemy.dir * run.course.enemySpeed * dt;
    if (enemy.x >= enemy.max - enemy.w || enemy.x <= enemy.min) {
      enemy.x = clamp(enemy.x, enemy.min, enemy.max - enemy.w);
      enemy.dir = enemy.x === enemy.min ? 1 : -1;
    }
    if (!overlap(p, enemy)) continue;
    if (p.vy > 0 && previousBottom <= enemy.y + 9) {
      enemy.alive = false;
      p.vy = input.jumpHeld ? -560 : -400;
      p.y = enemy.y - p.h;
      run.events.push({ type: "stomp", x: enemy.x + enemy.w / 2, y: enemy.y });
    } else {
      loseLife(run, false, p.x + p.w / 2 < enemy.x + enemy.w / 2 ? -1 : 1);
    }
  }

  for (const [x, w] of cell.spikes) {
    if (p.x + p.w > x + 4 && p.x < x + w - 4 &&
        p.y + p.h > PLAYFIELD.floor - 16 && p.y < PLAYFIELD.floor) {
      loseLife(run, false, p.x + p.w / 2 < x + w / 2 ? -1 : 1);
    }
  }
  if (run.phase !== "playing") return;

  for (const index of cell.seeds) {
    const seed = run.seeds[index];
    if (!seed.taken && p.x + p.w > seed.x - 12 && p.x < seed.x + 12 &&
        p.y + p.h > seed.y - 13 && p.y < seed.y + 13) {
      seed.taken = true;
      run.count += 1;
      run.events.push({ type: "seed", x: seed.x, y: seed.y });
    }
  }
  const post = run.course.checkpoints[run.checkpoint];
  if (p.x + p.w / 2 >= post && p.y + p.h <= PLAYFIELD.floor + 2) {
    run.checkpoint += 1;
    run.lives = 3;
    run.events.push({ type: "checkpoint", x: post, y: PLAYFIELD.floor - 65, number: run.checkpoint });
  }
  run.progress = Math.max(run.progress, clamp((p.x - PLAYFIELD.spawn) / (run.course.goal - PLAYFIELD.spawn), 0, 1));
  if (p.x + p.w / 2 >= run.course.goal && p.y + p.h >= PLAYFIELD.floor - 70) {
    run.progress = 1;
    run.phase = "won";
    run.events.push({ type: "win", x: run.course.goal, y: PLAYFIELD.floor - 55 });
  }
}
