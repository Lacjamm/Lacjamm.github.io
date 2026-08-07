import { LEVELS, LEVEL_LOOKUP, LEVEL_SEQUENCE, ENEMY_TYPES, PICKUP_MODELS, WEAPON_ORDER, WEAPONS } from "./content.js";
import { MODEL_KEYS, buildSpriteAtlas } from "./models.js";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = false;

const overlay = document.getElementById("overlay");
const WIDTH = canvas.width;
const HEIGHT = canvas.height;
const FOV = Math.PI / 2.75;
const HALF_FOV = FOV / 2;
const MAX_DEPTH = 24;
const SAVE_KEY = "infernal-velocity-save";

const atlas = buildSpriteAtlas(MODEL_KEYS);

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const lerp = (a, b, t) => a + (b - a) * t;
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
const normAngle = (angle) => {
  let next = angle;
  while (next < -Math.PI) next += Math.PI * 2;
  while (next > Math.PI) next -= Math.PI * 2;
  return next;
};
const deepCopy = (value) => JSON.parse(JSON.stringify(value));
const rand = (min, max) => min + Math.random() * (max - min);
const rankValue = { D: 0, C: 1, B: 2, A: 3, S: 4 };

const defaultSave = () => ({
  unlockedLevels: [LEVEL_SEQUENCE[0]],
  unlockedWeapons: ["revolver"],
  bestRanks: {},
  completedLevels: {},
  discoveredSecrets: {},
  lastLevel: LEVEL_SEQUENCE[0],
});

const loadSave = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(SAVE_KEY) || "null");
    if (!parsed) return defaultSave();
    return {
      ...defaultSave(),
      ...parsed,
      unlockedLevels: Array.from(new Set([LEVEL_SEQUENCE[0], ...(parsed.unlockedLevels || [])])),
      unlockedWeapons: Array.from(new Set(["revolver", ...(parsed.unlockedWeapons || [])])),
      bestRanks: parsed.bestRanks || {},
      completedLevels: parsed.completedLevels || {},
      discoveredSecrets: parsed.discoveredSecrets || {},
    };
  } catch {
    return defaultSave();
  }
};

const state = {
  mode: "menu",
  save: loadSave(),
  time: 0,
  mouseDown: false,
  depthBuffer: new Array(WIDTH).fill(MAX_DEPTH),
  keys: {},
  messages: [],
  beams: [],
  levelData: null,
  map: [],
  mapWidth: 0,
  mapHeight: 0,
  hiddenWalls: new Set(),
  player: null,
  enemies: [],
  pickups: [],
  projectiles: [],
  particles: [],
  kills: 0,
  secretsFound: 0,
  results: null,
};

const createPlayer = (level) => ({
  x: level.start.x,
  y: level.start.y,
  angle: level.start.angle,
  radius: 0.23,
  health: 100,
  armor: 25,
  dashCooldown: 0,
  dashTimer: 0,
  dashDir: { x: 0, y: 0 },
  shootCooldown: 0,
  meleeCooldown: 0,
  hurtTimer: 0,
  style: 0,
  styleTimer: 0,
  currentWeapon: state.save.unlockedWeapons.includes("shotgun") ? "shotgun" : "revolver",
  ammo: {
    shells: 18,
    nails: 80,
    cells: 6,
    rockets: 3,
  },
});

const betterRank = (left, right) => (rankValue[right] > rankValue[left] ? right : left);

const pushMessage = (text, duration = 2.2, color = "#ffe0a8") => {
  state.messages.push({ text, ttl: duration, color });
  if (state.messages.length > 5) state.messages.shift();
};

const persist = () => {
  localStorage.setItem(SAVE_KEY, JSON.stringify(state.save));
};

const weaponUnlocked = (id) => state.save.unlockedWeapons.includes(id);
const levelUnlocked = (id) => state.save.unlockedLevels.includes(id);

const getRawCell = (x, y) => {
  if (y < 0 || y >= state.mapHeight || x < 0 || x >= state.mapWidth) return "#";
  const row = state.map[y] || "";
  return row[x] || "#";
};

const isWall = (x, y) => {
  const cell = getRawCell(Math.floor(x), Math.floor(y));
  if (cell === "h") return !state.hiddenWalls.has(`${Math.floor(x)},${Math.floor(y)}`);
  return cell !== "." && cell !== "~" && cell !== "e";
};

const isHazard = (x, y) => getRawCell(Math.floor(x), Math.floor(y)) === "~";
const isExit = (x, y) => getRawCell(Math.floor(x), Math.floor(y)) === "e";

const attemptMove = (entity, dx, dy) => {
  const nextX = entity.x + dx;
  const nextY = entity.y + dy;
  if (!isWall(nextX + Math.sign(dx || 1) * entity.radius, entity.y) && !isWall(nextX, entity.y + entity.radius) && !isWall(nextX, entity.y - entity.radius)) {
    entity.x = nextX;
  }
  if (!isWall(entity.x + entity.radius, nextY) && !isWall(entity.x - entity.radius, nextY) && !isWall(entity.x, nextY + Math.sign(dy || 1) * entity.radius)) {
    entity.y = nextY;
  }
};

const hasLineOfSight = (ax, ay, bx, by) => {
  const steps = Math.ceil(dist(ax, ay, bx, by) * 8);
  for (let index = 0; index <= steps; index += 1) {
    const t = index / steps;
    const x = lerp(ax, bx, t);
    const y = lerp(ay, by, t);
    if (isWall(x, y)) return false;
  }
  return true;
};

const currentWeaponData = () => WEAPONS[state.player.currentWeapon];

const switchWeapon = (direction) => {
  const unlocked = WEAPON_ORDER.filter((id) => weaponUnlocked(id));
  const currentIndex = unlocked.indexOf(state.player.currentWeapon);
  const nextIndex = (currentIndex + direction + unlocked.length) % unlocked.length;
  state.player.currentWeapon = unlocked[nextIndex];
  pushMessage(`${WEAPONS[state.player.currentWeapon].name} ready.`, 1.3, WEAPONS[state.player.currentWeapon].color);
};

const applyReward = (reward = {}) => {
  if (reward.health) state.player.health = clamp(state.player.health + reward.health, 0, 100);
  if (reward.armor) state.player.armor = clamp(state.player.armor + reward.armor, 0, 100);
  if (reward.shells) state.player.ammo.shells += reward.shells;
  if (reward.nails) state.player.ammo.nails += reward.nails;
  if (reward.cells) state.player.ammo.cells += reward.cells;
  if (reward.rockets) state.player.ammo.rockets += reward.rockets;
  if (reward.style) {
    state.player.style += reward.style;
    state.player.styleTimer = 4;
  }
};

const totalSecrets = () => state.levelData.secrets.length;

const discoverSecret = (secret) => {
  if (secret.found) return;
  secret.found = true;
  state.secretsFound += 1;
  state.save.discoveredSecrets[`${state.levelData.id}:${secret.id}`] = true;
  applyReward(secret.reward);
  persist();
  pushMessage(secret.text, 2.8, "#ffd77d");
};

const spawnParticles = (x, y, color, amount = 8, speed = 2.4) => {
  for (let index = 0; index < amount; index += 1) {
    const angle = Math.random() * Math.PI * 2;
    const velocity = rand(0.4, speed);
    state.particles.push({
      x,
      y,
      vx: Math.cos(angle) * velocity,
      vy: Math.sin(angle) * velocity,
      life: rand(0.18, 0.6),
      size: rand(1.2, 3.4),
      color,
    });
  }
};

const damagePlayer = (amount, color = "#ff6a6a") => {
  if (state.player.hurtTimer > 0.05) return;
  let pending = amount;
  if (state.player.armor > 0) {
    const absorbed = Math.min(state.player.armor, Math.ceil(amount * 0.45));
    state.player.armor -= absorbed;
    pending -= absorbed;
  }
  state.player.health = clamp(state.player.health - pending, 0, 100);
  state.player.hurtTimer = 0.28;
  spawnParticles(state.player.x, state.player.y, color, 6, 1.5);
  if (state.player.health <= 0) {
    state.mode = "dead";
    showDeathOverlay();
  }
};

const damageEnemy = (enemy, amount, styleBonus = 0) => {
  if (!enemy.alive) return;
  enemy.health -= amount;
  enemy.hurtTimer = 0.16;
  spawnParticles(enemy.x, enemy.y, enemy.type === "throne" ? "#fff2ad" : "#ff5b5b", 7, 2.1);
  if (enemy.health <= 0) {
    enemy.alive = false;
    state.kills += 1;
    const data = ENEMY_TYPES[enemy.type];
    state.player.style += data.style + styleBonus;
    state.player.styleTimer = 4.5;
    if (Math.random() < 0.18) {
      state.pickups.push({ id: crypto.randomUUID(), type: "health", x: enemy.x, y: enemy.y, bob: Math.random() * Math.PI * 2 });
    }
  }
};

const explode = (x, y, splash, damage, friendly, color = "#ff8a54") => {
  spawnParticles(x, y, color, 18, 3.8);
  if (friendly) {
    state.enemies.forEach((enemy) => {
      if (!enemy.alive) return;
      const distance = dist(x, y, enemy.x, enemy.y);
      if (distance <= splash) damageEnemy(enemy, damage * (1 - distance / splash), 8);
    });
  } else if (dist(x, y, state.player.x, state.player.y) <= splash) {
    const falloff = 1 - dist(x, y, state.player.x, state.player.y) / splash;
    damagePlayer(Math.ceil(damage * falloff));
  }
};

const spawnProjectile = (options) => {
  state.projectiles.push({ id: crypto.randomUUID(), life: options.life ?? 4, ...options });
};

const fireHitscan = (angle, weapon) => {
  const hits = [];
  const pierced = weapon.pierce || 1;
  for (let step = 0.1; step < weapon.range; step += 0.12) {
    const x = state.player.x + Math.cos(angle) * step;
    const y = state.player.y + Math.sin(angle) * step;
    if (isWall(x, y)) return { hitPoint: { x, y }, hits };
    const target = state.enemies.find((enemy) => enemy.alive && !hits.includes(enemy) && dist(x, y, enemy.x, enemy.y) <= enemy.radius + 0.06);
    if (target) {
      hits.push(target);
      if (hits.length >= pierced) return { hitPoint: { x, y }, hits };
    }
  }
  return { hitPoint: { x: state.player.x + Math.cos(angle) * weapon.range, y: state.player.y + Math.sin(angle) * weapon.range }, hits };
};

const fireWeapon = () => {
  if (state.mode !== "playing") return;
  const weapon = currentWeaponData();
  if (state.player.shootCooldown > 0) return;
  if (weapon.ammoType && state.player.ammo[weapon.ammoType] < (weapon.ammoUse || 1)) {
    pushMessage("Dry magazine.", 1.2, "#ff8f8f");
    return;
  }
  state.player.shootCooldown = weapon.cooldown;
  state.player.styleTimer = 4;
  if (weapon.ammoType) state.player.ammo[weapon.ammoType] -= weapon.ammoUse || 1;
  if (weapon.projectile) {
    spawnProjectile({
      x: state.player.x + Math.cos(state.player.angle) * 0.4,
      y: state.player.y + Math.sin(state.player.angle) * 0.4,
      vx: Math.cos(state.player.angle) * weapon.speed,
      vy: Math.sin(state.player.angle) * weapon.speed,
      radius: 0.14,
      damage: weapon.damage,
      splash: weapon.splash,
      color: weapon.color,
      friendly: true,
    });
  } else {
    const pellets = weapon.pellets || 1;
    for (let pellet = 0; pellet < pellets; pellet += 1) {
      const spread = (Math.random() - 0.5) * weapon.spread;
      const result = fireHitscan(state.player.angle + spread, weapon);
      state.beams.push({ fromX: state.player.x, fromY: state.player.y, toX: result.hitPoint.x, toY: result.hitPoint.y, ttl: 0.06, color: weapon.color });
      result.hits.forEach((enemy, index) => {
        const multiplier = weapon.id === "arc" ? 1 - index * 0.18 : 1;
        damageEnemy(enemy, weapon.damage * multiplier, weapon.style);
      });
    }
  }
};

const meleeAttack = () => {
  if (state.player.meleeCooldown > 0) return;
  state.player.meleeCooldown = 0.42;
  const enemies = state.enemies
    .filter((enemy) => enemy.alive)
    .map((enemy) => ({ enemy, distance: dist(state.player.x, state.player.y, enemy.x, enemy.y) }))
    .filter((entry) => entry.distance < 1.5)
    .sort((left, right) => left.distance - right.distance);
  const target = enemies.find(({ enemy }) => Math.abs(normAngle(Math.atan2(enemy.y - state.player.y, enemy.x - state.player.x) - state.player.angle)) < 0.7);
  if (target) damageEnemy(target.enemy, 30, 14);
};

const pickupWeaponId = (type) => type.replace("weapon-", "");

const applyPickup = (pickup) => {
  switch (pickup.type) {
    case "health":
      state.player.health = clamp(state.player.health + 25, 0, 100);
      pushMessage("Blood restored.", 1.1, "#ff9ca3");
      break;
    case "armor":
      state.player.armor = clamp(state.player.armor + 25, 0, 100);
      pushMessage("Plating reinforced.", 1.1, "#8ff6ba");
      break;
    case "shells":
      state.player.ammo.shells += 8;
      pushMessage("Shells +8", 1, "#ffcf8a");
      break;
    case "nails":
      state.player.ammo.nails += 40;
      pushMessage("Nails +40", 1, "#d0b5ff");
      break;
    case "cells":
      state.player.ammo.cells += 4;
      pushMessage("Cells +4", 1, "#a8f6ff");
      break;
    case "rockets":
      state.player.ammo.rockets += 3;
      pushMessage("Rockets +3", 1, "#ff9f72");
      break;
    default: {
      if (pickup.type.startsWith("weapon-")) {
        const weaponId = pickupWeaponId(pickup.type);
        if (!weaponUnlocked(weaponId)) {
          state.save.unlockedWeapons.push(weaponId);
          state.save.unlockedWeapons = Array.from(new Set(state.save.unlockedWeapons));
          persist();
        }
        state.player.currentWeapon = weaponId;
        if (weaponId === "shotgun") state.player.ammo.shells += 10;
        if (weaponId === "nailer") state.player.ammo.nails += 60;
        if (weaponId === "arc") state.player.ammo.cells += 6;
        if (weaponId === "launcher") state.player.ammo.rockets += 5;
        pushMessage(`${WEAPONS[weaponId].name} unlocked.`, 2, WEAPONS[weaponId].color);
      }
    }
  }
};

const interact = () => {
  state.levelData.secrets
    .filter((secret) => secret.type === "wall" && !secret.found)
    .forEach((secret) => {
      if (dist(state.player.x, state.player.y, secret.x, secret.y) < 1.35) {
        state.hiddenWalls.add(`${Math.floor(secret.x)},${Math.floor(secret.y)}`);
        discoverSecret(secret);
      }
    });
};

const activeEnemyCount = () => state.enemies.filter((enemy) => enemy.alive).length;

const rankForResults = (results) => {
  let score = 0;
  if (results.kills === results.totalKills) score += 2;
  if (results.secrets === results.totalSecrets) score += 2;
  if (results.time <= results.parTime) score += 2;
  if (results.style >= results.parStyle) score += 2;
  if (results.damageTaken <= 25) score += 1;
  if (score >= 8) return "S";
  if (score >= 6) return "A";
  if (score >= 4) return "B";
  if (score >= 2) return "C";
  return "D";
};

const finishLevel = () => {
  const nextIndex = LEVEL_SEQUENCE.indexOf(state.levelData.id) + 1;
  const nextLevel = LEVEL_SEQUENCE[nextIndex];
  if (nextLevel && !state.save.unlockedLevels.includes(nextLevel)) state.save.unlockedLevels.push(nextLevel);
  state.save.completedLevels[state.levelData.id] = true;
  state.save.lastLevel = nextLevel || state.levelData.id;
  const results = {
    levelId: state.levelData.id,
    name: state.levelData.name,
    time: Math.round(state.time),
    kills: state.kills,
    totalKills: state.enemies.length,
    secrets: state.secretsFound,
    totalSecrets: totalSecrets(),
    style: Math.round(state.player.style),
    parTime: state.levelData.parTime,
    parStyle: state.levelData.parStyle,
    damageTaken: 100 - state.player.health + Math.max(0, 25 - state.player.armor),
  };
  results.rank = rankForResults(results);
  state.save.bestRanks[state.levelData.id] = betterRank(state.save.bestRanks[state.levelData.id] || "D", results.rank);
  persist();
  state.results = results;
  state.mode = "results";
  document.exitPointerLock?.();
  showResultsOverlay();
};

const startLevel = (levelId) => {
  const source = LEVEL_LOOKUP[levelId];
  if (!source) return;
  const level = deepCopy(source);
  state.mode = "playing";
  state.levelData = level;
  state.map = level.map;
  state.mapWidth = Math.max(...level.map.map((row) => row.length));
  state.mapHeight = level.map.length;
  state.hiddenWalls = new Set();
  state.player = createPlayer(level);
  state.enemies = level.enemies.map((enemy) => ({
    id: crypto.randomUUID(),
    ...enemy,
    alive: true,
    health: ENEMY_TYPES[enemy.type].health,
    radius: ENEMY_TYPES[enemy.type].radius,
    facing: rand(-Math.PI, Math.PI),
    cooldown: rand(0.1, 0.8),
    phase: Math.random() * Math.PI * 2,
    hurtTimer: 0,
  }));
  state.pickups = level.pickups.map((pickup) => ({ id: crypto.randomUUID(), bob: Math.random() * Math.PI * 2, ...pickup }));
  state.projectiles = [];
  state.particles = [];
  state.beams = [];
  state.messages = [];
  state.time = 0;
  state.kills = 0;
  state.secretsFound = 0;
  level.secrets.forEach((secret) => {
    secret.found = false;
  });
  pushMessage(`${level.act} // ${level.name}`, 2.2, level.theme.accent);
  pushMessage(level.briefing, 3.4, "#ffe0af");
  overlay.innerHTML = "";
  canvas.requestPointerLock?.();
};

const updatePlayer = (dt) => {
  const player = state.player;
  const turn = (state.keys.ArrowRight ? 1 : 0) - (state.keys.ArrowLeft ? 1 : 0);
  player.angle = normAngle(player.angle + turn * dt * 2.2);
  player.hurtTimer = Math.max(0, player.hurtTimer - dt);
  player.shootCooldown = Math.max(0, player.shootCooldown - dt);
  player.meleeCooldown = Math.max(0, player.meleeCooldown - dt);
  player.dashCooldown = Math.max(0, player.dashCooldown - dt);
  player.style = Math.max(0, player.style - dt * 16);
  player.styleTimer = Math.max(0, player.styleTimer - dt);

  const forward = (state.keys.KeyW ? 1 : 0) - (state.keys.KeyS ? 1 : 0);
  const strafe = (state.keys.KeyD ? 1 : 0) - (state.keys.KeyA ? 1 : 0);
  const baseSpeed = player.dashTimer > 0 ? 7.8 : 3.5;
  let moveX = 0;
  let moveY = 0;
  if (forward || strafe) {
    moveX = Math.cos(player.angle) * forward + Math.cos(player.angle + Math.PI / 2) * strafe;
    moveY = Math.sin(player.angle) * forward + Math.sin(player.angle + Math.PI / 2) * strafe;
    const length = Math.hypot(moveX, moveY) || 1;
    moveX /= length;
    moveY /= length;
  }

  if (player.dashTimer > 0) {
    player.dashTimer -= dt;
    attemptMove(player, player.dashDir.x * dt * baseSpeed, player.dashDir.y * dt * baseSpeed);
  } else if (forward || strafe) {
    attemptMove(player, moveX * dt * baseSpeed, moveY * dt * baseSpeed);
  }

  if (state.mouseDown) fireWeapon();
  if (isHazard(player.x, player.y) && state.time % 0.2 < dt) damagePlayer(3, "#ff8e52");
  if (activeEnemyCount() === 0 && isExit(player.x, player.y)) finishLevel();
};

const tryDash = () => {
  const player = state.player;
  if (!player || player.dashCooldown > 0 || state.mode !== "playing") return;
  const forward = (state.keys.KeyW ? 1 : 0) - (state.keys.KeyS ? 1 : 0);
  const strafe = (state.keys.KeyD ? 1 : 0) - (state.keys.KeyA ? 1 : 0);
  let dx = Math.cos(player.angle) * forward + Math.cos(player.angle + Math.PI / 2) * strafe;
  let dy = Math.sin(player.angle) * forward + Math.sin(player.angle + Math.PI / 2) * strafe;
  if (!forward && !strafe) {
    dx = Math.cos(player.angle);
    dy = Math.sin(player.angle);
  }
  const length = Math.hypot(dx, dy) || 1;
  player.dashDir = { x: dx / length, y: dy / length };
  player.dashTimer = 0.18;
  player.dashCooldown = 0.95;
  player.style += 12;
};

const updateEnemies = (dt) => {
  state.enemies.forEach((enemy) => {
    if (!enemy.alive) return;
    const data = ENEMY_TYPES[enemy.type];
    const dx = state.player.x - enemy.x;
    const dy = state.player.y - enemy.y;
    const distance = Math.hypot(dx, dy);
    const targetAngle = Math.atan2(dy, dx);
    enemy.facing = normAngle(lerp(enemy.facing, targetAngle, 0.06));
    enemy.cooldown = Math.max(0, enemy.cooldown - dt);
    enemy.hurtTimer = Math.max(0, enemy.hurtTimer - dt);
    enemy.phase += dt * (enemy.type === "drone" ? 4 : 2.2);
    const hasSight = hasLineOfSight(enemy.x, enemy.y, state.player.x, state.player.y);
    if (!hasSight) {
      const wander = Math.sin(enemy.phase + enemy.x) * 0.35;
      attemptMove(enemy, Math.cos(enemy.facing + wander) * dt * data.speed * 0.35, Math.sin(enemy.facing + wander) * dt * data.speed * 0.35);
      return;
    }
    if (distance > data.preferredRange + 0.35 || data.attackKind === "melee" || data.attackKind === "explode") {
      attemptMove(enemy, Math.cos(targetAngle) * dt * data.speed, Math.sin(targetAngle) * dt * data.speed);
    } else if (distance < data.preferredRange * 0.7) {
      attemptMove(enemy, -Math.cos(targetAngle) * dt * data.speed * 0.65, -Math.sin(targetAngle) * dt * data.speed * 0.65);
    } else if (enemy.type === "drone" || enemy.type === "stalker") {
      attemptMove(enemy, Math.cos(targetAngle + Math.PI / 2) * dt * data.speed * 0.6, Math.sin(targetAngle + Math.PI / 2) * dt * data.speed * 0.6);
    }
    if (enemy.cooldown > 0) return;
    if (data.attackKind === "melee" && distance < 1.1) {
      enemy.cooldown = data.attackCooldown;
      damagePlayer(data.meleeDamage);
      return;
    }
    if (data.attackKind === "explode" && distance < 0.95) {
      enemy.alive = false;
      explode(enemy.x, enemy.y, data.splash, data.meleeDamage, false, "#ff8755");
      return;
    }
    if (distance > data.preferredRange + 1.5) return;
    enemy.cooldown = data.attackCooldown;
    if (data.attackKind === "fireball" || data.attackKind === "hex") {
      spawnProjectile({ x: enemy.x, y: enemy.y, vx: Math.cos(targetAngle) * data.projectileSpeed, vy: Math.sin(targetAngle) * data.projectileSpeed, radius: data.projectileRadius, damage: data.projectileDamage, color: data.projectileColor, friendly: false });
    } else if (data.attackKind === "burst") {
      [-0.12, 0, 0.12].forEach((offset) => spawnProjectile({ x: enemy.x, y: enemy.y, vx: Math.cos(targetAngle + offset) * data.projectileSpeed, vy: Math.sin(targetAngle + offset) * data.projectileSpeed, radius: data.projectileRadius, damage: data.projectileDamage, color: data.projectileColor, friendly: false }));
    } else if (data.attackKind === "volley") {
      [-0.22, -0.08, 0.08, 0.22].forEach((offset) => spawnProjectile({ x: enemy.x, y: enemy.y, vx: Math.cos(targetAngle + offset) * data.projectileSpeed, vy: Math.sin(targetAngle + offset) * data.projectileSpeed, radius: data.projectileRadius, damage: data.projectileDamage, color: data.projectileColor, friendly: false }));
    } else if (data.attackKind === "quake") {
      for (let index = 0; index < 6; index += 1) {
        const angle = (Math.PI * 2 * index) / 6;
        spawnProjectile({ x: enemy.x, y: enemy.y, vx: Math.cos(angle) * data.projectileSpeed, vy: Math.sin(angle) * data.projectileSpeed, radius: data.projectileRadius, damage: data.projectileDamage, color: data.projectileColor, friendly: false });
      }
    } else if (data.attackKind === "seraph") {
      const fan = enemy.health < 160 ? [-0.32, -0.18, -0.05, 0.05, 0.18, 0.32] : [-0.18, 0, 0.18];
      fan.forEach((offset) => spawnProjectile({ x: enemy.x, y: enemy.y, vx: Math.cos(targetAngle + offset) * data.projectileSpeed, vy: Math.sin(targetAngle + offset) * data.projectileSpeed, radius: data.projectileRadius, damage: data.projectileDamage, color: data.projectileColor, friendly: false }));
    }
  });
};

const updateProjectiles = (dt) => {
  state.projectiles = state.projectiles.filter((projectile) => {
    projectile.x += projectile.vx * dt;
    projectile.y += projectile.vy * dt;
    projectile.life -= dt;
    if (projectile.life <= 0 || isWall(projectile.x, projectile.y)) {
      if (projectile.splash) explode(projectile.x, projectile.y, projectile.splash, projectile.damage, projectile.friendly, projectile.color);
      return false;
    }
    if (projectile.friendly) {
      const target = state.enemies.find((enemy) => enemy.alive && dist(projectile.x, projectile.y, enemy.x, enemy.y) < enemy.radius + projectile.radius);
      if (target) {
        if (projectile.splash) explode(projectile.x, projectile.y, projectile.splash, projectile.damage, true, projectile.color);
        else damageEnemy(target, projectile.damage, 8);
        return false;
      }
    } else if (dist(projectile.x, projectile.y, state.player.x, state.player.y) < state.player.radius + projectile.radius) {
      damagePlayer(projectile.damage, projectile.color);
      return false;
    }
    return true;
  });
};

const updateParticles = (dt) => {
  state.beams = state.beams.filter((beam) => ((beam.ttl -= dt) > 0));
  state.particles = state.particles.filter((particle) => {
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.vx *= 0.95;
    particle.vy *= 0.95;
    particle.life -= dt;
    return particle.life > 0;
  });
};

const updatePickupsAndSecrets = () => {
  state.pickups = state.pickups.filter((pickup) => {
    pickup.bob += 0.04;
    if (dist(state.player.x, state.player.y, pickup.x, pickup.y) < 0.52) {
      applyPickup(pickup);
      return false;
    }
    return true;
  });
  state.levelData.secrets.forEach((secret) => {
    if (secret.found || secret.type !== "zone") return;
    if (dist(state.player.x, state.player.y, secret.x, secret.y) < secret.radius) discoverSecret(secret);
  });
};

const updateMessages = (dt) => {
  state.messages = state.messages.filter((message) => ((message.ttl -= dt) > 0));
};

const update = (dt) => {
  if (state.mode !== "playing") return;
  state.time += dt;
  updatePlayer(dt);
  updateEnemies(dt);
  updateProjectiles(dt);
  updateParticles(dt);
  updatePickupsAndSecrets();
  updateMessages(dt);
};

const wallColor = (cell, distanceValue) => {
  const theme = state.levelData.theme;
  const base = cell === "h" ? theme.wallB : theme.wallA;
  const shade = clamp(1 - distanceValue / 16, 0.22, 1);
  const rgb = base.replace("#", "");
  const full = rgb.length === 3 ? rgb.split("").map((char) => char + char).join("") : rgb;
  const color = [0, 2, 4]
    .map((offset) => Math.round(parseInt(full.slice(offset, offset + 2), 16) * shade).toString(16).padStart(2, "0"))
    .join("");
  return `#${color}`;
};

const renderBackdrop = () => {
  const { skyTop, skyBottom, floor, lava } = state.levelData.theme;
  const sky = ctx.createLinearGradient(0, 0, 0, HEIGHT * 0.58);
  sky.addColorStop(0, skyTop);
  sky.addColorStop(1, skyBottom);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, WIDTH, HEIGHT / 2);

  const ground = ctx.createLinearGradient(0, HEIGHT / 2, 0, HEIGHT);
  ground.addColorStop(0, floor);
  ground.addColorStop(1, "#050304");
  ctx.fillStyle = ground;
  ctx.fillRect(0, HEIGHT / 2, WIDTH, HEIGHT / 2);

  ctx.fillStyle = `${lava}18`;
  for (let index = 0; index < 18; index += 1) {
    const y = HEIGHT / 2 + index * 6;
    ctx.fillRect(0, y, WIDTH, 1);
  }
};

const castWalls = () => {
  renderBackdrop();
  for (let column = 0; column < WIDTH; column += 1) {
    const rayAngle = state.player.angle - HALF_FOV + (column / WIDTH) * FOV;
    let distanceToWall = 0.02;
    let hitCell = "#";
    while (distanceToWall < MAX_DEPTH) {
      const sampleX = state.player.x + Math.cos(rayAngle) * distanceToWall;
      const sampleY = state.player.y + Math.sin(rayAngle) * distanceToWall;
      if (isWall(sampleX, sampleY)) {
        hitCell = getRawCell(Math.floor(sampleX), Math.floor(sampleY));
        break;
      }
      distanceToWall += 0.035;
    }
    const corrected = distanceToWall * Math.cos(rayAngle - state.player.angle);
    state.depthBuffer[column] = corrected;
    const wallHeight = HEIGHT / Math.max(corrected, 0.12);
    const top = Math.floor(HEIGHT / 2 - wallHeight / 2);
    const hitPattern = Math.abs(Math.sin(distanceToWall * 4 + column * 0.02));
    ctx.fillStyle = wallColor(hitCell, corrected);
    ctx.fillRect(column, top, 1, wallHeight);
    ctx.fillStyle = `rgba(255, 220, 170, ${0.05 * hitPattern})`;
    ctx.fillRect(column, top, 1, Math.max(1, wallHeight * 0.18));
  }
};

const worldToCamera = (x, y) => {
  const dx = x - state.player.x;
  const dy = y - state.player.y;
  return {
    camX: dx * Math.sin(state.player.angle) - dy * Math.cos(state.player.angle),
    camY: dx * Math.cos(state.player.angle) + dy * Math.sin(state.player.angle),
  };
};

const drawSpriteOccluded = (sprite, x, y, size = 1.2, lift = 0.76) => {
  const camera = worldToCamera(x, y);
  if (camera.camY <= 0.15) return;
  const focal = WIDTH / (2 * Math.tan(HALF_FOV));
  const screenX = WIDTH / 2 + (camera.camX / camera.camY) * focal;
  const height = (size / camera.camY) * focal;
  const width = height * (sprite.width / sprite.height);
  const top = HEIGHT / 2 - height * lift;
  const left = screenX - width / 2;
  const step = width / sprite.width;
  for (let sx = 0; sx < sprite.width; sx += 1) {
    const destX = left + sx * step;
    const column = Math.floor(destX);
    if (column < 0 || column >= WIDTH) continue;
    if (camera.camY > state.depthBuffer[column] + 0.1) continue;
    ctx.drawImage(sprite, sx, 0, 1, sprite.height, destX, top, Math.max(1, step + 0.2), height);
  }
};

const renderBeams = () => {
  const focal = WIDTH / (2 * Math.tan(HALF_FOV));
  state.beams.forEach((beam) => {
    const from = worldToCamera(beam.fromX, beam.fromY);
    const to = worldToCamera(beam.toX, beam.toY);
    if (from.camY <= 0.1 && to.camY <= 0.1) return;
    ctx.strokeStyle = beam.color;
    ctx.globalAlpha = beam.ttl / 0.06;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(WIDTH / 2 + (from.camX / Math.max(from.camY, 0.1)) * focal, HEIGHT / 2 + 8);
    ctx.lineTo(WIDTH / 2 + (to.camX / Math.max(to.camY, 0.1)) * focal, HEIGHT / 2 - 8);
    ctx.stroke();
    ctx.globalAlpha = 1;
  });
};

const renderObjects = () => {
  const drawables = [];
  state.pickups.forEach((pickup) => drawables.push({ kind: "pickup", distance: dist(state.player.x, state.player.y, pickup.x, pickup.y), pickup }));
  state.enemies.forEach((enemy) => {
    if (enemy.alive) drawables.push({ kind: "enemy", distance: dist(state.player.x, state.player.y, enemy.x, enemy.y), enemy });
  });
  state.projectiles.forEach((projectile) => drawables.push({ kind: "projectile", distance: dist(state.player.x, state.player.y, projectile.x, projectile.y), projectile }));
  state.particles.forEach((particle) => drawables.push({ kind: "particle", distance: dist(state.player.x, state.player.y, particle.x, particle.y), particle }));
  drawables.sort((left, right) => right.distance - left.distance);

  drawables.forEach((entry) => {
    if (entry.kind === "pickup") {
      const sprite = atlas[PICKUP_MODELS[entry.pickup.type]][Math.floor((state.time * 4 + entry.pickup.bob) % 8)][Math.floor((state.time * 4) % 4)];
      drawSpriteOccluded(sprite, entry.pickup.x, entry.pickup.y, 0.9, 0.78);
      return;
    }
    if (entry.kind === "enemy") {
      const enemy = entry.enemy;
      const model = ENEMY_TYPES[enemy.type].model;
      const viewerAngle = Math.atan2(state.player.y - enemy.y, state.player.x - enemy.x);
      const relative = ((viewerAngle - enemy.facing) / (Math.PI * 2) + 1) % 1;
      const direction = Math.round(relative * 8) % 8;
      const frame = Math.floor((enemy.phase * 1.6) % 4);
      const sprite = atlas[model][direction][frame];
      drawSpriteOccluded(sprite, enemy.x, enemy.y, ENEMY_TYPES[enemy.type].boss ? 2.2 : ENEMY_TYPES[enemy.type].miniBoss ? 1.85 : 1.3, 0.9);
      return;
    }
    const source = entry.kind === "projectile" ? entry.projectile : entry.particle;
    const camera = worldToCamera(source.x, source.y);
    if (camera.camY <= 0.1) return;
    const focal = WIDTH / (2 * Math.tan(HALF_FOV));
    const screenX = WIDTH / 2 + (camera.camX / camera.camY) * focal;
    const size = entry.kind === "projectile" ? clamp((22 / camera.camY) * (source.radius * 1.8), 2, 40) : clamp((14 / camera.camY) * 0.8, 1, 8);
    const screenY = HEIGHT / 2 - size * 0.4;
    const column = clamp(Math.floor(screenX), 0, WIDTH - 1);
    if (camera.camY > state.depthBuffer[column] + 0.08) return;
    ctx.fillStyle = source.color;
    ctx.globalAlpha = entry.kind === "projectile" ? 0.95 : clamp(source.life * 2, 0.1, 0.9);
    ctx.beginPath();
    ctx.arc(screenX, screenY, size, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  });
};

const currentBoss = () => state.enemies.find((enemy) => enemy.alive && (ENEMY_TYPES[enemy.type].boss || ENEMY_TYPES[enemy.type].miniBoss));

const styleRank = () => {
  const style = state.player.style;
  if (style > 950) return "ULTRA";
  if (style > 700) return "S";
  if (style > 450) return "A";
  if (style > 220) return "B";
  if (style > 100) return "C";
  return "D";
};

const drawBar = (x, y, width, height, fill, back, color, label, value) => {
  ctx.fillStyle = back;
  ctx.fillRect(x, y, width, height);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, width * clamp(fill, 0, 1), height);
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.strokeRect(x, y, width, height);
  ctx.fillStyle = "#fbe8c9";
  ctx.font = "10px monospace";
  ctx.fillText(`${label} ${value}`, x + 4, y + height - 4);
};

const renderHud = () => {
  ctx.fillStyle = "rgba(0,0,0,0.24)";
  ctx.fillRect(0, HEIGHT - 44, WIDTH, 44);
  drawBar(10, HEIGHT - 32, 110, 10, state.player.health / 100, "rgba(255,255,255,0.08)", "#ff5568", "HP", Math.round(state.player.health));
  drawBar(128, HEIGHT - 32, 90, 10, state.player.armor / 100, "rgba(255,255,255,0.08)", "#71f0a4", "AR", Math.round(state.player.armor));
  drawBar(226, HEIGHT - 32, 74, 10, 1 - state.player.dashCooldown / 0.95, "rgba(255,255,255,0.08)", "#ffd168", "DS", state.player.dashCooldown <= 0 ? "RDY" : (0.95 - state.player.dashCooldown).toFixed(1));

  ctx.fillStyle = "#fbe8c9";
  ctx.font = "11px monospace";
  const weapon = currentWeaponData();
  const ammoText = weapon.ammoType ? `${state.player.ammo[weapon.ammoType]} ${weapon.ammoType.toUpperCase()}` : "INF";
  ctx.fillText(`${state.levelData.id} ${state.levelData.name.toUpperCase()}`, 10, 14);
  ctx.fillText(`${weapon.name.toUpperCase()} // ${ammoText}`, 10, HEIGHT - 10);
  ctx.fillText(`KILLS ${state.kills}/${state.enemies.length}`, 320, HEIGHT - 24);
  ctx.fillText(`SECRETS ${state.secretsFound}/${totalSecrets()}`, 320, HEIGHT - 12);
  ctx.fillText(`STYLE ${styleRank()} ${Math.round(state.player.style)}`, 320, 14);

  const boss = currentBoss();
  if (boss) {
    const data = ENEMY_TYPES[boss.type];
    drawBar(110, 24, 260, 12, boss.health / data.health, "rgba(255,255,255,0.08)", data.boss ? "#fff0aa" : "#ffab68", data.name.toUpperCase(), Math.max(0, Math.round(boss.health)));
  }

  ctx.strokeStyle = "rgba(255,245,196,0.85)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(WIDTH / 2 - 5, HEIGHT / 2);
  ctx.lineTo(WIDTH / 2 + 5, HEIGHT / 2);
  ctx.moveTo(WIDTH / 2, HEIGHT / 2 - 5);
  ctx.lineTo(WIDTH / 2, HEIGHT / 2 + 5);
  ctx.stroke();

  state.messages.slice(-3).forEach((message, index) => {
    ctx.fillStyle = message.color;
    ctx.fillText(message.text, 10, 34 + index * 12);
  });

  if (activeEnemyCount() > 0) {
    ctx.fillStyle = "#ffd08e";
    ctx.fillText(`EXIT SEALED // ${activeEnemyCount()} HOSTILES REMAIN`, WIDTH - 172, 34);
  }
};

const render = () => {
  if (!state.levelData || state.mode === "menu") {
    ctx.fillStyle = "#080406";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    return;
  }
  castWalls();
  renderObjects();
  renderBeams();
  renderHud();
  if (state.player.hurtTimer > 0) {
    ctx.fillStyle = `rgba(255, 60, 60, ${state.player.hurtTimer * 0.4})`;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }
};

const showMenuOverlay = () => {
  const buttons = LEVELS.map((level) => {
    const unlocked = levelUnlocked(level.id);
    const best = state.save.bestRanks[level.id] ? `Best ${state.save.bestRanks[level.id]}` : "Uncleared";
    return `
      <button class="level-button ${unlocked ? "" : "locked"}" ${unlocked ? `data-level="${level.id}"` : "disabled"}>
        <strong>${level.id} // ${level.name}</strong>
        <span>${level.subtitle}</span>
        <span>${best}</span>
      </button>
    `;
  }).join("");
  overlay.innerHTML = `
    <div class="panel">
      <div class="hero">
        <div class="eyebrow">Retro FPS In Hell</div>
        <h1 class="title">Infernal Velocity<small>High-speed descent campaign</small></h1>
        <p class="subtext">Eight custom levels, multiple unlockable weapons, layered secrets, minibosses, and a final throne fight. Click a level, click the canvas to lock the mouse, then move fast and keep pressure on every arena.</p>
      </div>
      <div class="menu-grid">
        <div class="card">
          <h3 class="eyebrow">Deployment</h3>
          <div class="level-list">${buttons}</div>
        </div>
        <div class="focus-panel card">
          <div>
            <h3>Controls</h3>
            <p><strong>Move:</strong> WASD<br><strong>Aim:</strong> mouse or arrows<br><strong>Shoot:</strong> click<br><strong>Dash:</strong> Shift<br><strong>Melee:</strong> F<br><strong>Interact secret walls:</strong> E<br><strong>Weapons:</strong> 1-5 or mouse wheel</p>
          </div>
          <div>
            <h3>Loadout</h3>
            <div class="badge-row">
              ${WEAPON_ORDER.filter((id) => weaponUnlocked(id)).map((id) => `<span class="badge">${WEAPONS[id].name}</span>`).join("")}
            </div>
          </div>
          <div>
            <h3>Campaign Notes</h3>
            <p>Level exits stay sealed until every hostile is down. Hidden walls hide caches and alt routes, and style rises faster when you stay aggressive.</p>
          </div>
          <div class="actions">
            <button class="action-button primary" data-action="start-last">Start Last Cleared</button>
            <button class="action-button" data-action="reset-save">Reset Progress</button>
          </div>
        </div>
      </div>
    </div>
  `;
};

const showResultsOverlay = () => {
  const nextIndex = LEVEL_SEQUENCE.indexOf(state.results.levelId) + 1;
  const nextLevel = LEVEL_SEQUENCE[nextIndex];
  overlay.innerHTML = `
    <div class="panel">
      <div class="hero">
        <div class="eyebrow">Level Complete</div>
        <h2 class="title">${state.results.levelId}<small>${state.results.name}</small></h2>
        <p class="subtext">Rank ${state.results.rank}. The descent only gets worse from here.</p>
      </div>
      <div class="summary-grid">
        <div class="summary-tile"><span>Rank</span><strong>${state.results.rank}</strong></div>
        <div class="summary-tile"><span>Time</span><strong>${state.results.time}s</strong></div>
        <div class="summary-tile"><span>Kills</span><strong>${state.results.kills}/${state.results.totalKills}</strong></div>
        <div class="summary-tile"><span>Secrets</span><strong>${state.results.secrets}/${state.results.totalSecrets}</strong></div>
      </div>
      <div class="actions">
        ${nextLevel ? `<button class="action-button primary" data-level="${nextLevel}">Next Level</button>` : `<button class="action-button primary" data-action="menu">Campaign Menu</button>`}
        <button class="action-button" data-level="${state.results.levelId}">Replay</button>
        <button class="action-button" data-action="menu">Menu</button>
      </div>
    </div>
  `;
};

const showDeathOverlay = () => {
  document.exitPointerLock?.();
  overlay.innerHTML = `
    <div class="panel">
      <div class="hero">
        <div class="eyebrow danger">Run Failed</div>
        <h2 class="title">You Were Torn Apart<small>Hell keeps the receipt</small></h2>
        <p class="subtext">Retry the encounter or back out and choose another route through the campaign.</p>
      </div>
      <div class="actions">
        <button class="action-button primary" data-level="${state.levelData.id}">Retry</button>
        <button class="action-button" data-action="menu">Menu</button>
      </div>
    </div>
  `;
};

const backToMenu = () => {
  document.exitPointerLock?.();
  state.mode = "menu";
  state.levelData = null;
  showMenuOverlay();
};

overlay.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  if (target.dataset.level) {
    startLevel(target.dataset.level);
    return;
  }
  if (target.dataset.action === "menu") {
    backToMenu();
    return;
  }
  if (target.dataset.action === "start-last") {
    startLevel(state.save.lastLevel || LEVEL_SEQUENCE[0]);
    return;
  }
  if (target.dataset.action === "reset-save") {
    state.save = defaultSave();
    persist();
    showMenuOverlay();
  }
});

window.addEventListener("keydown", (event) => {
  state.keys[event.code] = true;
  if (event.code === "ShiftLeft" || event.code === "ShiftRight") tryDash();
  if (event.code === "KeyF" && state.mode === "playing") meleeAttack();
  if (event.code === "KeyE" && state.mode === "playing") interact();
  if (event.code === "Digit1" && state.mode === "playing" && weaponUnlocked("revolver")) state.player.currentWeapon = "revolver";
  if (event.code === "Digit2" && state.mode === "playing" && weaponUnlocked("shotgun")) state.player.currentWeapon = "shotgun";
  if (event.code === "Digit3" && state.mode === "playing" && weaponUnlocked("nailer")) state.player.currentWeapon = "nailer";
  if (event.code === "Digit4" && state.mode === "playing" && weaponUnlocked("arc")) state.player.currentWeapon = "arc";
  if (event.code === "Digit5" && state.mode === "playing" && weaponUnlocked("launcher")) state.player.currentWeapon = "launcher";
  if (event.code === "Escape" && state.mode === "playing") backToMenu();
});

window.addEventListener("keyup", (event) => {
  state.keys[event.code] = false;
});

window.addEventListener("mousedown", () => {
  state.mouseDown = true;
  if (state.mode === "playing") canvas.requestPointerLock?.();
});
window.addEventListener("mouseup", () => {
  state.mouseDown = false;
});
window.addEventListener("wheel", (event) => {
  if (state.mode !== "playing") return;
  switchWeapon(event.deltaY > 0 ? 1 : -1);
});
window.addEventListener("mousemove", (event) => {
  if (document.pointerLockElement === canvas && state.mode === "playing") {
    state.player.angle = normAngle(state.player.angle + event.movementX * 0.0028);
  }
});
canvas.addEventListener("click", () => {
  if (state.mode === "playing") canvas.requestPointerLock?.();
});

document.addEventListener("pointerlockchange", () => {
  if (state.mode === "playing" && document.pointerLockElement !== canvas) {
    pushMessage("Mouse unlocked. Click the canvas to resume aiming.", 2.2, "#ffe5a1");
  }
});

let lastFrame = performance.now();
const frame = (now) => {
  const dt = Math.min(0.033, (now - lastFrame) / 1000);
  lastFrame = now;
  update(dt);
  render();
  requestAnimationFrame(frame);
};

showMenuOverlay();
requestAnimationFrame(frame);

