import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";

/* ================= Floor / room data ================= */
const FLOOR_ORDER = ["ground", "first", "second"];

const FLOOR_DEFS = [
  {
    key: "ground",
    label: "Ground Floor",
    entrances: [
      { id: "ENT-L", x: 14, y: 430, name: "Main Entrance" },
      { id: "ENT-R", x: 626, y: 430, name: "Side Entrance" },
    ],
    rooms: [
      { id: "101", x: 30, y: 30, w: 220, h: 320, color: "#e85fa0", desc: "Lecture Hall" },
      { id: "103", x: 270, y: 30, w: 150, h: 170, color: "#f2e08a", desc: "Gents Waiting Room" },
      { id: "104", x: 440, y: 30, w: 170, h: 110, color: "#f0c993", desc: "Gents Toilet" },
      { id: "105", x: 440, y: 150, w: 170, h: 300, color: "#5fc3d6", desc: "Lecture Hall" },
      { id: "110", x: 30, y: 470, w: 220, h: 320, color: "#a878c2", desc: "Lecture Hall" },
      { id: "108", x: 270, y: 470, w: 150, h: 170, color: "#8fd0c4", desc: "Ladies Waiting Room" },
      { id: "106", x: 440, y: 470, w: 170, h: 220, color: "#3f9e5c", desc: "Lecture Hall" },
      { id: "107", x: 440, y: 710, w: 170, h: 100, color: "#d6437a", desc: "Ladies Toilet" },
    ],
  },
  {
    key: "first",
    label: "First Floor",
    entrances: [],
    rooms: [
      { id: "202", x: 30, y: 30, w: 180, h: 290, color: "#8fce8f", desc: "Faculty Room" },
      { id: "209", x: 30, y: 330, w: 180, h: 250, color: "#9fd2e8", desc: "Machine Learning & Deep Learning Lab" },
      { id: "208", x: 30, y: 590, w: 180, h: 280, color: "#f0b8ae", desc: "Lecture Hall" },
      { id: "201", x: 240, y: 30, w: 180, h: 230, color: "#8fa8d8", desc: "Lecture Hall" },
      { id: "207", x: 240, y: 590, w: 180, h: 280, color: "#b7d98a", desc: "Department Library & Reprographic Centre" },
      { id: "203", x: 450, y: 30, w: 170, h: 250, color: "#e878a0", desc: "Professor & Head" },
      { id: "204", x: 450, y: 290, w: 170, h: 220, color: "#b48fd0", desc: "Faculty Room" },
      { id: "205", x: 450, y: 520, w: 170, h: 210, color: "#9fdccb", desc: "Faculty Room" },
      { id: "206", x: 450, y: 740, w: 170, h: 140, color: "#eee08a", desc: "HoD Room" },
    ],
  },
  {
    key: "second",
    label: "Second Floor",
    entrances: [],
    rooms: [
      { id: "301", x: 30, y: 30, w: 180, h: 260, color: "#8f97d8", desc: "Lecture Hall" },
      { id: "308", x: 30, y: 300, w: 180, h: 260, color: "#e878a8", desc: "IEEE Room" },
      { id: "307", x: 30, y: 570, w: 180, h: 300, color: "#eeeecb", desc: "Lecture Hall" },
      { id: "302", x: 240, y: 30, w: 180, h: 260, color: "#7fcbd6", desc: "Lecture Hall" },
      { id: "306", x: 240, y: 570, w: 180, h: 300, color: "#e29fd0", desc: "Research & Development Lab" },
      { id: "303", x: 450, y: 30, w: 170, h: 220, color: "#eecf9f", desc: "Department Library" },
      { id: "304", x: 450, y: 260, w: 170, h: 240, color: "#3f9e5c", desc: "Lecture Hall" },
      { id: "305", x: 450, y: 700, w: 170, h: 170, color: "#a878c2", desc: "Seminar Hall" },
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
function addEdge(a, b, w) {
  ADJ[a] = ADJ[a] || []; ADJ[a].push({ to: b, w });
  ADJ[b] = ADJ[b] || []; ADJ[b].push({ to: a, w });
}
function svgDist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

FLOOR_DEFS.forEach(floor => {
  STAIRS.forEach(s => {
    NODES[`${s.key}_${floor.key}`] = { x: s.x, y: s.y, floor: floor.key, type: "stair", label: s.label };
  });
  floor.rooms.forEach(r => {
    NODES[r.id] = { x: r.x + r.w / 2, y: r.y + r.h / 2, floor: floor.key, type: "room", desc: r.desc };
  });
  floor.entrances.forEach(e => {
    NODES[e.id] = { x: e.x, y: e.y, floor: floor.key, type: "entrance", label: e.name };
  });
});

FLOOR_DEFS.forEach(floor => {
  floor.rooms.forEach(r => {
    STAIRS.forEach(s => {
      const a = NODES[r.id], b = NODES[`${s.key}_${floor.key}`];
      addEdge(r.id, `${s.key}_${floor.key}`, svgDist(a, b));
    });
  });
  floor.entrances.forEach(e => {
    STAIRS.forEach(s => {
      const a = NODES[e.id], b = NODES[`${s.key}_${floor.key}`];
      addEdge(e.id, `${s.key}_${floor.key}`, svgDist(a, b));
    });
  });
  addEdge(`A_${floor.key}`, `B_${floor.key}`, svgDist(NODES[`A_${floor.key}`], NODES[`B_${floor.key}`]));
});

// floor-to-floor: ONLY through the matching staircase column (A<->A, B<->B)
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
  return path;
}

function buildSteps(path) {
  const steps = [];
  const first = NODES[path[0]];
  const firstName = first.type === "room" ? `Room ${path[0]} — ${first.desc}` : first.label;
  steps.push(`Start at <b>${firstName}</b> (${floorLabel(first.floor)}).`);
  for (let i = 1; i < path.length; i++) {
    const prev = NODES[path[i - 1]], cur = NODES[path[i]];
    if (cur.type === "stair" && prev.type !== "stair") {
      steps.push(`Walk to <b>${cur.label}</b> (${floorLabel(cur.floor)}).`);
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
  const visibleFloorRef = useRef(visibleFloor);
  visibleFloorRef.current = visibleFloor;

  useEffect(() => {
    const mount = mountRef.current;
    const width = mount.clientWidth, height = mount.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#f3ece4");
    scene.fog = new THREE.Fog("#f3ece4", 25, 55);

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 200);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight("#ffffff", 0.65));
    const sun = new THREE.DirectionalLight("#fff2e0", 0.9);
    sun.position.set(14, 22, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -18; sun.shadow.camera.right = 18;
    sun.shadow.camera.top = 18; sun.shadow.camera.bottom = -18;
    scene.add(sun);
    const fill = new THREE.DirectionalLight("#cfe0ff", 0.25);
    fill.position.set(-12, 10, -10);
    scene.add(fill);

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(30, 48),
      new THREE.MeshStandardMaterial({ color: "#e7ddd0", roughness: 1 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.05;
    ground.receiveShadow = true;
    scene.add(ground);

    const roomMeshMap = {};
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
        new THREE.MeshStandardMaterial({ color: "#d8cfc3", roughness: 0.9 })
      );
      slab.position.set(slabCx, base, slabCz);
      slab.receiveShadow = true; slab.castShadow = true;
      group.add(slab);

      const roomH = FLOOR_H * 0.8;
      floor.rooms.forEach(r => {
        const w = r.w * SCALE, d = r.h * SCALE;
        const cx = toWorldX(r.x + r.w / 2), cz = toWorldZ(r.y + r.h / 2);
        const geo = new THREE.BoxGeometry(w, roomH, d);
        const mat = new THREE.MeshStandardMaterial({ color: r.color, roughness: 0.75, metalness: 0.02, emissive: 0x000000 });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(cx, base + 0.06 + roomH / 2, cz);
        mesh.castShadow = true; mesh.receiveShadow = true;
        group.add(mesh);
        roomMeshMap[r.id] = { mesh, floorKey: floor.key, desc: r.desc, baseColor: r.color };

        const edges = new THREE.EdgesGeometry(geo);
        const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: "#ffffff" }));
        line.position.copy(mesh.position);
        group.add(line);

        const label = makeTextSprite(r.id);
        label.position.set(cx, base + roomH + 0.35, cz);
        group.add(label);
      });

      floor.entrances.forEach(e => {
        const cx = toWorldX(e.x), cz = toWorldZ(e.y);
        const cone = new THREE.Mesh(
          new THREE.ConeGeometry(0.22, 0.5, 16),
          new THREE.MeshStandardMaterial({ color: "#6e2c3a" })
        );
        cone.position.set(cx, base + 0.3, cz);
        group.add(cone);
        const label = makeTextSprite(e.name, "#6e2c3a");
        label.scale.set(1.6, 0.8, 1);
        label.position.set(cx, base + 0.9, cz);
        group.add(label);
      });
    });

    // Two stair towers, spanning full building height (drawn once, not per floor)
    const towerHeight = FLOOR_BASE[FLOOR_BASE.length - 1] + FLOOR_H + 0.1;
    STAIRS.forEach(s => {
      const sx = toWorldX(s.x), sz = toWorldZ(s.y);
      const towerGeo = new THREE.CylinderGeometry(0.75, 0.75, towerHeight, 20, 1, true);
      const towerMat = new THREE.MeshStandardMaterial({
        color: "#8a8a8a", transparent: true, opacity: 0.3, side: THREE.DoubleSide, roughness: 0.4,
      });
      const tower = new THREE.Mesh(towerGeo, towerMat);
      tower.position.set(sx, towerHeight / 2, sz);
      scene.add(tower);
      const towerLine = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.CylinderGeometry(0.75, 0.75, towerHeight, 20, 4)),
        new THREE.LineBasicMaterial({ color: "#6a6a6a" })
      );
      towerLine.position.copy(tower.position);
      scene.add(towerLine);
      const towerLabel = makeTextSprite(s.label, "#4a4a4a");
      towerLabel.position.set(sx, towerHeight + 0.4, sz);
      scene.add(towerLabel);
      stairMeshMap[s.key] = { tower, towerLine, sx, sz };
    });

    const pathGroup = new THREE.Group();
    scene.add(pathGroup);
    const pathMarker = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 16, 16),
      new THREE.MeshStandardMaterial({ color: "#1f8a5f", emissive: "#1f8a5f", emissiveIntensity: 0.8 })
    );
    pathMarker.visible = false;
    scene.add(pathMarker);

    /* Manual orbit controls (OrbitControls unavailable in r128 here) */
    const target = new THREE.Vector3(0, FLOOR_BASE[1], 0);
    let radius = 16, theta = Math.PI / 4, phi = Math.PI / 3.2;
    let dragging = false, lastX = 0, lastY = 0, autoRotate = true, idleTimer = null;

    function updateCamera() {
      camera.position.x = target.x + radius * Math.sin(phi) * Math.sin(theta);
      camera.position.z = target.z + radius * Math.sin(phi) * Math.cos(theta);
      camera.position.y = target.y + radius * Math.cos(phi);
      camera.lookAt(target);
    }
    updateCamera();

    function onPointerDown(e) { dragging = true; autoRotate = false; lastX = e.clientX; lastY = e.clientY; clearTimeout(idleTimer); }
    function onPointerMove(e) {
      if (!dragging) return;
      const dx = e.clientX - lastX, dy = e.clientY - lastY;
      lastX = e.clientX; lastY = e.clientY;
      theta -= dx * 0.006;
      phi = Math.max(0.35, Math.min(Math.PI / 2 - 0.02, phi - dy * 0.006));
      updateCamera();
    }
    function onPointerUp() {
      dragging = false;
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => { autoRotate = true; }, 3500);
    }
    function onWheel(e) {
      e.preventDefault();
      radius = Math.max(6, Math.min(30, radius + e.deltaY * 0.01));
      updateCamera();
    }
    function onClick(e) {
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
    dom.addEventListener("wheel", onWheel, { passive: false });
    dom.addEventListener("click", onClick);

    let markerT = 0;
    let frameId;
    function animate() {
      frameId = requestAnimationFrame(animate);
      if (autoRotate) { theta += 0.0016; updateCamera(); }
      const vf = visibleFloorRef.current;
      FLOOR_DEFS.forEach(f => { floorGroups[f.key].visible = vf === "all" || vf === f.key; });
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
      scene, roomMeshMap, stairMeshMap, pathGroup, pathCurve: null,
      resetView: () => { radius = 16; theta = Math.PI / 4; phi = Math.PI / 3.2; updateCamera(); },
    };

    return () => {
      cancelAnimationFrame(frameId);
      ro.disconnect();
      dom.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
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
  }, []);

  function clearHighlights() {
    const { roomMeshMap, stairMeshMap } = threeRef.current;
    if (!roomMeshMap) return;
    Object.values(roomMeshMap).forEach(v => {
      v.mesh.material.emissive.set(0x000000);
      v.mesh.material.emissiveIntensity = 0;
    });
    Object.values(stairMeshMap).forEach(v => {
      v.tower.material.color.set("#8a8a8a");
      v.tower.material.opacity = 0.3;
    });
  }

  function handleFindRoute() {
    if (fromId === toId) { alert("Please choose two different locations."); return; }
    const path = dijkstra(fromId, toId);
    if (!path) { alert("No route could be found between these two points."); return; }

    const { roomMeshMap, stairMeshMap, pathGroup } = threeRef.current;

    while (pathGroup.children.length) {
      const child = pathGroup.children.pop();
      child.geometry && child.geometry.dispose();
      child.material && child.material.dispose();
      pathGroup.remove(child);
    }
    clearHighlights();

    [path[0], path[path.length - 1]].forEach(id => {
      if (roomMeshMap[id]) {
        roomMeshMap[id].mesh.material.emissive.set("#8c3a4a");
        roomMeshMap[id].mesh.material.emissiveIntensity = 0.55;
      }
    });
    path.forEach(id => {
      const node = NODES[id];
      if (node.type === "stair") {
        const key = id.split("_")[0];
        stairMeshMap[key].tower.material.color.set("#1f8a5f");
        stairMeshMap[key].tower.material.opacity = 0.55;
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
    const tubeMat = new THREE.MeshStandardMaterial({ color: "#1f8a5f", emissive: "#1f8a5f", emissiveIntensity: 0.5, roughness: 0.3 });
    const tube = new THREE.Mesh(tubeGeo, tubeMat);
    pathGroup.add(tube);

    const startMat = new THREE.MeshStandardMaterial({ color: "#8c3a4a", emissive: "#8c3a4a", emissiveIntensity: 0.6 });
    const endMat = new THREE.MeshStandardMaterial({ color: "#c99a2e", emissive: "#c99a2e", emissiveIntensity: 0.6 });
    const startSphere = new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 16), startMat);
    startSphere.position.copy(points[0]);
    const endSphere = new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 16), endMat);
    endSphere.position.copy(points[points.length - 1]);
    pathGroup.add(startSphere, endSphere);

    threeRef.current.pathCurve = curve;

    setSteps(buildSteps(path));
    setVisibleFloor("all");
  }

  function handleSwap() {
    setFromId(toId); setToId(fromId);
  }

  const optionsFor = () => (
    <>
      {FLOOR_DEFS.map(floor => (
        <optgroup key={floor.key} label={floor.label}>
          {floor.entrances.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          {floor.rooms.map(r => <option key={r.id} value={r.id}>{r.id} — {r.desc}</option>)}
        </optgroup>
      ))}
    </>
  );

  const floorTabs = [{ key: "all", label: "All Floors" }, ...FLOOR_DEFS.map(f => ({ key: f.key, label: f.label }))];

  return (
    <div style={{ width: "100%", height: "100vh", display: "flex", flexDirection: "column", fontFamily: "'Segoe UI', system-ui, sans-serif", background: "#f3ece4" }}>
      <div style={{ background: "#8c3a4a", color: "#fff", padding: "14px 22px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: "1.15rem" }}>St. Peter's Block — 3D Model & Route Finder</div>
          <div style={{ fontSize: "0.78rem", opacity: 0.85 }}>Drag to rotate · scroll to zoom · click a room for details</div>
        </div>
        <button
          onClick={() => threeRef.current.resetView && threeRef.current.resetView()}
          style={{ background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.4)", color: "#fff", borderRadius: 6, padding: "7px 14px", cursor: "pointer", fontSize: "0.82rem" }}
        >
          Reset View
        </button>
      </div>

      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        <div style={{ width: 300, background: "#fff", borderRight: "1px solid #e4d9d0", padding: 20, overflowY: "auto" }}>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: "block", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.06em", color: "#6e2c3a", fontWeight: 700, marginBottom: 6 }}>From</label>
            <select value={fromId} onChange={e => setFromId(e.target.value)} style={{ width: "100%", padding: "9px 10px", border: "1.5px solid #e4d9d0", borderRadius: 6, fontSize: "0.9rem" }}>
              {optionsFor()}
            </select>
          </div>
          <button onClick={handleSwap} style={{ background: "none", border: "1.5px solid #e4d9d0", borderRadius: 6, padding: "6px 10px", cursor: "pointer", fontSize: "0.78rem", color: "#6e2c3a", marginBottom: 14 }}>⇅ Swap</button>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: "block", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.06em", color: "#6e2c3a", fontWeight: 700, marginBottom: 6 }}>To</label>
            <select value={toId} onChange={e => setToId(e.target.value)} style={{ width: "100%", padding: "9px 10px", border: "1.5px solid #e4d9d0", borderRadius: 6, fontSize: "0.9rem" }}>
              {optionsFor()}
            </select>
          </div>
          <button onClick={handleFindRoute} style={{ width: "100%", padding: 12, background: "#8c3a4a", color: "#fff", border: "none", borderRadius: 6, fontWeight: 700, fontSize: "0.95rem", cursor: "pointer" }}>
            Find Shortest Route
          </button>

          {steps && (
            <div style={{ marginTop: 20, borderTop: "1px solid #e4d9d0", paddingTop: 14 }}>
              <div style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.06em", color: "#6e2c3a", fontWeight: 700, marginBottom: 8 }}>Directions</div>
              <ol style={{ margin: 0, paddingLeft: 18 }}>
                {steps.map((s, i) => <li key={i} style={{ fontSize: "0.88rem", marginBottom: 8, lineHeight: 1.4 }} dangerouslySetInnerHTML={{ __html: s }} />)}
              </ol>
            </div>
          )}
          {!steps && (
            <div style={{ marginTop: 20, fontSize: "0.82rem", color: "#777", lineHeight: 1.5 }}>
              The route always crosses floors through the same physical staircase — Staircase 1 only connects to Staircase 1 on the floor above/below, same for Staircase 2. Dijkstra's algorithm picks whichever combination gives the shortest overall path.
            </div>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", gap: 8, padding: "10px 22px", background: "#fff", borderBottom: "1px solid #e4d9d0", flexWrap: "wrap" }}>
            {floorTabs.map(t => (
              <div key={t.key} onClick={() => setVisibleFloor(t.key)}
                style={{
                  padding: "7px 16px", borderRadius: 20, cursor: "pointer", fontSize: "0.85rem", fontWeight: 600,
                  background: visibleFloor === t.key ? "#8c3a4a" : "#fff",
                  color: visibleFloor === t.key ? "#fff" : "#2b2320",
                  border: "1.5px solid " + (visibleFloor === t.key ? "#8c3a4a" : "#e4d9d0"),
                }}>
                {t.label}
              </div>
            ))}
          </div>
          <div style={{ position: "relative", flex: 1 }}>
            <div ref={mountRef} style={{ width: "100%", height: "100%" }} />
            {selected && (
              <div style={{ position: "absolute", bottom: 18, left: 18, background: "#fff", borderRadius: 8, padding: "14px 18px", boxShadow: "0 6px 20px rgba(0,0,0,0.15)", maxWidth: 260, border: "1px solid #e4d9d0" }}>
                <div style={{ fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.06em", color: "#8c3a4a", fontWeight: 700 }}>Room {selected.id}</div>
                <div style={{ fontSize: "0.95rem", marginTop: 4, fontWeight: 600 }}>{selected.desc}</div>
                <div style={{ fontSize: "0.78rem", color: "#777", marginTop: 4 }}>{floorLabel(selected.floor)}</div>
                <div onClick={() => setSelected(null)} style={{ position: "absolute", top: 8, right: 10, cursor: "pointer", color: "#999", fontSize: "0.9rem" }}>✕</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

