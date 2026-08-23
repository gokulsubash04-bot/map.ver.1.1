import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import "./BuildingModel3D.css";

import {
  FLOOR_ORDER,
  WARM_ROOM_COLORS,
  DARK_ROOM_COLORS,
  FLOOR_DEFS,
  STAIRS,
  STAIR_FLIGHT_COST,
  SCALE,
  CENTER,
  FLOOR_H,
  FLOOR_GAP,
  FLOOR_BASE,
  toWorldX,
  toWorldZ,
  floorLabel,
  floorIndex,
  NODES,
  ADJ,
  dijkstra,
  getNearestStairKey,
  getStairDirection,
  buildSteps
} from "./nodesData";


/* ==========================================================================
   DEPARTMENT BLOCK II — BLENDER 3D ARCHITECTURAL MODEL BUILDER
   Direct conversion of the user's Blender Python script:
   - W = 40, DEPTH = 8, HEIGHT = 12
   - Front and back identical facades & entrances
   - Terracotta panels, Cream columns & floor bands
   - Red canopies, Blue signs, Dark steps, Cylindrical columns with base & cap
   - Central tower & pitched triangular gable roof
   - Side walls with 3 tiers of windows
   ========================================================================== */
function buildBlenderBuildingShell() {
  const shellGroup = new THREE.Group();

  // Materials directly matching Blender script diffuse_color & roughness
  const WALL = new THREE.MeshStandardMaterial({ color: "#e0c7a8", roughness: 0.55, metalness: 0.05 });
  const CREAM = new THREE.MeshStandardMaterial({ color: "#eddcc6", roughness: 0.45, metalness: 0.1 });
  const TERRA = new THREE.MeshStandardMaterial({ color: "#ad381a", roughness: 0.50, metalness: 0.05 });
  const GLASS = new THREE.MeshStandardMaterial({ color: "#0f1f26", roughness: 0.20, metalness: 0.85, transparent: true, opacity: 0.65 });
  const WOOD = new THREE.MeshStandardMaterial({ color: "#331206", roughness: 0.60, metalness: 0.1 });
  const ROOF = new THREE.MeshStandardMaterial({ color: "#61210e", roughness: 0.50, metalness: 0.1, side: THREE.DoubleSide });
  const CANOPY = new THREE.MeshStandardMaterial({ color: "#85260f", roughness: 0.40, metalness: 0.1 });
  const SIGN = new THREE.MeshStandardMaterial({ color: "#05298c", roughness: 0.30, metalness: 0.3 });
  const DARK = new THREE.MeshStandardMaterial({ color: "#040505", roughness: 0.90 });
  const STEP = new THREE.MeshStandardMaterial({ color: "#141417", roughness: 0.80 });
  const GROUND = new THREE.MeshStandardMaterial({ color: "#335724", roughness: 0.95 });
  const PAVING = new THREE.MeshStandardMaterial({ color: "#857359", roughness: 0.60 });

  // 1:1 Mapping constants between Blender space (W=40, DEPTH=8, HEIGHT=12) and Three.js World
  const SX = 12.4 / 20.0;
  const SZ = 17.0 / 4.0;
  const SY = 8.4 / 12.0;

  const mX = (x) => x * SX;
  const mZ = (y) => y * SZ; // Blender Y is Three.js Z (depth)
  const mY = (z) => z * SY; // Blender Z is Three.js Y (height)

  const cube = (name, loc, size, material) => {
    // Blender size (dx, dy, dz) -> Three size (dx*SX, dz*SY, dy*SZ)
    const wX = Math.abs(size[0] * SX);
    const wY = Math.abs(size[2] * SY);
    const wZ = Math.abs(size[1] * SZ);

    const geo = new THREE.BoxGeometry(wX, wY, wZ);
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.set(mX(loc[0]), mY(loc[2]), mZ(loc[1]));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = name;
    shellGroup.add(mesh);
    return mesh;
  };

  const cylinder = (name, loc, radius, depth, material) => {
    const wRadius = radius * ((SX + SZ) / 2);
    const wHeight = depth * SY;
    const geo = new THREE.CylinderGeometry(wRadius, wRadius, wHeight, 32);
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.set(mX(loc[0]), mY(loc[2]), mZ(loc[1]));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = name;
    shellGroup.add(mesh);
    return mesh;
  };

  const gable = (name, x1, x2, y1, y2, zbase, ztop, material) => {
    const cx = (x1 + x2) / 2;
    const vertices = new Float32Array([
      mX(x1), mY(zbase), mZ(y1),
      mX(x2), mY(zbase), mZ(y1),
      mX(cx), mY(ztop), mZ(y1),

      mX(x1), mY(zbase), mZ(y2),
      mX(x2), mY(zbase), mZ(y2),
      mX(cx), mY(ztop), mZ(y2),
    ]);

    const indices = [
      0, 2, 1,
      3, 4, 5,
      0, 1, 4, 0, 4, 3,
      1, 4, 5, 1, 5, 2,
      0, 3, 5, 0, 5, 2
    ];

    let geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    geo.setIndex(indices);
    geo = geo.toNonIndexed();
    geo.computeVertexNormals();

    const mat = material.clone();
    mat.side = THREE.DoubleSide;

    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = name;
    shellGroup.add(mesh);
    return mesh;
  };

  const windowObj = (cx, cy, cz, width = 1.45, height = 1.55, rotY = 0) => {
    const winGroup = new THREE.Group();

    // Glass pane facing local -Z
    const glassMesh = new THREE.Mesh(new THREE.BoxGeometry(width * SX, height * SY, 0.12 * SZ), GLASS);
    glassMesh.castShadow = true;
    winGroup.add(glassMesh);

    const t = 0.10;
    // Wood Outer Frames
    const leftF = new THREE.Mesh(new THREE.BoxGeometry(t * SX, height * SY, 0.18 * SZ), WOOD);
    leftF.position.set((-width / 2 + t / 2) * SX, 0, -0.04 * SZ);
    winGroup.add(leftF);

    const rightF = new THREE.Mesh(new THREE.BoxGeometry(t * SX, height * SY, 0.18 * SZ), WOOD);
    rightF.position.set((width / 2 - t / 2) * SX, 0, -0.04 * SZ);
    winGroup.add(rightF);

    const topF = new THREE.Mesh(new THREE.BoxGeometry(width * SX, t * SY, 0.18 * SZ), WOOD);
    topF.position.set(0, (height / 2 - t / 2) * SY, -0.04 * SZ);
    winGroup.add(topF);

    const botF = new THREE.Mesh(new THREE.BoxGeometry(width * SX, t * SY, 0.18 * SZ), WOOD);
    botF.position.set(0, (-height / 2 + t / 2) * SY, -0.04 * SZ);
    winGroup.add(botF);

    // Center Vertical Mullion
    const midF = new THREE.Mesh(new THREE.BoxGeometry(0.08 * SX, height * SY, 0.20 * SZ), WOOD);
    midF.position.set(0, 0, -0.05 * SZ);
    winGroup.add(midF);

    // Protruding Cream Sill
    const sillMesh = new THREE.Mesh(new THREE.BoxGeometry((width + 0.20) * SX, 0.12 * SY, 0.30 * SZ), CREAM);
    sillMesh.position.set(0, (-height / 2 - 0.08) * SY, -0.08 * SZ);
    winGroup.add(sillMesh);

    winGroup.position.set(mX(cx), mY(cz), mZ(cy));
    winGroup.rotation.y = rotY;
    shellGroup.add(winGroup);
  };

  // 1. MAIN BUILDING BODY
  cube("Main Building", [0, 0, 6.0], [40, 8, 12.0], WALL);

  // TOP PARAPET ROOF CORNICE MOLDING (Main Building Top Roof Cap)
  cube("Top Parapet Trim Front", [0, -4.05, 12.1], [40.8, 0.40, 0.30], CREAM);
  cube("Top Parapet Trim Back", [0, 4.05, 12.1], [40.8, 0.40, 0.30], CREAM);
  cube("Top Parapet Trim Left", [-20.15, 0, 12.1], [0.30, 8.4, 0.30], CREAM);
  cube("Top Parapet Trim Right", [20.15, 0, 12.1], [0.30, 8.4, 0.30], CREAM);

  // 2. TERRACOTTA FRONT & BACK FACADE PANELS
  const facade_panels = (y, front = true) => {
    for (const [x1, x2] of [
      [-19.4, -16.5], [-16.0, -12.7], [-12.2, -8.8],
      [8.8, 12.2], [12.7, 16.0], [16.5, 19.4]
    ]) {
      for (const [z1, z2] of [
        [0.4, 3.9], [4.15, 7.55], [7.85, 11.15]
      ]) {
        cube("Terracotta Panel", [(x1 + x2) / 2, y, (z1 + z2) / 2], [x2 - x1, 0.12, z2 - z1], TERRA);
      }
    }

    for (const z of [3.85, 7.55, 11.15]) {
      cube("Horizontal Band", [0, y, z + 0.19], [40.6, 0.35, 0.38], CREAM);
    }

    for (const x of [-20, -16.5, -12.5, -8.0, -4, 4, 8.0, 12.5, 16.5, 20]) {
      cube("Vertical Column", [x, y, 5.9], [0.36, 0.45, 11.3], CREAM);
    }
  };

  facade_panels(-4.05, true);
  facade_panels(4.05, false);  // 3. CENTRAL TOWER & FLANKING SIDE TURRETS (Front and Back)
  // 3. CENTRAL TOWER & SINGLE CENTRAL ROOF PEAK (Front and Back)
  for (const y of [-4.25, 4.25]) {
    // Central Main Spire Tower (Yellow/Cream Protruding Bay matching Photo)
    cube("Central Tower", [0, y, 9.2], [6.4, 0.55, 18.0], CREAM);
    for (const x of [-3.0, 3.0]) {
      cube("Tower Frame", [x, y, 9.2], [0.35, 0.65, 18.0], CREAM);
    }

    // High Arched Glass Window on Top Floor of Central Tower (Matching Photo)
    const archY = y < 0 ? y - 0.32 : y + 0.32;
    cube("Central Arch Window Base", [0, archY, 14.2], [2.8, 0.12, 3.2], GLASS);
    gable("Central Arch Window Top Gable", -1.4, 1.4, archY - 0.06, archY + 0.06, 15.8, 17.5, GLASS);
  }

  // 4. WINDOWS (Front and Back Facades with additional Window columns)
  for (const y of [-4.30, 4.30]) {
    const rotY = y < 0 ? 0 : Math.PI;
    for (const z of [2.1, 5.55, 8.9]) {
      for (const x of [-17.8, -14.2, -11.2, -8.0, -5.2, 5.2, 8.0, 11.2, 14.2, 17.8]) {
        windowObj(x, y, z, 1.45, 1.55, rotY);
      }
    }
    for (const [z, w] of [
      [2.1, 1.6], [5.5, 1.6], [8.9, 1.6], [12.0, 1.45], [14.6, 1.25]
    ]) {
      windowObj(0, y, z, w, 1.55, rotY);
    }
  }

  // 5. CENTRAL ARCH & ENTRANCE TOWER
  for (const y of [-4.45, 4.45]) {
    cube("Central Entrance Tower", [0, y, 9.0], [4.8, 0.55, 13.0], CREAM);
    cube("Central Arch Glass", [0, y < 0 ? y - 0.32 : y + 0.32, 10.4], [2.0, 0.12, 3.0], GLASS);
  }



  // ENTRANCE BUILDER (Clean Facade Entrance without protruding front walkway body)
  const buildEntrance = (front = true) => {
    const ySign = front ? -1 : 1;
    const prefix = front ? "Front" : "Back";

    // Dark Recessed Entryway Portal
    cube(prefix + " Entrance Recess", [0, ySign * 4.42, 2.0], [5.8, 0.30, 3.6], DARK);

    // 3-Tier Stepped Stairs
    const stepsDef = [
      [0.25, 0.55, 4.8],
      [0.48, 0.45, 4.3],
      [0.71, 0.35, 3.8]
    ];
    stepsDef.forEach(([z, depth, width], i) => {
      cube(prefix + " Entrance Step", [0, ySign * (4.85 + depth * i / 3), z + 0.1], [width, depth, 0.20], STEP);
    });

    // Main Entrance Header Fascia Beam right above entrance columns
    cube(prefix + " Entrance Header Fascia", [0, ySign * 4.68, 4.18], [9.8, 0.30, 0.40], CREAM);
  };

  buildEntrance(true);  // Front Entrance
  buildEntrance(false); // Back Entrance (100% Identical)

  // ROOFS (Single Central Roof Peak over the Center Entrance Tower matching Campus Photo)
  gable("Front Central Roof Peak", -3.45, 3.45, -4.50, -3.80, 18.0, 21.2, ROOF);
  gable("Back Central Roof Peak", -3.45, 3.45, 3.80, 4.50, 18.0, 21.2, ROOF);

  // Ground Stepped Base Platform
  cube("Building Ground Base Platform", [0, 0, -0.20], [44.0, 8.8, 0.40], CREAM);

  // FULL SIDE FACADES (Left & Right Side Walls matching Front & Back Architecture)
  for (const x of [-20.15, 20.15]) {
    const isLeft = x < 0;
    const dir = isLeft ? -1 : 1;
    const rotY = isLeft ? -Math.PI / 2 : Math.PI / 2;
    const offPanel = dir * 0.08;
    const offCol = dir * 0.12;
    const offBand = dir * 0.10;

    cube("Side Main Wall", [x, 0, 6.0], [0.30, 8.2, 12.0], WALL);

    for (const [y1, y2] of [
      [-3.6, -1.9], [-1.7, 0.0], [0.2, 1.9], [2.1, 3.8]
    ]) {
      for (const [z1, z2] of [
        [0.4, 3.9], [4.15, 7.55], [7.85, 11.15]
      ]) {
        cube("Side Terracotta Panel", [x + offPanel, (y1 + y2) / 2, (z1 + z2) / 2], [0.12, y2 - y1, z2 - z1], TERRA);
      }
    }

    for (const z of [3.85, 7.55, 11.15]) {
      cube("Side Horizontal Band", [x + offBand, 0, z + 0.19], [0.35, 8.2, 0.38], CREAM);
    }

    for (const y of [-3.85, -1.8, 0.1, 2.0, 3.85]) {
      cube("Side Vertical Column", [x + offCol, y, 5.9], [0.45, 0.36, 11.3], CREAM);
    }

    // Restore side facade windows matching front elevation
    for (const z of [2.1, 5.55, 8.9]) {
      for (const y of [-2.75, -0.85, 1.05, 2.95]) {
        windowObj(x, y, z, 1.45, 1.55, rotY);
      }
    }
  }

  // GROUND & PAVING
  cube("Ground Lawn", [0, 0, -0.20], [46, 16, 0.40], GROUND);
  cube("Front Paving", [0, -6.0, 0.05], [43, 3.0, 0.10], PAVING);

  return shellGroup;
}

/* ================= 3D Sprite Label Helper ================= */
function makeTextSprite(text, color = "#ffffff") {
  const canvas = document.createElement("canvas");
  canvas.width = 256; canvas.height = 128;
  const ctx = canvas.getContext("2d");
  ctx.font = "bold 52px 'Outfit', sans-serif";
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

/* ================= SEARCHABLE COMBORDINATE SELECT COMPONENT ================= */
function SearchableSelect({ value, onChange, searchCategory, placeholder }) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const containerRef = useRef(null);
  const inputRef = useRef(null);
  const optionRefs = useRef([]);

  // Compute all available items from FLOOR_DEFS
  const allItems = React.useMemo(() => {
    const items = [];
    FLOOR_DEFS.forEach(floor => {
      floor.entrances.forEach(e => {
        items.push({
          id: e.id,
          name: e.name,
          displayText: e.name,
          label: `🚪 ${e.name}`,
          floorKey: floor.key,
          floorLabel: floor.label,
          type: "entrance",
          searchText: `${e.id} ${e.name} ${floor.label}`.toLowerCase()
        });
      });
      floor.rooms.forEach(r => {
        items.push({
          id: r.id,
          name: `Room ${r.id} — ${r.desc}`,
          displayText: `Room ${r.id} — ${r.desc}`,
          label: `📍 Room ${r.id} — ${r.desc}`,
          floorKey: floor.key,
          floorLabel: floor.label,
          type: "room",
          desc: r.desc,
          searchText: `${r.id} ${r.desc} ${floor.label}`.toLowerCase()
        });
      });
    });
    return items;
  }, []);

  // Get current selected item display label
  const selectedItem = allItems.find(item => item.id === value);
  const displayValue = selectedItem ? selectedItem.displayText : value;

  // Filter items based on category and search query
  const filteredItems = React.useMemo(() => {
    return allItems.filter(item => {
      // Category filter
      if (searchCategory !== "all") {
        if (item.type === "entrance") {
          if (searchCategory !== "entrances") return false;
        } else {
          const desc = item.desc ? item.desc.toLowerCase() : "";
          if (searchCategory === "halls" && !desc.includes("hall") && !desc.includes("lecture")) return false;
          if (searchCategory === "labs" && !desc.includes("lab") && !desc.includes("centre")) return false;
          if (searchCategory === "faculty" && !desc.includes("faculty") && !desc.includes("head") && !desc.includes("hod") && !desc.includes("professor")) return false;
          if (searchCategory === "toilets" && !desc.includes("toilet") && !desc.includes("waiting")) return false;
        }
      }

      if (!query.trim()) return true;
      const q = query.trim().toLowerCase();
      return item.searchText.includes(q);
    });
  }, [allItems, searchCategory, query]);

  // Reset highlight index on query/category change
  useEffect(() => {
    setHighlightedIndex(0);
  }, [query, searchCategory]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (isOpen && optionRefs.current[highlightedIndex]) {
      optionRefs.current[highlightedIndex].scrollIntoView({
        block: "nearest",
        behavior: "smooth"
      });
    }
  }, [highlightedIndex, isOpen]);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleInputChange = (e) => {
    const text = e.target.value;
    setQuery(text);
    setIsOpen(true);

    // Auto-select if user types exact ID (e.g., "205" or "ENT-L")
    const exactMatch = allItems.find(
      item => item.id.toLowerCase() === text.trim().toLowerCase()
    );
    if (exactMatch) {
      onChange(exactMatch.id);
    }
  };

  const handleSelectOption = (item) => {
    onChange(item.id);
    setQuery("");
    setIsOpen(false);
  };

  const handleClear = (e) => {
    e.stopPropagation();
    setQuery("");
    if (inputRef.current) inputRef.current.focus();
    setIsOpen(true);
  };

  const handleKeyDown = (e) => {
    if (!isOpen) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        setIsOpen(true);
        return;
      }
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex(prev => (prev + 1) % Math.max(1, filteredItems.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex(prev => (prev - 1 + filteredItems.length) % Math.max(1, filteredItems.length));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filteredItems.length > 0) {
        const itemToSelect = filteredItems[highlightedIndex] || filteredItems[0];
        handleSelectOption(itemToSelect);
      }
    } else if (e.key === "Escape") {
      setIsOpen(false);
    }
  };

  return (
    <div className="searchable-select-container" ref={containerRef}>
      <div className="searchable-input-wrapper">
        <span className="search-icon-left">🔍</span>
        <input
          ref={inputRef}
          type="text"
          className="searchable-input"
          value={isOpen ? query : displayValue}
          onFocus={() => {
            setIsOpen(true);
            setQuery("");
          }}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder || "Type location ID, room or name..."}
          autoComplete="off"
        />
        {query ? (
          <span className="search-clear-btn" onClick={handleClear} title="Clear search text">
            ✕
          </span>
        ) : (
          <span
            className={`toggle-arrow-right ${isOpen ? "open" : ""}`}
            onClick={() => setIsOpen(!isOpen)}
          >
            ▼
          </span>
        )}
      </div>

      {isOpen && (
        <div className="searchable-dropdown">
          {filteredItems.length === 0 ? (
            <div className="searchable-no-results">
              No matching locations found for "<strong>{query}</strong>"
            </div>
          ) : (
            FLOOR_DEFS.map(floor => {
              const floorItems = filteredItems.filter(item => item.floorKey === floor.key);
              if (floorItems.length === 0) return null;

              return (
                <div key={floor.key}>
                  <div className="searchable-group-label">{floor.label}</div>
                  {floorItems.map(item => {
                    const globalIdx = filteredItems.indexOf(item);
                    const isSelected = value === item.id;
                    const isHighlighted = highlightedIndex === globalIdx;

                    return (
                      <div
                        key={item.id}
                        ref={el => (optionRefs.current[globalIdx] = el)}
                        className={`searchable-option ${isSelected ? "selected" : ""} ${isHighlighted ? "highlighted" : ""}`}
                        onMouseEnter={() => setHighlightedIndex(globalIdx)}
                        onClick={() => handleSelectOption(item)}
                      >
                        <span>{item.label}</span>
                        <span className="option-floor-badge">{item.floorLabel}</span>
                      </div>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

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
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [activeTab, setActiveTab] = useState("route");
  const [themeMode, setThemeMode] = useState("warm");
  const [cameraPreset, setCameraPreset] = useState("iso");
  const [showNodes, setShowNodes] = useState(false); // Default hide node visualizer for visitors
  const [showShell, setShowShell] = useState(true); // Default show exterior Blender building shell

  const visibleFloorRef = useRef(visibleFloor);
  visibleFloorRef.current = visibleFloor;

  /* Three.js Engine Setup */
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const width = mount.clientWidth, height = mount.clientHeight;

    let bgColor, groundColor, slabColor, ambientColor, sunColor, roomColorMap, tubeColor, columnColor;
    if (themeMode === "warm") {
      bgColor = "#fdfbf7"; groundColor = "#dcd2c4"; slabColor = "#fef08a";
      ambientColor = "#ffffff"; sunColor = "#fff4e6"; roomColorMap = WARM_ROOM_COLORS;
      tubeColor = "#8c3a4a";
      columnColor = "#fef3c7";
    } else {
      bgColor = "#060913"; groundColor = "#0f172a"; slabColor = "#334155";
      ambientColor = "#e2e8f0"; sunColor = "#38bdf8"; roomColorMap = DARK_ROOM_COLORS;
      tubeColor = "#10b981";
      columnColor = "#cbd5e1";
    }

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(bgColor);
    scene.fog = new THREE.Fog(bgColor, 24, 70);

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 200);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);

    const ambientLight = new THREE.AmbientLight(ambientColor, themeMode === "warm" ? 0.75 : 0.75);
    scene.add(ambientLight);

    const sun = new THREE.DirectionalLight(sunColor, themeMode === "warm" ? 0.95 : 0.85);
    sun.position.set(18, 26, 14);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -20; sun.shadow.camera.right = 20;
    sun.shadow.camera.top = 20; sun.shadow.camera.bottom = -20;
    scene.add(sun);

    const fill = new THREE.DirectionalLight(themeMode === "warm" ? "#fecdd3" : "#34d399", 0.35);
    fill.position.set(-14, 12, -12);
    scene.add(fill);

    // 3D Exterior Architectural Building Shell from Blender Model Script
    const shellGroup = buildBlenderBuildingShell();
    scene.add(shellGroup);

    // Clean Ground Pad & Natural Lawn Ring
    const lawn = new THREE.Mesh(
      new THREE.CircleGeometry(36, 64),
      new THREE.MeshStandardMaterial({
        color: themeMode === "warm" ? "#2d5a27" : "#0f291e",
        roughness: 0.95, metalness: 0.05
      })
    );
    lawn.rotation.x = -Math.PI / 2;
    lawn.position.y = -0.06;
    lawn.receiveShadow = true;
    scene.add(lawn);

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(31, 64),
      new THREE.MeshStandardMaterial({ color: groundColor, roughness: 0.8, metalness: 0.1 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.05;
    ground.receiveShadow = true;
    scene.add(ground);

    // Paved Entrance Pathway
    const pathwayMat = new THREE.MeshStandardMaterial({
      color: themeMode === "warm" ? "#b45309" : "#334155",
      roughness: 0.5, metalness: 0.2
    });
    const mainPath = new THREE.Mesh(new THREE.BoxGeometry(22, 0.02, 3.8), pathwayMat);
    mainPath.position.set(0, 0.001, toWorldZ(430));
    mainPath.receiveShadow = true;
    scene.add(mainPath);

    // 3D Decorative Campus Street Lamps along Entrance Pathway
    const lampPositions = [
      { x: -10, z: toWorldZ(430) - 2.4 }, { x: -10, z: toWorldZ(430) + 2.4 },
      { x: 10, z: toWorldZ(430) - 2.4 }, { x: 10, z: toWorldZ(430) + 2.4 }
    ];
    lampPositions.forEach(pos => {
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.05, 2.2, 8),
        new THREE.MeshStandardMaterial({ color: "#1e293b", metalness: 0.8 })
      );
      pole.position.set(pos.x, 1.1, pos.z);
      scene.add(pole);
      const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.18, 12, 12),
        new THREE.MeshStandardMaterial({ color: "#fef08a", emissive: "#fef08a", emissiveIntensity: 1.2 })
      );
      head.position.set(pos.x, 2.2, pos.z);
      scene.add(head);
    });

    // 3D Animated Campus Water Fountain Plaza in Front of Building Entrance
    const fountainGroup = new THREE.Group();
    fountainGroup.position.set(0, 0.001, toWorldZ(430) + 4.6);
    scene.add(fountainGroup);

    const basinRing = new THREE.Mesh(
      new THREE.CylinderGeometry(2.4, 2.6, 0.3, 32),
      new THREE.MeshStandardMaterial({ color: columnColor, roughness: 0.6, metalness: 0.2 })
    );
    basinRing.position.y = 0.15;
    fountainGroup.add(basinRing);

    const waterPool = new THREE.Mesh(
      new THREE.CylinderGeometry(2.25, 2.25, 0.22, 32),
      new THREE.MeshStandardMaterial({
        color: "#0284c7", emissive: "#0369a1", emissiveIntensity: 0.4,
        roughness: 0.05, metalness: 0.8, transparent: true, opacity: 0.85
      })
    );
    waterPool.position.y = 0.16;
    fountainGroup.add(waterPool);

    const spoutPillar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.45, 0.7, 16),
      new THREE.MeshStandardMaterial({ color: columnColor, roughness: 0.4 })
    );
    spoutPillar.position.y = 0.35;
    fountainGroup.add(spoutPillar);

    const waterSpray = new THREE.Mesh(
      new THREE.ConeGeometry(0.65, 1.2, 16, 1, true),
      new THREE.MeshStandardMaterial({
        color: "#7dd3fc", emissive: "#38bdf8", emissiveIntensity: 0.9,
        transparent: true, opacity: 0.6, side: THREE.DoubleSide
      })
    );
    waterSpray.position.y = 1.0;
    fountainGroup.add(waterSpray);



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

      // Transparent Architectural Floor Slab Beam
      const slabMat = new THREE.MeshStandardMaterial({
        color: columnColor,
        roughness: 0.3,
        metalness: 0.2,
        transparent: true,
        opacity: 0.35,
        depthWrite: false
      });
      const slab = new THREE.Mesh(
        new THREE.BoxGeometry(slabW, 0.14, slabD),
        slabMat
      );
      slab.position.set(slabCx, base, slabCz);
      slab.receiveShadow = true; slab.castShadow = true;
      group.add(slab);

      // Floor Slab Outline Edge
      const slabEdges = new THREE.EdgesGeometry(new THREE.BoxGeometry(slabW, 0.14, slabD));
      const slabLineMat = new THREE.LineBasicMaterial({
        color: columnColor,
        transparent: true,
        opacity: 0.6
      });
      const slabLine = new THREE.LineSegments(slabEdges, slabLineMat);
      slabLine.position.copy(slab.position);
      group.add(slabLine);

      // Cream Horizontal Floor Moldings (Transparent)
      const trimMat = new THREE.MeshStandardMaterial({
        color: columnColor,
        roughness: 0.3,
        metalness: 0.3,
        transparent: true,
        opacity: 0.4,
        depthWrite: false
      });
      const trim = new THREE.Mesh(new THREE.BoxGeometry(slabW + 0.1, 0.08, slabD + 0.1), trimMat);
      trim.position.set(slabCx, base + 0.07, slabCz);
      group.add(trim);

      // Top Floor Roof Ceiling Slab & Molding (Upper Panel for Top Floor)
      if (fi === FLOOR_DEFS.length - 1) {
        const topRoofY = base + FLOOR_H;

        const topSlab = new THREE.Mesh(new THREE.BoxGeometry(slabW, 0.14, slabD), slabMat);
        topSlab.position.set(slabCx, topRoofY, slabCz);
        topSlab.receiveShadow = true; topSlab.castShadow = true;
        group.add(topSlab);

        const topSlabEdges = new THREE.EdgesGeometry(new THREE.BoxGeometry(slabW, 0.14, slabD));
        const topSlabLine = new THREE.LineSegments(topSlabEdges, slabLineMat);
        topSlabLine.position.copy(topSlab.position);
        group.add(topSlabLine);

        const topTrim = new THREE.Mesh(new THREE.BoxGeometry(slabW + 0.1, 0.08, slabD + 0.1), trimMat);
        topTrim.position.set(slabCx, topRoofY + 0.07, slabCz);
        group.add(topTrim);
      }

      // Vertical Structural Support Columns (Building Pillars)
      if (fi > 0) {
        const pillarMat = new THREE.MeshStandardMaterial({ color: columnColor, roughness: 0.4, metalness: 0.2 });
        [-slabW / 2 + 0.5, slabW / 2 - 0.5].forEach(px => {
          [-slabD / 2 + 0.5, slabD / 2 - 0.5].forEach(pz => {
            const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, FLOOR_H, 12), pillarMat);
            pillar.position.set(slabCx + px, base - FLOOR_H / 2, slabCz + pz);
            pillar.castShadow = true;
            group.add(pillar);
          });
        });
      }

      // Corridor Glass Balustrade Railings for Upper Floors
      if (fi > 0) {
        const railingGlassMat = new THREE.MeshStandardMaterial({
          color: "#38bdf8", transparent: true, opacity: 0.35, roughness: 0.1, metalness: 0.8
        });
        const railingCapMat = new THREE.MeshStandardMaterial({ color: columnColor, roughness: 0.3, metalness: 0.7 });
        const railing = new THREE.Mesh(new THREE.BoxGeometry(slabW, 0.45, 0.04), railingGlassMat);
        railing.position.set(slabCx, base + 0.3, slabCz + slabD / 2);
        const railingCap = new THREE.Mesh(new THREE.BoxGeometry(slabW, 0.05, 0.06), railingCapMat);
        railingCap.position.set(slabCx, base + 0.53, slabCz + slabD / 2);
        group.add(railing, railingCap);
      }

      const roomH = FLOOR_H * 0.8;

      floor.rooms.forEach(r => {
        const w = r.w * SCALE, d = r.h * SCALE;
        const cx = toWorldX(r.x + r.w / 2), cz = toWorldZ(r.y + r.h / 2);
        const geo = new THREE.BoxGeometry(w, roomH, d);

        const roomColor = roomColorMap[r.id] || "#a83232";
        const mat = new THREE.MeshStandardMaterial({ color: roomColor, roughness: 0.5, metalness: 0.1 });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(cx, base + 0.07 + roomH / 2, cz);
        mesh.castShadow = true; mesh.receiveShadow = true;
        group.add(mesh);

        // Realistic Room Door ONLY on the Inside Corridor-Facing Wall
        const doorFrameMat = new THREE.MeshStandardMaterial({ color: "#334155", roughness: 0.6, metalness: 0.2 });
        const doorPanelMat = new THREE.MeshStandardMaterial({ color: "#78350f", roughness: 0.4, metalness: 0.1 });
        const doorHandleMat = new THREE.MeshStandardMaterial({ color: "#f59e0b", metalness: 0.9, roughness: 0.1 });

        let doorWallSide;
        if (r.x <= 50) {
          doorWallSide = 'right'; // Left wing rooms put door on right wall (+X) facing inner corridor
        } else if (r.x >= 400) {
          doorWallSide = 'left';  // Right wing rooms put door on left wall (-X) facing inner corridor
        } else {
          doorWallSide = (r.x + r.w / 2) < 320 ? 'left' : 'right';
        }

        const doorX = doorWallSide === 'left' ? cx - w / 2 - 0.01 : cx + w / 2 + 0.01;
        const doorY = base + 0.07 + (roomH * 0.65) / 2;

        const doorFrame = new THREE.Mesh(new THREE.BoxGeometry(0.06, roomH * 0.68, 0.42), doorFrameMat);
        doorFrame.position.set(doorX, doorY, cz);

        const doorPanel = new THREE.Mesh(new THREE.BoxGeometry(0.04, roomH * 0.64, 0.38), doorPanelMat);
        doorPanel.position.set(doorX, doorY, cz);

        const doorHandle = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 12), doorHandleMat);
        doorHandle.position.set(doorX + (doorWallSide === 'left' ? -0.03 : 0.03), base + 0.07 + (roomH * 0.35), cz + 0.12);

        group.add(doorFrame, doorPanel, doorHandle);

        // Interior Room Micro-Furniture Details
        if (r.desc.includes("Lecture") || r.desc.includes("Hall")) {
          const board = new THREE.Mesh(
            new THREE.BoxGeometry(w * 0.45, roomH * 0.4, 0.03),
            new THREE.MeshStandardMaterial({ color: "#064e3b", roughness: 0.8 })
          );
          board.position.set(cx, base + 0.07 + roomH * 0.5, cz - d / 2 + 0.04);
          group.add(board);

          const benchMat = new THREE.MeshStandardMaterial({ color: "#78350f", roughness: 0.6 });
          [-d * 0.15, d * 0.15].forEach(bz => {
            const bench = new THREE.Mesh(new THREE.BoxGeometry(w * 0.55, 0.1, 0.14), benchMat);
            bench.position.set(cx, base + 0.12, cz + bz);
            group.add(bench);
          });
        } else if (r.desc.includes("Lab")) {
          const pcMat = new THREE.MeshStandardMaterial({ color: "#38bdf8", emissive: "#38bdf8", emissiveIntensity: 0.9 });
          [-w * 0.2, w * 0.2].forEach(px => {
            const pcScreen = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.02), pcMat);
            pcScreen.position.set(cx + px, base + 0.35, cz);
            group.add(pcScreen);
          });
        } else if (r.desc.includes("Library")) {
          const shelfMat = new THREE.MeshStandardMaterial({ color: "#5c3d2e", roughness: 0.5 });
          const shelf = new THREE.Mesh(new THREE.BoxGeometry(w * 0.55, roomH * 0.55, 0.14), shelfMat);
          shelf.position.set(cx, base + 0.07 + roomH * 0.3, cz);
          group.add(shelf);
        }

        // Room wireframe edges
        const edges = new THREE.EdgesGeometry(geo);
        const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: "rgba(255,255,255,0.7)" }));
        line.position.copy(mesh.position);
        group.add(line);

        const label = makeTextSprite(r.id, "#ffffff");
        label.position.set(cx, base + roomH + 0.35, cz);
        group.add(label);

        roomMeshMap[r.id] = { mesh, line, label, floorKey: floor.key, desc: r.desc, baseColor: roomColor };
      });

      // Rooftop Architectural Elements (Solar Panel Arrays, HVAC Chillers & Building Emblem)
      if (fi === 2) {
        const solarMat = new THREE.MeshStandardMaterial({ color: "#1e3a8a", metalness: 0.95, roughness: 0.1 });
        const frameMat = new THREE.MeshStandardMaterial({ color: "#475569", metalness: 0.8, roughness: 0.3 });

        [-slabW * 0.25, slabW * 0.25].forEach(sx => {
          const solarPanel = new THREE.Mesh(new THREE.BoxGeometry(slabW * 0.35, 0.05, slabD * 0.28), solarMat);
          solarPanel.position.set(slabCx + sx, base + FLOOR_H + 0.25, slabCz - slabD * 0.2);
          solarPanel.rotation.x = -Math.PI / 12;
          group.add(solarPanel);
        });

        const hvac = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.7, 1.0), frameMat);
        hvac.position.set(slabCx, base + FLOOR_H + 0.42, slabCz + slabD * 0.2);
        group.add(hvac);

        const logoSprite = makeTextSprite("", themeMode === "warm" ? "#8c3a4a" : "#38bdf8");
        logoSprite.scale.set(3.2, 1.6, 1);
        logoSprite.position.set(slabCx, base + FLOOR_H + 1.25, slabCz + slabD / 2 + 0.2);
        group.add(logoSprite);
      }

      floor.entrances.forEach(e => {
        const cx = toWorldX(e.x), cz = toWorldZ(e.y);
        const entColor = themeMode === "warm" ? "#8c3a4a" : "#10b981";
        const cone = new THREE.Mesh(
          new THREE.ConeGeometry(0.28, 0.65, 16),
          new THREE.MeshStandardMaterial({ color: entColor, emissive: entColor, emissiveIntensity: 0.75 })
        );
        cone.position.set(cx, base + 0.35, cz);
        group.add(cone);

        // Ground Floor Entrance Porch Canopy with terracotta red tile roof
        const porchMat = new THREE.MeshStandardMaterial({ color: columnColor, roughness: 0.3 });
        const porchPillar1 = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.1, 8), porchMat);
        porchPillar1.position.set(cx - 0.5, base + 0.55, cz + 0.5);
        const porchPillar2 = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.1, 8), porchMat);
        porchPillar2.position.set(cx + 0.5, base + 0.55, cz + 0.5);
        group.add(porchPillar1, porchPillar2);

        // Slanted Terracotta Pitched Porch Roof
        const porchRoofMat = new THREE.MeshStandardMaterial({ color: "#991b1b", roughness: 0.6 });
        const porchRoof = new THREE.Mesh(new THREE.ConeGeometry(0.9, 0.45, 4), porchRoofMat);
        porchRoof.rotation.y = Math.PI / 4;
        porchRoof.position.set(cx, base + 1.25, cz + 0.3);
        group.add(porchRoof);

        const label = makeTextSprite(e.name, entColor);
        label.scale.set(1.6, 0.8, 1);
        label.position.set(cx, base + 1.6, cz);
        group.add(label);

        entranceMeshMap[e.id] = { cone, label, floorKey: floor.key, baseColor: entColor };
      });
    });

    // REAL 3D Staircase Models with Physical Steps, Handrails, and Architectural Glass Enclosure
    const towerHeight = FLOOR_BASE[FLOOR_BASE.length - 1] + FLOOR_H + 0.1;
    STAIRS.forEach(s => {
      const sx = toWorldX(s.x), sz = toWorldZ(s.y);
      const towerColor = themeMode === "warm" ? "#8c3a4a" : "#38bdf8";

      const stairGroup = new THREE.Group();
      stairGroup.position.set(sx, 0, sz);
      scene.add(stairGroup);

      // 1. Central Core Metal Pillar
      const coreCol = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.12, towerHeight, 16),
        new THREE.MeshStandardMaterial({ color: "#475569", metalness: 0.8, roughness: 0.2 })
      );
      coreCol.position.set(0, towerHeight / 2, 0);
      stairGroup.add(coreCol);

      // 2. Physical 3D Step Treads & Handrails for each floor flight
      const stepMat = new THREE.MeshStandardMaterial({
        color: themeMode === "warm" ? "#78350f" : "#334155",
        roughness: 0.3,
        metalness: 0.2
      });
      const handrailMat = new THREE.MeshStandardMaterial({
        color: themeMode === "warm" ? "#d97706" : "#38bdf8",
        metalness: 0.9,
        roughness: 0.1
      });

      const stepsPerFlight = 14;
      const handrailPoints = [];

      for (let fi = 0; fi < FLOOR_BASE.length - 1; fi++) {
        const startY = FLOOR_BASE[fi] + 0.07;
        const endY = FLOOR_BASE[fi + 1] + 0.07;
        const flightH = endY - startY;

        for (let i = 0; i < stepsPerFlight; i++) {
          const t = i / stepsPerFlight;
          const y = startY + t * flightH;
          const angle = fi * Math.PI + i * (Math.PI * 1.5 / stepsPerFlight);

          const stepMesh = new THREE.Mesh(
            new THREE.BoxGeometry(0.72, 0.05, 0.28),
            stepMat
          );
          const radius = 0.42;
          const stepX = Math.cos(angle) * radius;
          const stepZ = Math.sin(angle) * radius;
          stepMesh.position.set(stepX, y, stepZ);
          stepMesh.rotation.y = -angle + Math.PI / 2;
          stepMesh.castShadow = true;
          stepMesh.receiveShadow = true;
          stairGroup.add(stepMesh);

          // Vertical Baluster post for handrail
          const baluster = new THREE.Mesh(
            new THREE.CylinderGeometry(0.015, 0.015, 0.55, 8),
            handrailMat
          );
          const outerR = radius + 0.28;
          const hX = Math.cos(angle) * outerR;
          const hZ = Math.sin(angle) * outerR;
          baluster.position.set(hX, y + 0.275, hZ);
          stairGroup.add(baluster);

          handrailPoints.push(new THREE.Vector3(hX, y + 0.55, hZ));
        }

        // Floor Landing Platform
        const landing = new THREE.Mesh(
          new THREE.CylinderGeometry(0.82, 0.82, 0.08, 16, 1, false, fi * Math.PI, Math.PI),
          stepMat
        );
        landing.position.set(0, endY, 0);
        stairGroup.add(landing);
      }

      // Continuous Helical Handrail Tube
      if (handrailPoints.length > 2) {
        const handrailCurve = new THREE.CatmullRomCurve3(handrailPoints);
        const handrailGeo = new THREE.TubeGeometry(handrailCurve, 64, 0.025, 8, false);
        const handrailMesh = new THREE.Mesh(handrailGeo, handrailMat);
        stairGroup.add(handrailMesh);
      }

      // 3. Octagonal Glass Tower Enclosure with Steel Corner Posts
      const towerGeo = new THREE.CylinderGeometry(0.85, 0.85, towerHeight, 8, 1, true);
      const towerMat = new THREE.MeshStandardMaterial({
        color: towerColor, transparent: true, opacity: 0.28, side: THREE.DoubleSide, roughness: 0.1, emissive: towerColor, emissiveIntensity: 0.2
      });
      const tower = new THREE.Mesh(towerGeo, towerMat);
      tower.position.set(sx, towerHeight / 2, sz);
      scene.add(tower);

      const towerLine = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.CylinderGeometry(0.85, 0.85, towerHeight, 8, 4)),
        new THREE.LineBasicMaterial({ color: towerColor, transparent: true, opacity: 0.6 })
      );
      towerLine.position.copy(tower.position);
      scene.add(towerLine);

      // Steel Corner Posts
      for (let c = 0; c < 8; c++) {
        const cAngle = c * (Math.PI * 2 / 8);
        const px = sx + Math.cos(cAngle) * 0.85;
        const pz = sz + Math.sin(cAngle) * 0.85;
        const post = new THREE.Mesh(
          new THREE.CylinderGeometry(0.025, 0.025, towerHeight, 8),
          new THREE.MeshStandardMaterial({ color: "#334155", metalness: 0.8 })
        );
        post.position.set(px, towerHeight / 2, pz);
        scene.add(post);
      }

      const towerLabel = makeTextSprite(s.label, towerColor);
      towerLabel.position.set(sx, towerHeight + 0.4, sz);
      scene.add(towerLabel);

      stairMeshMap[s.key] = { tower, towerLine, label: towerLabel, stairGroup, sx, sz };
    });

    /* ================= 3D Node & Edge Visualizer Overlay ================= */
    const nodesGroup = new THREE.Group();
    scene.add(nodesGroup);

    const nodeColorMap = {
      room: "#3b82f6",     // Blue
      door: "#06b6d4",     // Cyan
      corridor: "#10b981", // Emerald Green
      stair: "#a855f7",    // Purple
      entrance: "#f59e0b"  // Gold / Yellow
    };

    const edgeLinesPoints = [];

    Object.entries(NODES).forEach(([id, data]) => {
      const fi = floorIndex(data.floor);
      const base = FLOOR_BASE[fi];
      const wx = toWorldX(data.x);
      const wz = toWorldZ(data.y);
      const wy = base + 0.2;

      const nodeColor = nodeColorMap[data.type] || "#ffffff";
      const radiusSize = data.type === "room" ? 0.16 : (data.type === "door" ? 0.12 : 0.09);
      const nodeMesh = new THREE.Mesh(
        new THREE.SphereGeometry(radiusSize, 12, 12),
        new THREE.MeshStandardMaterial({
          color: nodeColor,
          emissive: nodeColor,
          emissiveIntensity: 0.9,
          roughness: 0.2
        })
      );
      nodeMesh.position.set(wx, wy, wz);
      nodesGroup.add(nodeMesh);

      // Graph edges connecting lines
      (ADJ[id] || []).forEach(edge => {
        const targetNode = NODES[edge.to];
        if (targetNode) {
          const tfi = floorIndex(targetNode.floor);
          const tbase = FLOOR_BASE[tfi];
          const twx = toWorldX(targetNode.x);
          const twz = toWorldZ(targetNode.y);
          const twy = tbase + 0.2;

          edgeLinesPoints.push(new THREE.Vector3(wx, wy, wz));
          edgeLinesPoints.push(new THREE.Vector3(twx, twy, twz));
        }
      });
    });

    const edgeGeo = new THREE.BufferGeometry().setFromPoints(edgeLinesPoints);
    const edgeMat = new THREE.LineBasicMaterial({
      color: "#10b981",
      transparent: true,
      opacity: 0.35
    });
    const edgeLinesMesh = new THREE.LineSegments(edgeGeo, edgeMat);
    nodesGroup.add(edgeLinesMesh);

    const pathGroup = new THREE.Group();
    scene.add(pathGroup);

    const pathMarker = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 16, 16),
      new THREE.MeshStandardMaterial({ color: tubeColor, emissive: tubeColor, emissiveIntensity: 1.4 })
    );
    pathMarker.visible = false;
    scene.add(pathMarker);

    // 3D Selected Room Holographic Beacon Beam
    const beaconGroup = new THREE.Group();
    scene.add(beaconGroup);

    const beaconCylinder = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.45, 3.8, 16, 1, true),
      new THREE.MeshStandardMaterial({
        color: "#38bdf8", emissive: "#38bdf8", emissiveIntensity: 1.5,
        transparent: true, opacity: 0.6, side: THREE.DoubleSide
      })
    );
    beaconGroup.add(beaconCylinder);

    const beaconRing = new THREE.Mesh(
      new THREE.RingGeometry(0.2, 0.65, 32),
      new THREE.MeshStandardMaterial({
        color: "#38bdf8", emissive: "#38bdf8", emissiveIntensity: 1.8,
        transparent: true, opacity: 0.85, side: THREE.DoubleSide
      })
    );
    beaconRing.rotation.x = -Math.PI / 2;
    beaconGroup.add(beaconRing);

    // Orbit Camera State (Starts facing front facade elevation & zoomed out for wide framing)
    const target = new THREE.Vector3(0, FLOOR_BASE[1] + 1.2, 0);
    let radius = 42, theta = 0, phi = Math.PI / 2.3;
    let dragging = false, lastX = 0, lastY = 0, autoRotate = true, idleTimer = null;
    let startX = 0, startY = 0;

    const activePointers = new Map();
    let initialPinchDist = 0, initialRadius = 0;

    function updateCamera() {
      camera.position.x = target.x + radius * Math.sin(phi) * Math.sin(theta);
      camera.position.z = target.z + radius * Math.sin(phi) * Math.cos(theta);
      camera.position.y = target.y + radius * Math.cos(phi);
      camera.lookAt(target);
    }
    updateCamera();

    function setPreset(type) {
      if (type === "top") {
        radius = 42; theta = 0; phi = 0.05;
      } else if (type === "front") {
        radius = 40; theta = 0; phi = Math.PI / 2.3;
      } else {
        radius = 42; theta = Math.PI / 4; phi = Math.PI / 3.2;
      }
      updateCamera();
    }

    function onPointerDown(e) {
      activePointers.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });
      autoRotate = false;
      clearTimeout(idleTimer);

      if (activePointers.size === 1) {
        dragging = true;
        lastX = e.clientX; lastY = e.clientY;
        startX = e.clientX; startY = e.clientY;
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
        phi = Math.max(0.05, Math.min(Math.PI / 2 - 0.02, phi - dy * 0.006));
        updateCamera();
      } else if (activePointers.size === 2) {
        const pts = Array.from(activePointers.values());
        const dist = Math.hypot(pts[0].clientX - pts[1].clientX, pts[0].clientY - pts[1].clientY);
        if (initialPinchDist > 0 && dist > 0) {
          const factor = initialPinchDist / dist;
          radius = Math.max(6, Math.min(45, initialRadius * factor));
          updateCamera();
        }
      }
    }

    function onPointerUp(e) {
      activePointers.delete(e.pointerId);
      if (activePointers.size < 2) initialPinchDist = 0;

      if (activePointers.size === 0) {
        dragging = false;
        clearTimeout(idleTimer);
        idleTimer = setTimeout(() => { autoRotate = true; }, 4000);
      } else if (activePointers.size === 1) {
        const remaining = activePointers.values().next().value;
        lastX = remaining.clientX; lastY = remaining.clientY;
        dragging = true;
      }
    }

    function onWheel(e) {
      e.preventDefault();
      radius = Math.max(6, Math.min(45, radius + e.deltaY * 0.012));
      updateCamera();
    }

    function onClick(e) {
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
      if (autoRotate) { theta += 0.0015; updateCamera(); }
      if (waterSpray) {
        waterSpray.rotation.y += 0.025;
        waterSpray.scale.y = 1.0 + Math.sin(Date.now() * 0.006) * 0.15;
      }
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
      if (threeRef.current.shellGroup) {
        threeRef.current.shellGroup.visible = (vf === "all") && threeRef.current.showShellState;
      }
      if (threeRef.current.nodesGroup) {
        threeRef.current.nodesGroup.visible = threeRef.current.showNodesState;
      }
      if (threeRef.current.selectedRoomId && roomMeshMap[threeRef.current.selectedRoomId]) {
        const rPos = roomMeshMap[threeRef.current.selectedRoomId].mesh.position;
        beaconGroup.position.set(rPos.x, rPos.y + 0.5, rPos.z);
        beaconCylinder.visible = true;
        beaconRing.visible = true;
        beaconCylinder.rotation.y += 0.03;
        beaconRing.scale.setScalar(1.0 + Math.sin(Date.now() * 0.008) * 0.25);
      } else {
        beaconCylinder.visible = false;
        beaconRing.visible = false;
      }

      if (threeRef.current.pathCurve) {
        markerT = (markerT + 0.003) % 1;
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
      scene, shellGroup, roomMeshMap, entranceMeshMap, stairMeshMap, pathGroup, nodesGroup, showNodesState: showNodes, showShellState: showShell, pathCurve: null,
      resetView: () => { radius = 26; theta = Math.PI / 4; phi = Math.PI / 3.2; updateCamera(); },
      zoomIn: () => { radius = Math.max(6, radius - 3); updateCamera(); },
      zoomOut: () => { radius = Math.min(45, radius + 3); updateCamera(); },
      setPreset,
      toggleAutoRotate: () => { autoRotate = !autoRotate; },
      tubeColor,
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

  useEffect(() => {
    if (threeRef.current) {
      threeRef.current.showNodesState = showNodes;
    }
  }, [showNodes]);

  useEffect(() => {
    if (threeRef.current) {
      threeRef.current.showShellState = showShell;
    }
  }, [showShell]);

  useEffect(() => {
    if (threeRef.current) {
      threeRef.current.selectedRoomId = selected ? selected.id : null;
    }
  }, [selected]);

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
        v.tower.material.opacity = 0.35;
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

    const { roomMeshMap, entranceMeshMap, stairMeshMap, pathGroup, tubeColor } = threeRef.current;

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
      if (node && node.type === "stair") pathStairKeys.add(id.split("_")[0]);
    });

    Object.entries(roomMeshMap).forEach(([id, v]) => {
      const onPath = pathSet.has(id);
      v.mesh.visible = onPath;
      if (v.line) v.line.visible = onPath;
      if (v.label) v.label.visible = onPath;
    });

    if (entranceMeshMap) {
      Object.entries(entranceMeshMap).forEach(([id, v]) => {
        const onPath = pathSet.has(id);
        v.cone.visible = onPath;
        if (v.label) v.label.visible = onPath;
      });
    }

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

    if (roomMeshMap[startId]) {
      roomMeshMap[startId].mesh.material.emissive.set("#2563eb");
      roomMeshMap[startId].mesh.material.emissiveIntensity = 0.85;
    } else if (entranceMeshMap && entranceMeshMap[startId]) {
      entranceMeshMap[startId].cone.material.color.set("#2563eb");
      entranceMeshMap[startId].cone.material.emissive.set("#2563eb");
      entranceMeshMap[startId].cone.material.emissiveIntensity = 0.85;
    }

    if (roomMeshMap[endId]) {
      roomMeshMap[endId].mesh.material.emissive.set("#ef4444");
      roomMeshMap[endId].mesh.material.emissiveIntensity = 0.85;
    } else if (entranceMeshMap && entranceMeshMap[endId]) {
      entranceMeshMap[endId].cone.material.color.set("#ef4444");
      entranceMeshMap[endId].cone.material.emissive.set("#ef4444");
      entranceMeshMap[endId].cone.material.emissiveIntensity = 0.85;
    }

    path.forEach(id => {
      if (id !== startId && id !== endId) {
        const node = NODES[id];
        if (node.type === "stair") {
          const key = id.split("_")[0];
          stairMeshMap[key].tower.material.color.set(tubeColor || "#10b981");
          stairMeshMap[key].tower.material.opacity = 0.65;
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
    const tubeMat = new THREE.MeshStandardMaterial({ color: tubeColor || "#10b981", emissive: tubeColor || "#10b981", emissiveIntensity: 1.3, roughness: 0.2 });
    const tube = new THREE.Mesh(tubeGeo, tubeMat);
    pathGroup.add(tube);

    const startSphere = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 16), new THREE.MeshStandardMaterial({ color: "#2563eb", emissive: "#2563eb", emissiveIntensity: 0.8 }));
    startSphere.position.copy(points[0]);

    const endSphere = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 16), new THREE.MeshStandardMaterial({ color: "#ef4444", emissive: "#ef4444", emissiveIntensity: 0.8 }));
    endSphere.position.copy(points[points.length - 1]);

    pathGroup.add(startSphere, endSphere);

    for (let i = 1; i < points.length - 1; i++) {
      const interSphere = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 16), new THREE.MeshStandardMaterial({ color: tubeColor || "#10b981", emissive: tubeColor || "#10b981", emissiveIntensity: 0.8 }));
      interSphere.position.copy(points[i]);
      pathGroup.add(interSphere);
    }

    threeRef.current.pathCurve = curve;

    const { steps: buildStepList, stairFlightsCount } = buildSteps(path);
    setSteps(buildStepList);

    setRouteStats({ stairs: stairFlightsCount });

    const floorIndices = path.map(id => floorIndex(NODES[id].floor));
    const minIdx = Math.min(...floorIndices), maxIdx = Math.max(...floorIndices);
    const activeFloors = [];
    for (let i = minIdx; i <= maxIdx; i++) activeFloors.push(FLOOR_ORDER[i]);

    if (activeFloors.length === FLOOR_ORDER.length) setVisibleFloor("all");
    else if (activeFloors.length === 1) setVisibleFloor(activeFloors[0]);
    else setVisibleFloor(activeFloors);
  }

  function handleSwap() {
    setFromId(toId); setToId(fromId);
  }

  const floorTabs = [{ key: "all", label: "🏢 All Floors" }, ...FLOOR_DEFS.map(f => ({ key: f.key, label: f.label }))];

  const categoryChips = [
    { key: "all", label: "🌐 All Locations" },
    { key: "halls", label: "🏛️ Lecture Halls" },
    { key: "labs", label: "🧪 Labs & Research" },
    { key: "faculty", label: "👨‍🏫 Faculty & Staff" },
    { key: "toilets", label: "🚻 Restrooms & Waiting" },
  ];

  return (
    <div className={`main-container theme-${themeMode}`}>
      {/* HUD Top Header Bar */}
      <div className="header-bar">
        <div className="brand-section">
          <div className="brand-logo-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
          </div>
          <div>
            <div className="brand-title">3D Campus Navigation Studio</div>
            <div className="brand-subtitle">
              <span className="live-indicator-dot" />
              <span>Interactive Building Map</span>
            </div>
          </div>
        </div>

        <div className="header-controls">
          {/* Exterior Facade Building Shell Toggle */}
          <button
            className={`hud-btn ${showShell ? "active" : ""}`}
            onClick={() => setShowShell(!showShell)}
            title="Toggle Building Facade Shell"
            aria-label="Toggle Building Facade Shell"
          >
            🏛️ {showShell ? "Building Facade: ON" : "Building Facade: OFF"}
          </button>

          {/* Theme Selector Pill Group */}
          <div style={{ display: "flex", gap: 4, background: "rgba(0,0,0,0.18)", padding: 4, borderRadius: 14 }}>
            <button
              className={`hud-btn ${themeMode === "warm" ? "active" : ""}`}
              onClick={() => setThemeMode("warm")}
              title="Terracotta Campus Theme"
              aria-label="Terracotta Campus Theme"
            >
              🏛️ Terracotta Campus
            </button>
            <button
              className={`hud-btn ${themeMode === "dark" ? "active" : ""}`}
              onClick={() => setThemeMode("dark")}
              title="Obsidian Midnight Theme"
              aria-label="Obsidian Midnight Theme"
            >
              🌌 Obsidian Midnight
            </button>
          </div>
        </div>
      </div>

      {/* Floating Toggle Drawer Button when Drawer is Collapsed */}
      {!drawerOpen && (
        <button className="toggle-drawer-btn" onClick={() => setDrawerOpen(true)} title="Open Navigation Panel" aria-label="Open Navigation Panel">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="12" x2="21" y2="12"></line>
            <line x1="3" y1="6" x2="21" y2="6"></line>
            <line x1="3" y1="18" x2="21" y2="18"></line>
          </svg>
        </button>
      )}

      {/* Floating Floor Selector Bar (Center Top) */}
      <div className="floor-selector-bar" role="navigation" aria-label="Floor Selection">
        {floorTabs.map(t => {
          const isTabActive = visibleFloor === t.key || (Array.isArray(visibleFloor) && visibleFloor.includes(t.key));
          return (
            <button
              key={t.key}
              onClick={() => setVisibleFloor(t.key)}
              className={`floor-pill-btn ${isTabActive ? "active" : ""}`}
              aria-label={t.label}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Camera View Toolbar (Right Side) */}
      <div className="camera-toolbar" role="toolbar" aria-label="3D View Controls">
        <button
          className={`camera-btn ${cameraPreset === "iso" ? "active" : ""}`}
          onClick={() => { setCameraPreset("iso"); threeRef.current.setPreset && threeRef.current.setPreset("iso"); }}
          title="3D Isometric Perspective"
          aria-label="3D Isometric Perspective"
        >
          📐
        </button>
        <button
          className={`camera-btn ${cameraPreset === "top" ? "active" : ""}`}
          onClick={() => { setCameraPreset("top"); threeRef.current.setPreset && threeRef.current.setPreset("top"); }}
          title="2D Top-Down Floorplan"
          aria-label="2D Top-Down Floorplan"
        >
          🔝
        </button>
        <button
          className={`camera-btn ${cameraPreset === "front" ? "active" : ""}`}
          onClick={() => { setCameraPreset("front"); threeRef.current.setPreset && threeRef.current.setPreset("front"); }}
          title="Front Building Elevation"
          aria-label="Front Building Elevation"
        >
          🏢
        </button>
        <div style={{ height: 1, background: "var(--btn-border)", margin: "2px 0" }} />
        <button className="camera-btn" onClick={() => threeRef.current.zoomIn && threeRef.current.zoomIn()} title="Zoom In" aria-label="Zoom In">
          ➕
        </button>
        <button className="camera-btn" onClick={() => threeRef.current.zoomOut && threeRef.current.zoomOut()} title="Zoom Out" aria-label="Zoom Out">
          ➖
        </button>
        <button className="camera-btn" onClick={() => threeRef.current.resetView && threeRef.current.resetView()} title="Reset Camera View" aria-label="Reset Camera View">
          🔄
        </button>
      </div>

      <div className="content-row">
        {/* Sidebar Panel Drawer */}
        <div className={`sidebar-panel ${!drawerOpen ? "collapsed" : ""}`}>
          <div className="drawer-header">
            <div className="mobile-pull-handle" onClick={() => setDrawerOpen(false)} />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
              <div className="drawer-nav-tabs" role="tablist">
                <button className={`drawer-tab-btn ${activeTab === "route" ? "active" : ""}`} onClick={() => setActiveTab("route")} role="tab" aria-selected={activeTab === "route"}>
                  🗺️ Route Planner
                </button>
                <button className={`drawer-tab-btn ${activeTab === "search" ? "active" : ""}`} onClick={() => setActiveTab("search")} role="tab" aria-selected={activeTab === "search"}>
                  🔍 Room Directory
                </button>
              </div>
              <button
                onClick={() => setDrawerOpen(false)}
                style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: "1.2rem", padding: "4px 8px" }}
                title="Close Navigation Drawer"
                aria-label="Close Navigation Drawer"
              >
                ✕
              </button>
            </div>
          </div>

          <div className="drawer-body">
            {activeTab === "route" && (
              <>
                {/* Category Quick Filter */}
                <div>
                  <div className="input-label">Filter Category</div>
                  <div className="chips-container">
                    {categoryChips.map(c => (
                      <button
                        key={c.key}
                        onClick={() => setSearchCategory(c.key)}
                        className={`chip-btn ${searchCategory === c.key ? "active" : ""}`}
                        aria-label={c.label}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* From Location Search & Selection */}
                <div>
                  <div className="input-label">
                    <span>From (Start Point)</span>
                    <span style={{ color: "var(--badge-start)", fontWeight: 900 }}>📍 Start Point</span>
                  </div>
                  <SearchableSelect
                    value={fromId}
                    onChange={setFromId}
                    searchCategory={searchCategory}
                    placeholder="Type or select start room..."
                  />
                  <div style={{ fontSize: "0.76rem", color: "var(--text-muted)", marginTop: 6 }}>
                    Nearest Staircase: <strong>{getNearestStairKey(fromId) === "A" ? "Staircase 1" : "Staircase 2"}</strong> ({getStairDirection(fromId, getNearestStairKey(fromId))})
                  </div>
                </div>

                {/* Swap Button */}
                <div className="swap-btn-wrapper">
                  <button className="swap-circle-btn" onClick={handleSwap} title="Swap Start & Destination" aria-label="Swap Start and Destination">
                    ⇅
                  </button>
                </div>

                {/* To Location Search & Selection */}
                <div>
                  <div className="input-label">
                    <span>To (Destination)</span>
                    <span style={{ color: "var(--badge-end)", fontWeight: 900 }}>🏁 Destination</span>
                  </div>
                  <SearchableSelect
                    value={toId}
                    onChange={setToId}
                    searchCategory={searchCategory}
                    placeholder="Type or select destination room..."
                  />
                </div>

                <button className="action-btn-primary" onClick={handleFindRoute} aria-label="Find Shortest Route">
                  <span>🚀</span> Find Shortest Route
                </button>

                {steps && (
                  <button className="action-btn-secondary" onClick={handleClearRoute} aria-label="Clear Route">
                    Clear Route
                  </button>
                )}

                {/* Route Summary Stats */}
                {routeStats && routeStats.stairs > 0 && (
                  <div className="route-summary-card">
                    <div className="stat-box" style={{ width: "100%" }}>
                      <div className="stat-val">🪜 {routeStats.stairs}</div>
                      <div className="stat-lbl">Stair Flights</div>
                    </div>
                  </div>
                )}

                {/* Step-by-Step Directions */}
                {steps && (
                  <div>
                    <div className="input-label" style={{ marginBottom: 10 }}>Step-by-Step Directions</div>
                    <div className="directions-list">
                      {steps.map((st, i) => (
                        <div key={i} className="direction-step">
                          <div className="step-num">{i + 1}</div>
                          <div>
                            <div style={{ fontWeight: 800 }}>{st.title}</div>
                            <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>{st.detail}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              </>
            )}

            {activeTab === "search" && (
              <>
                <div className="input-label">Building Directory</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {FLOOR_DEFS.map(floor => (
                    <div key={floor.key} style={{ background: "rgba(0,0,0,0.14)", borderRadius: 16, padding: 14 }}>
                      <div style={{ fontWeight: 900, fontSize: "0.88rem", fontFamily: "var(--font-heading)", color: "var(--accent-glow)", marginBottom: 10 }}>
                        {floor.label}
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {floor.rooms.map(r => (
                          <div
                            key={r.id}
                            onClick={() => setSelected({ id: r.id, desc: r.desc, floor: floor.key })}
                            style={{
                              padding: "9px 12px",
                              borderRadius: 10,
                              background: "var(--chip-bg)",
                              cursor: "pointer",
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              fontSize: "0.84rem",
                              transition: "all 0.2s ease"
                            }}
                          >
                            <span style={{ fontWeight: 800 }}>Room {r.id}</span>
                            <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>{r.desc}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* 3D Canvas Mount */}
        <div className="canvas-wrapper">
          <div ref={mountRef} className="canvas-element" />

          {/* Selected Room Detail Drawer Pop-up Card */}
          {selected && (
            <div className="room-card-popup">
              <div className="card-close-btn" onClick={() => setSelected(null)}>✕</div>
              <div className="room-card-badge">{floorLabel(selected.floor)}</div>
              <div className="room-card-title">Room {selected.id}</div>
              <div className="room-card-subtitle">{selected.desc}</div>

              <div className="room-card-actions">
                <button
                  className="card-act-btn start"
                  onClick={() => { setFromId(selected.id); setSelected(null); setDrawerOpen(true); }}
                >
                  📍 Set as Start
                </button>
                <button
                  className="card-act-btn end"
                  onClick={() => { setToId(selected.id); setSelected(null); setDrawerOpen(true); }}
                >
                  🏁 Set as End
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
