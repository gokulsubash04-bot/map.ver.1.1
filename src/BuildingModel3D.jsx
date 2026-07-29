import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import "./BuildingModel3D.css";

/* ================= Floor / room data ================= */
const FLOOR_ORDER = ["ground", "first", "second"];

const WARM_ROOM_COLORS = {
  "101": "#f43f5e", "103": "#2563eb", "104": "#f59e0b", "105": "#10b981",
  "110": "#06b6d4", "108": "#d946ef", "106": "#3b82f6", "107": "#ea580c",
  "202": "#8b5cf6", "209": "#0f766e", "208": "#0284c7", "201": "#7c3aed",
  "207": "#ec4899", "203": "#9333ea", "204": "#1e40af", "205": "#059669", "206": "#c026d3",
  "301": "#00b4d8", "308": "#7e22ce", "307": "#10b981", "302": "#1d4ed8",
  "306": "#0891b2", "303": "#f43f5e", "304": "#2563eb", "305": "#6d28d9"
};

const DARK_ROOM_COLORS = {
  "101": "#0284c7", "103": "#059669", "104": "#d97706", "105": "#2563eb",
  "110": "#0369a1", "108": "#10b981", "106": "#1d4ed8", "107": "#b45309",
  "202": "#7c3aed", "209": "#0d9488", "208": "#0284c7", "201": "#2563eb",
  "207": "#059669", "203": "#6d28d9", "204": "#8b5cf6", "205": "#6366f1", "206": "#9333ea",
  "301": "#0284c7", "308": "#7c3aed", "307": "#2563eb", "302": "#0369a1",
  "306": "#0f766e", "303": "#059669", "304": "#1d4ed8", "305": "#6d28d9"
};

const FLOOR_DEFS = [
  {
    key: "ground",
    label: "Ground Floor",
    entrances: [
      { id: "ENT-L", x: 14, y: 430, name: "Main Entrance" },
      { id: "ENT-R", x: 626, y: 430, name: "Side Entrance" },
    ],
    rooms: [
      { id: "101", x: 30, y: 30, w: 220, h: 320, desc: "Lecture Hall" },
      { id: "103", x: 270, y: 30, w: 150, h: 170, desc: "Gents Waiting Room" },
      { id: "104", x: 440, y: 30, w: 170, h: 110, desc: "Gents Toilet" },
      { id: "105", x: 440, y: 150, w: 170, h: 300, desc: "Lecture Hall" },
      { id: "110", x: 30, y: 470, w: 220, h: 320, desc: "Lecture Hall" },
      { id: "108", x: 270, y: 470, w: 150, h: 170, desc: "Ladies Waiting Room" },
      { id: "106", x: 440, y: 470, w: 170, h: 220, desc: "Lecture Hall" },
      { id: "107", x: 440, y: 710, w: 170, h: 100, desc: "Ladies Toilet" },
    ],
  },
  {
    key: "first",
    label: "First Floor",
    entrances: [],
    rooms: [
      { id: "202", x: 30, y: 30, w: 180, h: 290, desc: "Faculty Room" },
      { id: "209", x: 30, y: 330, w: 180, h: 250, desc: "Machine Learning & Deep Learning Lab" },
      { id: "208", x: 30, y: 590, w: 180, h: 280, desc: "Lecture Hall" },
      { id: "201", x: 240, y: 30, w: 180, h: 230, desc: "Lecture Hall" },
      { id: "207", x: 240, y: 590, w: 180, h: 280, desc: "Department Library & Reprographic Centre" },
      { id: "203", x: 450, y: 30, w: 170, h: 250, desc: "Professor & Head" },
      { id: "204", x: 450, y: 290, w: 170, h: 220, desc: "Faculty Room" },
      { id: "205", x: 450, y: 520, w: 170, h: 210, desc: "Faculty Room" },
      { id: "206", x: 450, y: 740, w: 170, h: 140, desc: "HoD Room" },
    ],
  },
  {
    key: "second",
    label: "Second Floor",
    entrances: [],
    rooms: [
      { id: "301", x: 30, y: 30, w: 180, h: 260, desc: "Lecture Hall" },
      { id: "308", x: 30, y: 300, w: 180, h: 260, desc: "IEEE Room" },
      { id: "307", x: 30, y: 570, w: 180, h: 300, desc: "Lecture Hall" },
      { id: "302", x: 240, y: 30, w: 180, h: 260, desc: "Lecture Hall" },
      { id: "306", x: 240, y: 570, w: 180, h: 300, desc: "Research & Development Lab" },
      { id: "303", x: 450, y: 30, w: 170, h: 220, desc: "Department Library" },
      { id: "304", x: 450, y: 260, w: 170, h: 240, desc: "Lecture Hall" },
      { id: "305", x: 450, y: 700, w: 170, h: 170, desc: "Seminar Hall" },
    ],
  },
];

// The two real staircases in the middle column of every floor
const STAIRS = [
  { key: "A", x: 320, y: 295, label: "Staircase 1" },
  { key: "B", x: 320, y: 545, label: "Staircase 2" },
];
const STAIR_FLIGHT_COST = 260; // walking-equivalent cost of climbing one flight

const SCALE = 1 / 32;
const CENTER = { x: 320, y: 450 };
const FLOOR_H = 2.6;
const FLOOR_GAP = 0.18;
const FLOOR_BASE = FLOOR_DEFS.map((_, i) => i * (FLOOR_H + FLOOR_GAP));

function toWorldX(svgX) { return (svgX - CENTER.x) * SCALE; }
function toWorldZ(svgY) { return (svgY - CENTER.y) * SCALE; }
function floorLabel(key) { return FLOOR_DEFS.find(f => f.key === key).label; }
function floorIndex(key) { return FLOOR_ORDER.indexOf(key); }

/* ================= Build the navigation graph ================= */
const NODES = {};
const ADJ = {};

function addNode(id, data) {
  NODES[id] = data;
}

function addEdge(a, b, w) {
  ADJ[a] = ADJ[a] || []; ADJ[a].push({ to: b, w });
  ADJ[b] = ADJ[b] || []; ADJ[b].push({ to: a, w });
}

function svgDist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// 1. Add Corridor Waypoints per floor (Dynamic corridor grid)
FLOOR_DEFS.forEach(floor => {
  const fKey = floor.key;
  const corridorYs = new Set();
  
  const lcX = 120, rcX = 525;
  const bottomY = 30, topY = 880;

  // 2. Add Entrances & connect to corridor
  floor.entrances.forEach(e => {
    addNode(e.id, { x: e.x, y: e.y, floor: fKey, type: "entrance", label: e.name });
    
    const corrX = (e.x < lcX) ? lcX : rcX;
    const sideChar = (e.x < lcX) ? 'L' : 'R';
    const corrNodeId = `corr_${sideChar}_${e.y}_${fKey}`;
    
    addNode(corrNodeId, { x: corrX, y: e.y, floor: fKey, type: "corridor" });
    corridorYs.add(e.y);
    
    addEdge(e.id, corrNodeId, svgDist(NODES[e.id], NODES[corrNodeId]));
  });

  // 3. Add Rooms and their corridor connection points
  floor.rooms.forEach(r => {
    const rx = r.x + r.w / 2;
    const ry = r.y + r.h / 2;
    addNode(r.id, { x: rx, y: ry, floor: fKey, type: "room", desc: r.desc });

    let corrX, sideChar;
    if (rx < lcX) {
      corrX = lcX; sideChar = 'L';
    } else if (rx > rcX) {
      corrX = rcX; sideChar = 'R';
    } else {
      if (Math.abs(rx - lcX) < Math.abs(rx - rcX)) {
        corrX = lcX; sideChar = 'L';
      } else {
        corrX = rcX; sideChar = 'R';
      }
    }

    const corrNodeId = `corr_${sideChar}_${ry}_${fKey}`;
    addNode(corrNodeId, { x: corrX, y: ry, floor: fKey, type: "corridor" });
    corridorYs.add(ry);

    addEdge(r.id, corrNodeId, svgDist(NODES[r.id], NODES[corrNodeId]));
  });

  // 4. Add Stairs and connect to nearest corridor
  STAIRS.forEach(s => {
    const stairNodeId = `${s.key}_${fKey}`;
    addNode(stairNodeId, { x: s.x, y: s.y, floor: fKey, type: "stair", label: s.label });
    
    const corrX = (s.x < 320) ? lcX : rcX;
    const sideChar = (s.x < 320) ? 'L' : 'R';
    const corrNodeId = `corr_${sideChar}_${s.y}_${fKey}`;

    addNode(corrNodeId, { x: corrX, y: s.y, floor: fKey, type: "corridor" });
    corridorYs.add(s.y);

    addEdge(stairNodeId, corrNodeId, svgDist(NODES[stairNodeId], NODES[corrNodeId]));
  });

  // 5. Connect corridor waypoints along left & right corridors, and add crossover bridges
  const sortedYs = Array.from(corridorYs).sort((a, b) => a - b);
  
  for (let i = 0; i < sortedYs.length - 1; i++) {
    const y1 = sortedYs[i], y2 = sortedYs[i + 1];
    addEdge(`corr_L_${y1}_${fKey}`, `corr_L_${y2}_${fKey}`, y2 - y1);
    addEdge(`corr_R_${y1}_${fKey}`, `corr_R_${y2}_${fKey}`, y2 - y1);
  }

  sortedYs.forEach(y => {
    addEdge(`corr_L_${y}_${fKey}`, `corr_R_${y}_${fKey}`, rcX - lcX);
  });
});

// 6. Connect floor-to-floor staircases
for (let i = 0; i < FLOOR_ORDER.length - 1; i++) {
  const f1 = FLOOR_ORDER[i], f2 = FLOOR_ORDER[i + 1];
  STAIRS.forEach(s => addEdge(`${s.key}_${f1}`, `${s.key}_${f2}`, STAIR_FLIGHT_COST));
}

function dijkstra(start, end) {
  const dist = {}, prev = {};
  Object.keys(NODES).forEach(id => (dist[id] = Infinity));
  dist[start] = 0;
  const pending = new Set(Object.keys(NODES));
  while (pending.size) {
    let u = null, best = Infinity;
    pending.forEach(id => { if (dist[id] < best) { best = dist[id]; u = id; } });
    if (u === null) break;
    pending.delete(u);
    if (u === end) break;
    (ADJ[u] || []).forEach(edge => {
      if (!pending.has(edge.to)) return;
      const alt = dist[u] + edge.w;
      if (alt < dist[edge.to]) { dist[edge.to] = alt; prev[edge.to] = u; }
    });
  }
  if (dist[end] === Infinity) return null;
  const path = [end];
  let cur = end;
  while (cur !== start) { cur = prev[cur]; path.unshift(cur); }
  return { path, distance: Math.round(dist[end]) };
}

function getNearestStairKey(nodeId) {
  const node = NODES[nodeId];
  if (!node) return "A";
  const distToA = Math.hypot(node.x - 320, node.y - 295);
  const distToB = Math.hypot(node.x - 320, node.y - 545);
  return distToA < distToB ? "A" : "B";
}

function getNearestStair(nodeId) {
  const key = getNearestStairKey(nodeId);
  return key === "A" ? "Staircase 1" : "Staircase 2";
}

function getStairDirection(nodeId, stairKey) {
  const node = NODES[nodeId];
  if (!node) return "";
  const stair = STAIRS.find(s => s.key === stairKey);
  if (!stair) return "";
  return node.x < stair.x ? "Right" : "Left";
}

function buildSteps(path) {
  const steps = [];
  const first = NODES[path[0]];
  const firstName = first.type === "room" ? `Room ${path[0]} — ${first.desc}` : first.label;
  const stairKey = getNearestStairKey(path[0]);
  const nearestStair = stairKey === "A" ? "Staircase 1" : "Staircase 2";
  const direction = getStairDirection(path[0], stairKey);
  steps.push(`Start at <b>${firstName}</b> (${floorLabel(first.floor)}). <span style="font-size:0.8rem;opacity:0.85;">(${nearestStair} is on your ${direction.toLowerCase()})</span>`);
  for (let i = 1; i < path.length; i++) {
    const prev = NODES[path[i - 1]], cur = NODES[path[i]];
    if (cur.type === "stair" && prev.type !== "stair") {
      const startNode = NODES[path[0]];
      const dirText = startNode.x < 320 ? "on your right" : "on your left";
      steps.push(`Walk to <b>${cur.label}</b> (${floorLabel(cur.floor)}) ${dirText}.`);
    } else if (cur.type === "stair" && prev.type === "stair" && cur.floor === prev.floor) {
      steps.push(`Cross the corridor to <b>${cur.label}</b>.`);
    } else if (cur.type === "stair" && prev.type === "stair" && cur.floor !== prev.floor) {
      const up = floorIndex(cur.floor) > floorIndex(prev.floor);
      steps.push(`Take <b>${cur.label}</b> ${up ? "up" : "down"} to <b>${floorLabel(cur.floor)}</b>.`);
    } else if (cur.type === "room") {
      steps.push(`Arrive at <b>Room ${path[i]} — ${cur.desc}</b> (${floorLabel(cur.floor)}).`);
    } else if (cur.type === "entrance") {
      steps.push(`Exit via <b>${cur.label}</b>.`);
    }
  }
  return steps;
}

/* ================= Sprite label helper ================= */
function makeTextSprite(text, color = "#2b2320") {
  const canvas = document.createElement("canvas");
  canvas.width = 256; canvas.height = 128;
  const ctx = canvas.getContext("2d");
  ctx.font = "bold 54px 'Segoe UI', sans-serif";
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 128, 64);
  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(1.4, 0.7, 1);
  sprite.renderOrder = 999;
  return sprite;
}

/* ================= Component ================= */
export default function BuildingModel3D() {
  const mountRef = useRef(null);
  const threeRef = useRef({});
  const [visibleFloor, setVisibleFloor] = useState("all");
  const [selected, setSelected] = useState(null);
  const [fromId, setFromId] = useState("ENT-L");
  const [toId, setToId] = useState("205");
  const [steps, setSteps] = useState(null);
  const [routeStats, setRouteStats] = useState(null);
  const [searchCategory, setSearchCategory] = useState("all");
  const [focusMode, setFocusMode] = useState(true); // Default to focus mode on opening (only 3D model & 3-line button visible)
  const [themeMode, setThemeMode] = useState("warm"); // Default theme is previous warm theme
  const visibleFloorRef = useRef(visibleFloor);
  visibleFloorRef.current = visibleFloor;

  useEffect(() => {
    const mount = mountRef.current;
    const width = mount.clientWidth, height = mount.clientHeight;

    const isWarm = themeMode === "warm";
    const bgColor = isWarm ? "#f3ece4" : "#0f172a";
    const groundColor = isWarm ? "#e7ddd0" : "#1e293b";
    const slabColor = isWarm ? "#d8cfc3" : "#334155";
    const ambientColor = isWarm ? "#ffffff" : "#e2e8f0";
    const sunColor = isWarm ? "#fff2e0" : "#38bdf8";
    const roomColorMap = isWarm ? WARM_ROOM_COLORS : DARK_ROOM_COLORS;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(bgColor);
    scene.fog = new THREE.Fog(bgColor, 22, 60);

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 200);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    mount.appendChild(renderer.domElement);

    const ambientLight = new THREE.AmbientLight(ambientColor, isWarm ? 0.65 : 0.75);
    scene.add(ambientLight);

    const sun = new THREE.DirectionalLight(sunColor, isWarm ? 0.9 : 0.85);
    sun.position.set(14, 22, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -18; sun.shadow.camera.right = 18;
    sun.shadow.camera.top = 18; sun.shadow.camera.bottom = -18;
    scene.add(sun);

    const fill = new THREE.DirectionalLight(isWarm ? "#cfe0ff" : "#34d399", 0.35);
    fill.position.set(-12, 10, -10);
    scene.add(fill);

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(32, 48),
      new THREE.MeshStandardMaterial({ color: groundColor, roughness: isWarm ? 1 : 0.85, metalness: 0.1 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.05;
    ground.receiveShadow = true;
    scene.add(ground);

    const roomMeshMap = {};
    const entranceMeshMap = {};
    const stairMeshMap = {};
    const floorGroups = {};

    FLOOR_DEFS.forEach((floor, fi) => {
      const group = new THREE.Group();
      floorGroups[floor.key] = group;
      scene.add(group);
      const base = FLOOR_BASE[fi];

      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      floor.rooms.forEach(r => {
        minX = Math.min(minX, r.x); maxX = Math.max(maxX, r.x + r.w);
        minY = Math.min(minY, r.y); maxY = Math.max(maxY, r.y + r.h);
      });
      const pad = 14;
      const slabW = (maxX - minX + pad * 2) * SCALE;
      const slabD = (maxY - minY + pad * 2) * SCALE;
      const slabCx = toWorldX((minX + maxX) / 2), slabCz = toWorldZ((minY + maxY) / 2);
      const slab = new THREE.Mesh(
        new THREE.BoxGeometry(slabW, 0.12, slabD),
        new THREE.MeshStandardMaterial({ color: slabColor, roughness: isWarm ? 0.9 : 0.4, metalness: 0.2 })
      );
      slab.position.set(slabCx, base, slabCz);
      slab.receiveShadow = true; slab.castShadow = true;
      group.add(slab);

      const roomH = FLOOR_H * 0.8;
      floor.rooms.forEach(r => {
        const w = r.w * SCALE, d = r.h * SCALE;
        const cx = toWorldX(r.x + r.w / 2), cz = toWorldZ(r.y + r.h / 2);
        const geo = new THREE.BoxGeometry(w, roomH, d);
        const roomColor = roomColorMap[r.id] || "#888888";
        const mat = new THREE.MeshStandardMaterial({ color: roomColor, roughness: isWarm ? 0.75 : 0.5, metalness: 0.05 });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(cx, base + 0.06 + roomH / 2, cz);
        mesh.castShadow = true; mesh.receiveShadow = true;
        group.add(mesh);

        const edges = new THREE.EdgesGeometry(geo);
        const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: isWarm ? "#ffffff" : "rgba(255,255,255,0.75)" }));
        line.position.copy(mesh.position);
        group.add(line);

        const label = makeTextSprite(r.id, "#ffffff");
        label.position.set(cx, base + roomH + 0.35, cz);
        group.add(label);

        roomMeshMap[r.id] = { mesh, line, label, floorKey: floor.key, desc: r.desc, baseColor: roomColor };
      });

      floor.entrances.forEach(e => {
        const cx = toWorldX(e.x), cz = toWorldZ(e.y);
        const entColor = isWarm ? "#6e2c3a" : "#10b981";
        const cone = new THREE.Mesh(
          new THREE.ConeGeometry(0.24, 0.55, 16),
          new THREE.MeshStandardMaterial({ color: entColor, emissive: entColor, emissiveIntensity: isWarm ? 0.2 : 0.8 })
        );
        cone.position.set(cx, base + 0.3, cz);
        group.add(cone);
        const label = makeTextSprite(e.name, entColor);
        label.scale.set(1.6, 0.8, 1);
        label.position.set(cx, base + 0.9, cz);
        group.add(label);

        entranceMeshMap[e.id] = { cone, label, floorKey: floor.key, baseColor: entColor };
      });
    });

    // Two stair towers, spanning full building height (drawn once, not per floor)
    const towerHeight = FLOOR_BASE[FLOOR_BASE.length - 1] + FLOOR_H + 0.1;
    STAIRS.forEach(s => {
      const sx = toWorldX(s.x), sz = toWorldZ(s.y);
      const towerColor = isWarm ? "#8a8a8a" : "#00f2fe";
      const towerGeo = new THREE.CylinderGeometry(0.75, 0.75, towerHeight, 20, 1, true);
      const towerMat = new THREE.MeshStandardMaterial({
        color: towerColor, transparent: true, opacity: 0.3, side: THREE.DoubleSide, roughness: 0.3, emissive: isWarm ? "#000000" : "#0284c7", emissiveIntensity: isWarm ? 0 : 0.3
      });
      const tower = new THREE.Mesh(towerGeo, towerMat);
      tower.position.set(sx, towerHeight / 2, sz);
      scene.add(tower);
      const towerLine = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.CylinderGeometry(0.75, 0.75, towerHeight, 20, 4)),
        new THREE.LineBasicMaterial({ color: isWarm ? "#6a6a6a" : "#38bdf8" })
      );
      towerLine.position.copy(tower.position);
      scene.add(towerLine);
      const towerLabel = makeTextSprite(s.label, isWarm ? "#4a4a4a" : "#38bdf8");
      towerLabel.position.set(sx, towerHeight + 0.4, sz);
      scene.add(towerLabel);
      stairMeshMap[s.key] = { tower, towerLine, label: towerLabel, sx, sz };
    });

    const pathGroup = new THREE.Group();
    scene.add(pathGroup);
    const pathMarker = new THREE.Mesh(
      new THREE.SphereGeometry(0.15, 16, 16),
      new THREE.MeshStandardMaterial({ color: "#10b981", emissive: "#10b981", emissiveIntensity: 1.3 })
    );
    pathMarker.visible = false;
    scene.add(pathMarker);

    /* Manual orbit controls (OrbitControls unavailable in r128 here) */
    const target = new THREE.Vector3(0, FLOOR_BASE[1], 0);
    let radius = 26, theta = Math.PI / 4, phi = Math.PI / 3.2;
    let dragging = false, lastX = 0, lastY = 0, autoRotate = true, idleTimer = null;

    // Track active pointers for multi-touch (pinch-to-zoom)
    const activePointers = new Map();
    let initialPinchDist = 0;
    let initialRadius = 0;
    let startX = 0;
    let startY = 0;

    function updateCamera() {
      camera.position.x = target.x + radius * Math.sin(phi) * Math.sin(theta);
      camera.position.z = target.z + radius * Math.sin(phi) * Math.cos(theta);
      camera.position.y = target.y + radius * Math.cos(phi);
      camera.lookAt(target);
    }
    updateCamera();

    function onPointerDown(e) {
      activePointers.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });
      autoRotate = false;
      clearTimeout(idleTimer);

      if (activePointers.size === 1) {
        dragging = true;
        lastX = e.clientX;
        lastY = e.clientY;
        startX = e.clientX;
        startY = e.clientY;
      } else if (activePointers.size === 2) {
        dragging = false;
        const pts = Array.from(activePointers.values());
        initialPinchDist = Math.hypot(pts[0].clientX - pts[1].clientX, pts[0].clientY - pts[1].clientY);
        initialRadius = radius;
      }
    }

    function onPointerMove(e) {
      if (!activePointers.has(e.pointerId)) return;
      activePointers.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });

      if (activePointers.size === 1 && dragging) {
        const dx = e.clientX - lastX, dy = e.clientY - lastY;
        lastX = e.clientX; lastY = e.clientY;
        theta -= dx * 0.006;
        phi = Math.max(0.35, Math.min(Math.PI / 2 - 0.02, phi - dy * 0.006));
        updateCamera();
      } else if (activePointers.size === 2) {
        const pts = Array.from(activePointers.values());
        const dist = Math.hypot(pts[0].clientX - pts[1].clientX, pts[0].clientY - pts[1].clientY);
        if (initialPinchDist > 0 && dist > 0) {
          const factor = initialPinchDist / dist;
          radius = Math.max(6, Math.min(30, initialRadius * factor));
          updateCamera();
        }
      }
    }

    function onPointerUp(e) {
      activePointers.delete(e.pointerId);
      if (activePointers.size < 2) {
        initialPinchDist = 0;
      }

      if (activePointers.size === 0) {
        dragging = false;
        clearTimeout(idleTimer);
        idleTimer = setTimeout(() => { autoRotate = true; }, 3500);
      } else if (activePointers.size === 1) {
        // Resume dragging with the remaining pointer
        const remaining = activePointers.values().next().value;
        lastX = remaining.clientX;
        lastY = remaining.clientY;
        dragging = true;
      }
    }

    function onWheel(e) {
      e.preventDefault();
      radius = Math.max(6, Math.min(30, radius + e.deltaY * 0.01));
      updateCamera();
    }

    function onClick(e) {
      // If the pointer moved more than a minor threshold, it's a drag/swipe, not a click
      const dragDist = Math.hypot(e.clientX - startX, e.clientY - startY);
      if (dragDist > 6) return;

      const rect = renderer.domElement.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouse, camera);
      const meshes = Object.values(roomMeshMap).map(v => v.mesh);
      const hits = raycaster.intersectObjects(meshes);
      if (hits.length) {
        const found = Object.entries(roomMeshMap).find(([id, v]) => v.mesh === hits[0].object);
        if (found) setSelected({ id: found[0], desc: found[1].desc, floor: found[1].floorKey });
      }
    }

    const dom = renderer.domElement;
    dom.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    dom.addEventListener("wheel", onWheel, { passive: false });
    dom.addEventListener("click", onClick);

    let markerT = 0;
    let frameId;
    function animate() {
      frameId = requestAnimationFrame(animate);
      if (autoRotate) { theta += 0.0016; updateCamera(); }
      const vf = visibleFloorRef.current;
      FLOOR_DEFS.forEach(f => {
        if (vf === "all") {
          floorGroups[f.key].visible = true;
        } else if (Array.isArray(vf)) {
          floorGroups[f.key].visible = vf.includes(f.key);
        } else {
          floorGroups[f.key].visible = vf === f.key;
        }
      });
      if (threeRef.current.pathCurve) {
        markerT = (markerT + 0.0025) % 1;
        pathMarker.position.copy(threeRef.current.pathCurve.getPointAt(markerT));
        pathMarker.visible = true;
      } else {
        pathMarker.visible = false;
      }
      renderer.render(scene, camera);
    }
    animate();

    function handleResize() {
      const w = mount.clientWidth, h = mount.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    }
    const ro = new ResizeObserver(handleResize);
    ro.observe(mount);

    threeRef.current = {
      scene, roomMeshMap, entranceMeshMap, stairMeshMap, pathGroup, pathCurve: null,
      resetView: () => { radius = 26; theta = Math.PI / 4; phi = Math.PI / 3.2; updateCamera(); },
      zoomIn: () => { radius = Math.max(6, radius - 2.5); updateCamera(); },
      zoomOut: () => { radius = Math.min(50, radius + 2.5); updateCamera(); },
    };

    return () => {
      cancelAnimationFrame(frameId);
      ro.disconnect();
      dom.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      dom.removeEventListener("wheel", onWheel);
      dom.removeEventListener("click", onClick);
      clearTimeout(idleTimer);
      scene.traverse(obj => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          mats.forEach(m => { if (m.map) m.map.dispose(); m.dispose(); });
        }
      });
      renderer.dispose();
      if (mount.contains(dom)) mount.removeChild(dom);
    };
  }, [themeMode]);

  function clearHighlights() {
    const { roomMeshMap, entranceMeshMap, stairMeshMap } = threeRef.current;
    if (!roomMeshMap) return;
    Object.values(roomMeshMap).forEach(v => {
      v.mesh.visible = true;
      if (v.line) v.line.visible = true;
      if (v.label) v.label.visible = true;
      v.mesh.material.emissive.set(0x000000);
      v.mesh.material.emissiveIntensity = 0;
    });
    if (entranceMeshMap) {
      Object.values(entranceMeshMap).forEach(v => {
        v.cone.visible = true;
        if (v.label) v.label.visible = true;
        v.cone.material.color.set(v.baseColor);
        if (v.cone.material.emissive) {
          v.cone.material.emissive.set(0x000000);
          v.cone.material.emissiveIntensity = 0;
        }
      });
    }
    if (stairMeshMap) {
      Object.values(stairMeshMap).forEach(v => {
        v.tower.visible = true;
        if (v.towerLine) v.towerLine.visible = true;
        if (v.label) v.label.visible = true;
        v.tower.material.color.set("#8a8a8a");
        v.tower.material.opacity = 0.3;
      });
    }
  }

  function handleClearRoute() {
    const { pathGroup } = threeRef.current;
    if (pathGroup) {
      while (pathGroup.children.length) {
        const child = pathGroup.children.pop();
        child.geometry && child.geometry.dispose();
        child.material && child.material.dispose();
        pathGroup.remove(child);
      }
    }
    clearHighlights();
    threeRef.current.pathCurve = null;
    setSteps(null);
    setRouteStats(null);
  }

  function handleFindRoute() {
    if (fromId === toId) { alert("Please choose two different locations."); return; }
    const res = dijkstra(fromId, toId);
    if (!res) { alert("No route could be found between these two points."); return; }
    const { path, distance } = res;

    const { roomMeshMap, entranceMeshMap, stairMeshMap, pathGroup } = threeRef.current;

    while (pathGroup.children.length) {
      const child = pathGroup.children.pop();
      child.geometry && child.geometry.dispose();
      child.material && child.material.dispose();
      pathGroup.remove(child);
    }
    clearHighlights();

    const pathSet = new Set(path);
    const pathStairKeys = new Set();
    path.forEach(id => {
      const node = NODES[id];
      if (node && node.type === "stair") {
        pathStairKeys.add(id.split("_")[0]);
      }
    });

    // Hide all non-path rooms
    Object.entries(roomMeshMap).forEach(([id, v]) => {
      const onPath = pathSet.has(id);
      v.mesh.visible = onPath;
      if (v.line) v.line.visible = onPath;
      if (v.label) v.label.visible = onPath;
    });

    // Hide all non-path entrances
    if (entranceMeshMap) {
      Object.entries(entranceMeshMap).forEach(([id, v]) => {
        const onPath = pathSet.has(id);
        v.cone.visible = onPath;
        if (v.label) v.label.visible = onPath;
      });
    }

    // Hide all non-path stairs
    if (stairMeshMap) {
      Object.entries(stairMeshMap).forEach(([key, v]) => {
        const onPath = pathStairKeys.has(key);
        v.tower.visible = onPath;
        if (v.towerLine) v.towerLine.visible = onPath;
        if (v.label) v.label.visible = onPath;
      });
    }

    const startId = path[0];
    const endId = path[path.length - 1];

    // Style start node different: Blue (#2563eb)
    if (roomMeshMap[startId]) {
      roomMeshMap[startId].mesh.material.emissive.set("#2563eb");
      roomMeshMap[startId].mesh.material.emissiveIntensity = 0.8;
    } else if (entranceMeshMap && entranceMeshMap[startId]) {
      entranceMeshMap[startId].cone.material.color.set("#2563eb");
      entranceMeshMap[startId].cone.material.emissive.set("#2563eb");
      entranceMeshMap[startId].cone.material.emissiveIntensity = 0.8;
    }

    // Style end node different: Red (#dc2626)
    if (roomMeshMap[endId]) {
      roomMeshMap[endId].mesh.material.emissive.set("#dc2626");
      roomMeshMap[endId].mesh.material.emissiveIntensity = 0.8;
    } else if (entranceMeshMap && entranceMeshMap[endId]) {
      entranceMeshMap[endId].cone.material.color.set("#dc2626");
      entranceMeshMap[endId].cone.material.emissive.set("#dc2626");
      entranceMeshMap[endId].cone.material.emissiveIntensity = 0.8;
    }

    // Highlight intermediate stair towers if any
    path.forEach(id => {
      if (id !== startId && id !== endId) {
        const node = NODES[id];
        if (node.type === "stair") {
          const key = id.split("_")[0];
          stairMeshMap[key].tower.material.color.set("#10b981");
          stairMeshMap[key].tower.material.opacity = 0.55;
        }
      }
    });

    const points = path.map(id => {
      const node = NODES[id];
      const fi = floorIndex(node.floor);
      const base = FLOOR_BASE[fi];
      return new THREE.Vector3(toWorldX(node.x), base + 0.22, toWorldZ(node.y));
    });
    
    const curve = new THREE.CatmullRomCurve3(points, false, "catmullrom", 0.05);
    const tubeGeo = new THREE.TubeGeometry(curve, Math.max(64, points.length * 20), 0.07, 10, false);
    const tubeMat = new THREE.MeshStandardMaterial({ color: "#10b981", emissive: "#10b981", emissiveIntensity: 1.3, roughness: 0.2 });
    const tube = new THREE.Mesh(tubeGeo, tubeMat);
    pathGroup.add(tube);

    // End Spheres: Start is Blue, End is Red
    const startMat = new THREE.MeshStandardMaterial({ color: "#2563eb", emissive: "#2563eb", emissiveIntensity: 0.6 });
    const endMat = new THREE.MeshStandardMaterial({ color: "#dc2626", emissive: "#dc2626", emissiveIntensity: 0.6 });
    
    const startSphere = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 16), startMat);
    startSphere.position.copy(points[0]);
    
    const endSphere = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 16), endMat);
    endSphere.position.copy(points[points.length - 1]);
    
    pathGroup.add(startSphere, endSphere);

    // Intermediate spheres
    for (let i = 1; i < points.length - 1; i++) {
      const interMat = new THREE.MeshStandardMaterial({ color: "#10b981", emissive: "#10b981", emissiveIntensity: 0.6 });
      const interSphere = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 16), interMat);
      interSphere.position.copy(points[i]);
      pathGroup.add(interSphere);
    }

    threeRef.current.pathCurve = curve;

    setSteps(buildSteps(path));
    const meters = Math.round(distance * 0.25);
    const durationSec = Math.max(15, Math.round(meters / 1.1));
    const timeStr = durationSec < 60 ? `${durationSec} sec` : `${Math.floor(durationSec / 60)} min ${durationSec % 60} sec`;
    setRouteStats({ meters, timeStr });

    // Determine which floors are spanned by the path
    const floorIndices = path.map(id => floorIndex(NODES[id].floor));
    const minFloorIdx = Math.min(...floorIndices);
    const maxFloorIdx = Math.max(...floorIndices);
    const activeFloors = [];
    for (let i = minFloorIdx; i <= maxFloorIdx; i++) {
      activeFloors.push(FLOOR_ORDER[i]);
    }

    if (activeFloors.length === FLOOR_ORDER.length) {
      setVisibleFloor("all");
    } else if (activeFloors.length === 1) {
      setVisibleFloor(activeFloors[0]);
    } else {
      setVisibleFloor(activeFloors);
    }
  }

  function handleSwap() {
    setFromId(toId); setToId(fromId);
  }

  const optionsFor = () => (
    <>
      {FLOOR_DEFS.map(floor => {
        const filteredEntrances = floor.entrances.filter(() => searchCategory === "all" || searchCategory === "entrances");
        const filteredRooms = floor.rooms.filter(r => {
          if (searchCategory === "all") return true;
          const desc = r.desc.toLowerCase();
          if (searchCategory === "halls") return desc.includes("hall") || desc.includes("lecture");
          if (searchCategory === "labs") return desc.includes("lab") || desc.includes("centre");
          if (searchCategory === "faculty") return desc.includes("faculty") || desc.includes("head") || desc.includes("hod") || desc.includes("professor");
          if (searchCategory === "toilets") return desc.includes("toilet") || desc.includes("waiting");
          return true;
        });

        if (!filteredEntrances.length && !filteredRooms.length) return null;

        return (
          <optgroup key={floor.key} label={floor.label}>
            {filteredEntrances.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            {filteredRooms.map(r => <option key={r.id} value={r.id}>{r.id} — {r.desc}</option>)}
          </optgroup>
        );
      })}
    </>
  );

  const floorTabs = [{ key: "all", label: "All Floors" }, ...FLOOR_DEFS.map(f => ({ key: f.key, label: f.label }))];

  const categoryChips = [
    { key: "all", label: "All" },
    { key: "halls", label: "Halls" },
    { key: "labs", label: "Labs" },
    { key: "faculty", label: "Faculty" },
    { key: "toilets", label: "Toilets" },
  ];

  const isWarm = themeMode === "warm";

  return (
    <div className={`main-container theme-${themeMode} ${focusMode ? "focus-mode" : ""}`}>
      {/* Header bar */}
      <div className="header-container">
        <div>
          <div className="header-title">St. Peter's Block — 3D Model & Route Finder</div>
          <div className="header-subtitle">Drag to rotate · pinch/scroll to zoom · tap room for details</div>
        </div>
      </div>

      <div className="content-row">
        {/* Sidebar Panel */}
        <div className="sidebar-panel">
          {/* Theme Mode Selector Option */}
          <div style={{ marginBottom: 18, borderBottom: "1px solid rgba(128,128,128,0.2)", paddingBottom: 14 }}>
            <label style={{ display: "block", fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700, marginBottom: 8 }}>Theme Style</label>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => setThemeMode("warm")}
                style={{
                  flex: 1,
                  padding: "7px 10px",
                  borderRadius: 8,
                  fontSize: "0.78rem",
                  fontWeight: 700,
                  cursor: "pointer",
                  border: themeMode === "warm" ? "1.5px solid #8c3a4a" : "1px solid rgba(128,128,128,0.3)",
                  background: themeMode === "warm" ? "#8c3a4a" : "transparent",
                  color: themeMode === "warm" ? "#fff" : "inherit",
                  boxShadow: themeMode === "warm" ? "0 4px 14px rgba(140,58,74,0.3)" : "none",
                  transition: "all 0.18s ease"
                }}
              >
                🎨 Warm Classic
              </button>
              <button
                onClick={() => setThemeMode("dark")}
                style={{
                  flex: 1,
                  padding: "7px 10px",
                  borderRadius: 8,
                  fontSize: "0.78rem",
                  fontWeight: 700,
                  cursor: "pointer",
                  border: themeMode === "dark" ? "1.5px solid #38bdf8" : "1px solid rgba(128,128,128,0.3)",
                  background: themeMode === "dark" ? "linear-gradient(135deg, #059669, #0284c7)" : "transparent",
                  color: themeMode === "dark" ? "#fff" : "inherit",
                  boxShadow: themeMode === "dark" ? "0 4px 14px rgba(5,150,105,0.4)" : "none",
                  transition: "all 0.18s ease"
                }}
              >
                🌌 Midnight Cyan
              </button>
            </div>
          </div>

          {/* Quick Filter Category Chips */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.06em", color: isWarm ? "#000000" : "#38bdf8", fontWeight: 800, marginBottom: 8 }}>Filter Locations</label>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {categoryChips.map(c => (
                <button
                  key={c.key}
                  onClick={() => setSearchCategory(c.key)}
                  style={{
                    padding: "5px 12px",
                    borderRadius: 16,
                    fontSize: "0.78rem",
                    fontWeight: 700,
                    cursor: "pointer",
                    border: searchCategory === c.key ? (isWarm ? "1.5px solid #8c3a4a" : "1px solid #34d399") : (isWarm ? "1.5px solid #8c3a4a" : "1px solid rgba(56, 189, 248, 0.25)"),
                    background: searchCategory === c.key ? (isWarm ? "#8c3a4a" : "linear-gradient(135deg, #059669, #0284c7)") : (isWarm ? "#ffffff" : "#1e293b"),
                    color: searchCategory === c.key ? "#fff" : (isWarm ? "#000000" : "#cbd5e1"),
                    boxShadow: searchCategory === c.key ? (isWarm ? "0 4px 14px rgba(140,58,74,0.3)" : "0 4px 15px rgba(5, 150, 105, 0.4)") : "none",
                    transition: "all 0.18s ease",
                  }}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={{ display: "block", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.06em", color: isWarm ? "#000000" : "#38bdf8", fontWeight: 800, marginBottom: 6 }}>From</label>
            <select value={fromId} onChange={e => setFromId(e.target.value)} style={{ width: "100%", padding: "9px 10px", fontSize: "0.9rem" }}>
              {optionsFor()}
            </select>
            <div style={{ fontSize: "0.78rem", color: isWarm ? "#000000" : "#34d399", marginTop: 6, display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ opacity: 0.85, color: isWarm ? "#000000" : "inherit" }}>Nearest stair:</span>
              <strong style={{ fontWeight: 700, color: isWarm ? "#8c3a4a" : "inherit" }}>
                {(() => {
                  const key = getNearestStairKey(fromId);
                  const name = key === "A" ? "Staircase 1" : "Staircase 2";
                  const dir = getStairDirection(fromId, key);
                  return `${name} (on your ${dir.toLowerCase()})`;
                })()}
              </strong>
            </div>
          </div>

          <button onClick={handleSwap} style={{ background: isWarm ? "#ffffff" : "#1e293b", border: isWarm ? "1.5px solid #8c3a4a" : "1px solid rgba(56, 189, 248, 0.3)", borderRadius: 6, padding: "6px 12px", cursor: "pointer", fontSize: "0.78rem", color: isWarm ? "#8c3a4a" : "#38bdf8", fontWeight: 700, marginBottom: 14, alignSelf: "flex-start" }}>⇅ Swap</button>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.06em", color: isWarm ? "#000000" : "#38bdf8", fontWeight: 800, marginBottom: 6 }}>To</label>
            <select value={toId} onChange={e => setToId(e.target.value)} style={{ width: "100%", padding: "9px 10px", fontSize: "0.9rem" }}>
              {optionsFor()}
            </select>
          </div>

          <button onClick={handleFindRoute} style={{ width: "100%", padding: 12, background: isWarm ? "#8c3a4a" : "linear-gradient(135deg, #059669 0%, #0284c7 100%)", color: "#fff", border: "none", borderRadius: 10, fontWeight: 700, fontSize: "0.95rem", cursor: "pointer", boxShadow: isWarm ? "0 4px 18px rgba(140,58,74,0.35)" : "0 4px 20px rgba(5, 150, 105, 0.45)" }}>
            Find Shortest Route
          </button>
          {steps && (
            <button onClick={handleClearRoute} style={{ width: "100%", padding: 10, background: isWarm ? "#ffffff" : "#1e293b", color: isWarm ? "#8c3a4a" : "#38bdf8", border: isWarm ? "1.5px solid #8c3a4a" : "1px solid rgba(56, 189, 248, 0.3)", borderRadius: 10, fontWeight: 700, fontSize: "0.9rem", cursor: "pointer", marginTop: 10 }}>
              Clear Route
            </button>
          )}

          {steps && (
            <div style={{ marginTop: 20, borderTop: isWarm ? "1.5px solid #8c3a4a" : "1px solid rgba(56, 189, 248, 0.2)", paddingTop: 14 }}>
              {routeStats && (
                <div style={{ background: isWarm ? "#ffffff" : "rgba(30, 41, 59, 0.85)", border: isWarm ? "1.5px solid #8c3a4a" : "1px solid rgba(56, 189, 248, 0.3)", borderRadius: 10, padding: "12px 14px", marginBottom: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <div style={{ fontSize: "0.95rem", fontWeight: 800, color: isWarm ? "#8c3a4a" : "#34d399" }}>
                    🚶 Estimated Walk: ~{routeStats.timeStr}
                  </div>
                </div>
              )}

              <div style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.06em", color: isWarm ? "#000000" : "#38bdf8", fontWeight: 800, marginBottom: 10 }}>Directions</div>
              <ol style={{ margin: 0, paddingLeft: 18, color: isWarm ? "#000000" : "#e2e8f0", fontWeight: isWarm ? 600 : 400 }}>
                {steps.map((s, i) => <li key={i} style={{ fontSize: "0.88rem", marginBottom: 10, lineHeight: 1.45, color: isWarm ? "#000000" : "inherit" }} dangerouslySetInnerHTML={{ __html: s }} />)}
              </ol>
            </div>
          )}
          {!steps && (
            <div style={{ marginTop: 20, fontSize: "0.82rem", color: isWarm ? "#333333" : "#94a3b8", lineHeight: 1.55, fontWeight: isWarm ? 600 : 400 }}>
              Tip: Click any room on the 3D model to set it directly as your starting point or destination!
            </div>
          )}
        </div>

        {/* Map View Container */}
        <div className="map-view-container">
          <div className="floor-tabs-container">
            {floorTabs.map(t => {
              const isTabActive = visibleFloor === t.key || (Array.isArray(visibleFloor) && visibleFloor.includes(t.key));
              return (
                <div key={t.key} onClick={() => setVisibleFloor(t.key)}
                  className="floor-tab"
                  style={{
                    background: isTabActive ? (isWarm ? "#8c3a4a" : "linear-gradient(135deg, #059669, #0284c7)") : (isWarm ? "#ffffff" : "#1e293b"),
                    color: isTabActive ? "#fff" : (isWarm ? "#000000" : "#cbd5e1"),
                    border: "1.5px solid " + (isTabActive ? "#8c3a4a" : (isWarm ? "#8c3a4a" : "rgba(56, 189, 248, 0.25)")),
                    boxShadow: isTabActive ? (isWarm ? "0 4px 14px rgba(140,58,74,0.3)" : "0 4px 15px rgba(5, 150, 105, 0.4)") : "none",
                    fontWeight: 700,
                  }}>
                  {t.label}
                </div>
              );
            })}
          </div>
          <div className="canvas-wrapper">
            <div ref={mountRef} className="canvas-element" />

            {/* Always Available 3-Line Button on the Left Side of Canvas */}
            <button
              onClick={() => setFocusMode(!focusMode)}
              className="canvas-left-three-line-btn"
              title={focusMode ? "Show Panel" : "Hide Panel"}
            >
              <div className="hamburger-lines">
                <span></span>
                <span></span>
                <span></span>
              </div>
            </button>

            {/* Only Reset View on the Right Side of Canvas */}
            <div className="canvas-right-toolbar">
              <button
                onClick={() => threeRef.current.resetView && threeRef.current.resetView()}
                className="reset-view-pill-btn"
                title="Reset 3D Camera View"
              >
                <svg className="reset-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                  <path d="M3 3v5h5"/>
                </svg>
                <span>Reset View</span>
              </button>
            </div>

            {/* Selected Room Popup Card */}
            {selected && (
              <div style={{
                position: "absolute",
                bottom: 18,
                left: 18,
                background: isWarm ? "#ffffff" : "rgba(15, 23, 42, 0.95)",
                backdropFilter: "blur(16px)",
                WebkitBackdropFilter: "blur(16px)",
                borderRadius: 14,
                padding: "16px 20px",
                boxShadow: "0 10px 40px rgba(0,0,0,0.25)",
                maxWidth: 290,
                border: isWarm ? "1.5px solid #8c3a4a" : "1px solid rgba(56, 189, 248, 0.35)",
                zIndex: 25,
                color: isWarm ? "#000000" : "#ffffff"
              }}>
                <div style={{ fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.06em", color: isWarm ? "#8c3a4a" : "#38bdf8", fontWeight: 800 }}>Room {selected.id}</div>
                <div style={{ fontSize: "1rem", marginTop: 3, fontWeight: 700, color: isWarm ? "#000000" : "#fff" }}>{selected.desc}</div>
                <div style={{ fontSize: "0.8rem", color: isWarm ? "#444444" : "#94a3b8", marginTop: 2, fontWeight: 600 }}>{floorLabel(selected.floor)}</div>
                
                <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                  <button
                    onClick={() => { setFromId(selected.id); setSelected(null); }}
                    style={{
                      flex: 1, padding: "8px 10px", background: isWarm ? "#8c3a4a" : "linear-gradient(135deg, #059669, #0284c7)", color: "#fff", border: "none", borderRadius: 8, fontSize: "0.78rem", fontWeight: 700, cursor: "pointer", boxShadow: isWarm ? "0 4px 14px rgba(140,58,74,0.3)" : "0 4px 15px rgba(5, 150, 105, 0.4)"
                    }}
                  >
                    📍 Set as Start
                  </button>
                  <button
                    onClick={() => { setToId(selected.id); setSelected(null); }}
                    style={{
                      flex: 1, padding: "8px 10px", background: isWarm ? "#8c3a4a" : "linear-gradient(135deg, #0284c7, #4f46e5)", color: "#fff", border: "none", borderRadius: 8, fontSize: "0.78rem", fontWeight: 700, cursor: "pointer", boxShadow: isWarm ? "0 4px 14px rgba(140,58,74,0.3)" : "0 4px 15px rgba(2, 132, 199, 0.4)"
                    }}
                  >
                    🏁 Set as End
                  </button>
                </div>

                <div onClick={() => setSelected(null)} style={{ position: "absolute", top: 10, right: 12, cursor: "pointer", color: isWarm ? "#000000" : "#94a3b8", fontSize: "0.95rem", fontWeight: "bold" }}>✕</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

