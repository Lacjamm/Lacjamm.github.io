const part = (size, pos, color, options = {}) => ({
  size,
  pos,
  color,
  ...options,
});

const withShade = (hex, amount) => {
  const value = hex.replace("#", "");
  const full = value.length === 3
    ? value.split("").map((char) => char + char).join("")
    : value;
  const channels = [0, 2, 4].map((offset) => parseInt(full.slice(offset, offset + 2), 16));
  const mix = amount >= 0 ? 255 : 0;
  const ratio = Math.min(1, Math.abs(amount));
  const next = channels.map((channel) => {
    const blended = Math.round(channel + (mix - channel) * ratio);
    return blended.toString(16).padStart(2, "0");
  });
  return `#${next.join("")}`;
};

const MODELS = {
  husk: [
    part([0.34, 0.72, 0.22], [0, 0.8, 0], "#8fb6d6"),
    part([0.26, 0.26, 0.24], [0, 1.37, 0.02], "#3b5d7d", { glow: "#b8ddff" }),
    part([0.1, 0.54, 0.1], [-0.24, 0.84, 0.04], "#7fa3be", { animate: "armL" }),
    part([0.1, 0.54, 0.1], [0.24, 0.84, 0.04], "#7fa3be", { animate: "armR" }),
    part([0.1, 0.52, 0.12], [-0.12, 0.23, 0], "#5e89ab", { animate: "legL" }),
    part([0.1, 0.52, 0.12], [0.12, 0.23, 0], "#5e89ab", { animate: "legR" }),
  ],
  idolist: [
    part([0.4, 0.9, 0.28], [0, 0.86, 0], "#69456a"),
    part([0.24, 0.24, 0.24], [0, 1.5, 0.05], "#f4b85c", { glow: "#ffd989" }),
    part([0.08, 0.62, 0.08], [-0.32, 0.95, 0], "#c26f3d", { animate: "robeL" }),
    part([0.08, 0.62, 0.08], [0.32, 0.95, 0], "#c26f3d", { animate: "robeR" }),
    part([0.72, 0.06, 0.18], [0, 0.54, 0.04], "#8c3645"),
    part([0.12, 0.28, 0.12], [0, 1.06, 0.25], "#d34e45", { animate: "pulse" }),
  ],
  drone: [
    part([0.5, 0.18, 0.36], [0, 0.95, 0], "#cb7430"),
    part([0.22, 0.18, 0.22], [0, 1.12, 0], "#70311f", { glow: "#ffb562" }),
    part([0.82, 0.05, 0.22], [0, 0.95, 0], "#f0a65a", { animate: "wing" }),
    part([0.14, 0.36, 0.14], [0, 0.6, 0.08], "#7d2b29"),
  ],
  boiler: [
    part([0.42, 0.62, 0.42], [0, 0.62, 0], "#6b3f34"),
    part([0.34, 0.34, 0.34], [0, 1.18, 0], "#a3493d", { glow: "#ff8d61" }),
    part([0.1, 0.44, 0.1], [-0.2, 0.2, 0], "#4d2a24"),
    part([0.1, 0.44, 0.1], [0.2, 0.2, 0], "#4d2a24"),
    part([0.54, 0.06, 0.06], [0, 0.86, 0], "#d9ab66", { animate: "fuse" }),
  ],
  sentinel: [
    part([0.54, 1.02, 0.36], [0, 1, 0], "#8b3428"),
    part([0.28, 0.28, 0.28], [0, 1.72, 0], "#efe4c3", { glow: "#fff1b4" }),
    part([0.14, 0.72, 0.14], [-0.34, 1.04, 0.02], "#5b1d16", { animate: "armL" }),
    part([0.14, 0.72, 0.14], [0.34, 1.04, 0.02], "#5b1d16", { animate: "armR" }),
    part([0.14, 0.78, 0.14], [-0.16, 0.25, 0], "#492018", { animate: "legL" }),
    part([0.14, 0.78, 0.14], [0.16, 0.25, 0], "#492018", { animate: "legR" }),
    part([0.82, 0.08, 0.14], [0, 1.28, 0.12], "#d48b4a"),
  ],
  stalker: [
    part([0.36, 0.82, 0.26], [0, 0.92, 0], "#343348"),
    part([0.24, 0.24, 0.24], [0, 1.46, 0.02], "#ad4cd4", { glow: "#e6abff" }),
    part([0.08, 0.68, 0.08], [-0.32, 1.02, 0], "#514c6d", { animate: "armL" }),
    part([0.08, 0.68, 0.08], [0.32, 1.02, 0], "#514c6d", { animate: "armR" }),
    part([0.08, 0.6, 0.08], [-0.12, 0.3, 0], "#3b3755", { animate: "legL" }),
    part([0.08, 0.6, 0.08], [0.12, 0.3, 0], "#3b3755", { animate: "legR" }),
    part([0.8, 0.03, 0.14], [0, 0.86, 0.08], "#8d6dd2", { animate: "wing" }),
  ],
  behemoth: [
    part([0.9, 1.3, 0.56], [0, 1.1, 0], "#7a2e1d"),
    part([0.44, 0.44, 0.42], [0, 2.02, 0.04], "#f4bf72", { glow: "#ffe5af" }),
    part([0.18, 1.02, 0.18], [-0.56, 1.18, 0.02], "#53160f", { animate: "armL" }),
    part([0.18, 1.02, 0.18], [0.56, 1.18, 0.02], "#53160f", { animate: "armR" }),
    part([0.22, 1.04, 0.22], [-0.22, 0.12, 0], "#42100d", { animate: "legL" }),
    part([0.22, 1.04, 0.22], [0.22, 0.12, 0], "#42100d", { animate: "legR" }),
    part([1.28, 0.12, 0.22], [0, 1.52, 0.16], "#d3682d"),
  ],
  throne: [
    part([0.68, 1.08, 0.44], [0, 1.18, 0], "#d4d5db"),
    part([0.32, 0.32, 0.32], [0, 1.92, 0], "#ffe2b8", { glow: "#fff7c8" }),
    part([0.12, 0.88, 0.12], [-0.44, 1.12, 0.04], "#b2672d", { animate: "armL" }),
    part([0.12, 0.88, 0.12], [0.44, 1.12, 0.04], "#b2672d", { animate: "armR" }),
    part([0.18, 1.02, 0.18], [-0.16, 0.18, 0], "#8d8f98", { animate: "legL" }),
    part([0.18, 1.02, 0.18], [0.16, 0.18, 0], "#8d8f98", { animate: "legR" }),
    part([1.34, 0.08, 0.26], [0, 1.46, 0.1], "#efc46a"),
    part([0.12, 0.48, 0.8], [0, 1.26, -0.34], "#ff9270", { animate: "banner" }),
  ],
  healthOrb: [
    part([0.28, 0.28, 0.28], [0, 0.56, 0], "#ff5c69", { glow: "#ffc0c7" }),
    part([0.06, 0.56, 0.06], [0, 0.18, 0], "#692228"),
  ],
  armorPlate: [
    part([0.42, 0.52, 0.16], [0, 0.6, 0], "#7df0a1", { glow: "#b8ffd0" }),
    part([0.52, 0.08, 0.22], [0, 0.62, 0.06], "#296a43"),
  ],
  ammoBox: [
    part([0.44, 0.28, 0.32], [0, 0.36, 0], "#b28754"),
    part([0.42, 0.08, 0.28], [0, 0.56, 0], "#ffd269"),
  ],
  shellCrate: [
    part([0.44, 0.28, 0.32], [0, 0.36, 0], "#84502b"),
    part([0.12, 0.12, 0.22], [-0.12, 0.56, 0.02], "#ffbb5a"),
    part([0.12, 0.12, 0.22], [0.12, 0.56, 0.02], "#ffbb5a"),
  ],
  battery: [
    part([0.2, 0.52, 0.2], [0, 0.52, 0], "#6bcfff", { glow: "#ccffff" }),
    part([0.3, 0.08, 0.3], [0, 0.14, 0], "#1f5a7c"),
  ],
  rocketRack: [
    part([0.38, 0.16, 0.18], [0, 0.36, 0], "#494949"),
    part([0.1, 0.36, 0.1], [-0.14, 0.72, 0], "#f56b44"),
    part([0.1, 0.36, 0.1], [0, 0.72, 0], "#f56b44"),
    part([0.1, 0.36, 0.1], [0.14, 0.72, 0], "#f56b44"),
  ],
  shotgunPickup: [
    part([0.7, 0.08, 0.14], [0, 0.52, 0], "#dbc398"),
    part([0.28, 0.1, 0.1], [0.26, 0.6, 0], "#5b3426"),
  ],
  nailerPickup: [
    part([0.56, 0.1, 0.18], [0, 0.52, 0], "#bda6ff"),
    part([0.12, 0.28, 0.12], [0.16, 0.74, 0], "#52408a"),
    part([0.16, 0.22, 0.16], [-0.16, 0.62, 0], "#9074ff"),
  ],
  arcPickup: [
    part([0.58, 0.1, 0.12], [0, 0.54, 0], "#8fe5ff"),
    part([0.14, 0.14, 0.34], [0.18, 0.7, 0], "#46bbff", { glow: "#cbffff" }),
  ],
  launcherPickup: [
    part([0.76, 0.14, 0.16], [0, 0.52, 0], "#e26c4a"),
    part([0.2, 0.18, 0.2], [0.18, 0.68, 0], "#87402c"),
    part([0.16, 0.12, 0.12], [-0.18, 0.56, 0], "#ffbc7b"),
  ],
};

const FACE_DEFS = [
  { points: [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]], shade: 0.08 },
  { points: [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]], shade: -0.2 },
  { points: [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]], shade: -0.12 },
  { points: [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]], shade: 0 },
  { points: [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]], shade: 0.2 },
  { points: [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]], shade: -0.24 },
];

const projectPoint = (point, yaw, scale = 38) => {
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  const rx = point[0] * cos - point[2] * sin;
  const rz = point[0] * sin + point[2] * cos;
  const depth = rz + 3.8;
  const perspective = scale / depth;
  return {
    x: rx * perspective,
    y: -point[1] * perspective,
    depth,
  };
};

const animatedOffset = (descriptor, phase) => {
  if (!descriptor.animate) {
    return { x: 0, y: 0, z: 0 };
  }
  const stride = Math.sin(phase * Math.PI * 2);
  const sway = Math.cos(phase * Math.PI * 2);
  switch (descriptor.animate) {
    case "armL":
      return { x: 0, y: 0.02 * sway, z: 0.1 * stride };
    case "armR":
      return { x: 0, y: -0.02 * sway, z: -0.1 * stride };
    case "legL":
      return { x: 0, y: 0, z: -0.1 * stride };
    case "legR":
      return { x: 0, y: 0, z: 0.1 * stride };
    case "robeL":
      return { x: -0.03 * sway, y: 0, z: 0.04 * stride };
    case "robeR":
      return { x: 0.03 * sway, y: 0, z: -0.04 * stride };
    case "pulse":
      return { x: 0, y: 0.03 * sway, z: 0 };
    case "wing":
      return { x: 0, y: 0.04 * sway, z: 0 };
    case "fuse":
      return { x: 0, y: 0.02 * sway, z: 0 };
    case "banner":
      return { x: 0.05 * sway, y: 0, z: 0 };
    default:
      return { x: 0, y: 0, z: 0 };
  }
};

const toWorldPoint = (base, size, offset, template) => [
  base[0] + offset.x + template[0] * size[0] * 0.5,
  base[1] + offset.y + template[1] * size[1] * 0.5,
  base[2] + offset.z + template[2] * size[2] * 0.5,
];

const renderPartFaces = (descriptor, yaw, phase) => {
  const offset = animatedOffset(descriptor, phase);
  const faces = [];
  for (const face of FACE_DEFS) {
    const points = face.points.map((template) => toWorldPoint(descriptor.pos, descriptor.size, offset, template));
    const projected = points.map((point) => projectPoint(point, yaw));
    if (projected.some((point) => point.depth <= 0.2)) {
      continue;
    }
    const cross =
      (projected[1].x - projected[0].x) * (projected[2].y - projected[0].y) -
      (projected[1].y - projected[0].y) * (projected[2].x - projected[0].x);
    if (cross >= 0) {
      continue;
    }
    const averageDepth = projected.reduce((sum, point) => sum + point.depth, 0) / projected.length;
    faces.push({
      polygon: projected.map((point) => [point.x, point.y]),
      color: withShade(descriptor.color, face.shade),
      glow: descriptor.glow,
      depth: averageDepth,
    });
  }
  return faces;
};

const renderSprite = (modelKey, directionIndex, frameIndex) => {
  const source = MODELS[modelKey];
  const canvas = document.createElement("canvas");
  canvas.width = 96;
  canvas.height = 96;
  const ctx = canvas.getContext("2d");
  const yaw = (directionIndex / 8) * Math.PI * 2;
  const phase = frameIndex / 4;
  const faces = source.flatMap((descriptor) => renderPartFaces(descriptor, yaw, phase));
  faces.sort((left, right) => right.depth - left.depth);
  ctx.translate(canvas.width / 2, canvas.height * 0.78);
  for (const face of faces) {
    ctx.beginPath();
    face.polygon.forEach(([x, y], index) => {
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.closePath();
    ctx.fillStyle = face.color;
    ctx.fill();
    ctx.strokeStyle = withShade(face.color, -0.35);
    ctx.lineWidth = 1.2;
    ctx.stroke();
    if (face.glow) {
      ctx.save();
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = face.glow;
      ctx.fill();
      ctx.restore();
    }
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return canvas;
};

export const buildSpriteAtlas = (keys) => {
  const atlas = {};
  for (const key of keys) {
    atlas[key] = [];
    for (let direction = 0; direction < 8; direction += 1) {
      atlas[key][direction] = [];
      for (let frame = 0; frame < 4; frame += 1) {
        atlas[key][direction][frame] = renderSprite(key, direction, frame);
      }
    }
  }
  return atlas;
};

export const MODEL_KEYS = Object.keys(MODELS);
