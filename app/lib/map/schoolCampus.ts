import * as THREE from "three";
import { buildLowPolyRoadsidePlanter, buildLowPolyStreetLight } from "./cityFurniture.ts";

export type SchoolZone = "teaching" | "laboratory" | "administration" | "dormitory" | "sports" | "natatorium";

export type SchoolCampusModel = THREE.Group & {
  userData: {
    modelType: "school-campus";
    generatedLocally: true;
    zones: SchoolZone[];
    buildingCount: number;
    teachingBuildingCount: number;
    classroomCount: number;
    laboratoryCount: number;
    dormitoryCount: number;
    dormRoomCount: number;
    runningTrackLanes: number;
    basketballCourtCount: number;
    tennisCourtCount: number;
    swimmingLaneCount: number;
    treeAnchorCount: number;
    streetLightCount: number;
    planterCount: number;
    fenceSegmentCount: number;
    scaleReferenceLengthMeters: number;
    scaleStandard: "rabbit-rider";
    decorationSources: string[];
    siteSize: THREE.Vector3;
    runningTrackLengthMeters: number;
    setMainGateOpen: (open: boolean) => void;
    setInteriorCutaway: (cutaway: boolean) => void;
    setPowered: (powered: boolean) => void;
  };
};

function campusMesh<T extends THREE.BufferGeometry>(
  geometry: T,
  material: THREE.Material,
  name: string,
  zone?: SchoolZone,
) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  if (zone) mesh.userData.zone = zone;
  return mesh;
}

function stadiumCurve(halfStraight: number, radius: number, y: number) {
  const points: THREE.Vector3[] = [];
  const segments = 24;
  for (let index = 0; index <= segments; index += 1) {
    const angle = -Math.PI * 0.5 + index / segments * Math.PI;
    points.push(new THREE.Vector3(halfStraight + Math.cos(angle) * radius, y, Math.sin(angle) * radius));
  }
  for (let index = 0; index <= segments; index += 1) {
    const angle = Math.PI * 0.5 + index / segments * Math.PI;
    points.push(new THREE.Vector3(-halfStraight + Math.cos(angle) * radius, y, Math.sin(angle) * radius));
  }
  return new THREE.CatmullRomCurve3(points, true, "centripetal", 0.35);
}

function stadiumShape(halfStraight: number, radius: number, laneWidth: number) {
  const shape = new THREE.Shape();
  shape.moveTo(-halfStraight, -radius - laneWidth);
  shape.lineTo(halfStraight, -radius - laneWidth);
  shape.absarc(halfStraight, 0, radius + laneWidth, -Math.PI * 0.5, Math.PI * 0.5, false);
  shape.lineTo(-halfStraight, radius + laneWidth);
  shape.absarc(-halfStraight, 0, radius + laneWidth, Math.PI * 0.5, Math.PI * 1.5, false);
  const hole = new THREE.Path();
  hole.moveTo(-halfStraight, -radius);
  hole.lineTo(halfStraight, -radius);
  hole.absarc(halfStraight, 0, radius, -Math.PI * 0.5, Math.PI * 0.5, false);
  hole.lineTo(-halfStraight, radius);
  hole.absarc(-halfStraight, 0, radius, Math.PI * 0.5, Math.PI * 1.5, false);
  shape.holes.push(hole);
  return shape;
}

export function buildLowPolySchoolCampus(): SchoolCampusModel {
  const campus = new THREE.Group() as SchoolCampusModel;
  campus.name = "city-school-campus-lowpoly";
  const cutawayShell: THREE.Object3D[] = [];
  const mainGatePanels: THREE.Mesh[] = [];
  const nightLights: THREE.Light[] = [];

  const concrete = new THREE.MeshStandardMaterial({ color: 0xd6d0c1, roughness: 0.95 });
  const ivory = new THREE.MeshStandardMaterial({ color: 0xf0eadc, roughness: 0.88 });
  const brick = new THREE.MeshStandardMaterial({ color: 0xa95543, roughness: 0.82 });
  const brickDark = new THREE.MeshStandardMaterial({ color: 0x7e3f37, roughness: 0.86 });
  const navy = new THREE.MeshStandardMaterial({ color: 0x294b62, roughness: 0.67, metalness: 0.12 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x29353c, roughness: 0.67, metalness: 0.28 });
  const paving = new THREE.MeshStandardMaterial({ color: 0xc6bca8, roughness: 0.96 });
  const asphalt = new THREE.MeshStandardMaterial({ color: 0x50565a, roughness: 0.98 });
  const grass = new THREE.MeshStandardMaterial({ color: 0x568050, roughness: 0.98 });
  const fieldGreen = new THREE.MeshStandardMaterial({ color: 0x3f7d4f, roughness: 0.96 });
  const trackRed = new THREE.MeshStandardMaterial({ color: 0xa94f43, roughness: 0.94 });
  const courtBlue = new THREE.MeshStandardMaterial({ color: 0x3c6f8b, roughness: 0.91 });
  const tennisGreen = new THREE.MeshStandardMaterial({ color: 0x3f7563, roughness: 0.92 });
  const poolBlue = new THREE.MeshStandardMaterial({ color: 0x2f98bd, emissive: 0x0a4763, emissiveIntensity: 0.14, roughness: 0.24, transparent: true, opacity: 0.82 });
  const whiteLine = new THREE.MeshStandardMaterial({ color: 0xf1eee1, roughness: 0.72 });
  const timber = new THREE.MeshStandardMaterial({ color: 0xa47750, roughness: 0.86 });
  const mattress = new THREE.MeshStandardMaterial({ color: 0xaac0cc, roughness: 0.96 });
  const labTop = new THREE.MeshStandardMaterial({ color: 0xc6ced0, roughness: 0.52, metalness: 0.26 });
  const windowGlass = new THREE.MeshStandardMaterial({ color: 0x6e9fae, emissive: 0x294f5c, emissiveIntensity: 0.12, roughness: 0.28, metalness: 0.18 });
  const atriumGlass = new THREE.MeshStandardMaterial({ color: 0x82b7c2, emissive: 0x294f5c, emissiveIntensity: 0.1, roughness: 0.22, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide });
  const warmLight = new THREE.MeshStandardMaterial({ color: 0xffdca3, emissive: 0xffaa42, emissiveIntensity: 0.12, roughness: 0.3 });

  const site = campusMesh(new THREE.BoxGeometry(170, 0.35, 130), concrete, "school-campus-site-base");
  site.position.y = 0.17;
  campus.add(site);
  const lawn = campusMesh(new THREE.BoxGeometry(164, 0.12, 124), grass, "school-campus-landscape-lawn");
  lawn.position.y = 0.39;
  campus.add(lawn);

  // A continuous 3.1 m campus perimeter. The south edge is split around the
  // staffed main gate; all other edges remain closed.
  const schoolFence = new THREE.Group();
  schoolFence.name = "school-campus-protection-fence";
  campus.add(schoolFence);
  const addFenceSegment = (length: number, x: number, z: number, alongX: boolean) => {
    const segment = new THREE.Group();
    segment.name = "school-campus-protection-fence-segment";
    segment.position.set(x, 0, z);
    segment.userData.controlledPerimeter = true;
    schoolFence.add(segment);
    const base = campusMesh(
      new THREE.BoxGeometry(alongX ? length : 0.52, 0.62, alongX ? 0.52 : length),
      brickDark,
      "school-campus-fence-masonry-base",
      "administration",
    );
    base.position.y = 0.71;
    segment.add(base);
    for (const height of [1.25, 2.92]) {
      const rail = campusMesh(
        new THREE.BoxGeometry(alongX ? length : 0.16, 0.15, alongX ? 0.16 : length),
        dark,
        "school-campus-fence-horizontal-rail",
        "administration",
      );
      rail.position.y = height;
      segment.add(rail);
    }
    const posts = Math.ceil(length / 2.8);
    for (let index = 0; index <= posts; index += 1) {
      const offset = -length * 0.5 + index / posts * length;
      const post = campusMesh(new THREE.BoxGeometry(0.14, 2.45, 0.14), dark, "school-campus-fence-post", "administration");
      post.position.set(alongX ? offset : 0, 1.83, alongX ? 0 : offset);
      segment.add(post);
    }
  };
  addFenceSegment(168, 0, -64, true);
  addFenceSegment(128, -84, 0, false);
  addFenceSegment(128, 84, 0, false);
  addFenceSegment(74, -47, 64, true);
  addFenceSegment(74, 47, 64, true);

  const paths = [
    [0, 0.47, 44, 8, 38],
    [-30, 0.47, 39, 48, 5],
    [-39, 0.47, 2, 5, 70],
    [23, 0.47, 13, 52, 5],
    [9, 0.47, -17, 5, 50],
    [-50, 0.47, -30, 50, 5],
  ] as const;
  paths.forEach(([x, y, z, width, depth], index) => {
    const path = campusMesh(new THREE.BoxGeometry(width, 0.12, depth), paving, "school-campus-pedestrian-path");
    path.position.set(x, y, z);
    path.userData.routeIndex = index;
    campus.add(path);
  });
  const serviceRoad = campusMesh(new THREE.BoxGeometry(158, 0.11, 4), asphalt, "school-campus-service-road");
  serviceRoad.position.set(0, 0.48, 61.8);
  campus.add(serviceRoad);

  const gate = new THREE.Group();
  gate.name = "school-campus-main-gate";
  gate.position.set(0, 0, 62);
  campus.add(gate);
  for (const x of [-8.2, 8.2]) {
    const pier = campusMesh(new THREE.BoxGeometry(1.6, 5.2, 1.8), brick, "school-campus-gate-pier", "administration");
    pier.position.set(x, 3, 0);
    gate.add(pier);
  }
  const lintel = campusMesh(new THREE.BoxGeometry(18, 1.15, 1.5), navy, "school-campus-gate-lintel", "administration");
  lintel.position.set(0, 5.25, 0);
  gate.add(lintel);
  for (const side of [-1, 1]) {
    const panel = campusMesh(new THREE.BoxGeometry(6.6, 3.25, 0.16), dark, "school-campus-main-gate-panel", "administration");
    panel.position.set(side * 10.6, 2.08, 0);
    panel.userData = { side, closedX: side * 3.35, openX: side * 10.6, open: true };
    mainGatePanels.push(panel);
    gate.add(panel);
  }

  type BuildingResult = { group: THREE.Group; levels: number[]; width: number; depth: number; roofY: number };
  const addBuilding = ({
    name, zone, x, z, width, depth, floors, accent = brick,
  }: {
    name: string; zone: SchoolZone; x: number; z: number; width: number; depth: number; floors: number; accent?: THREE.Material;
  }): BuildingResult => {
    const front = 1;
    const group = new THREE.Group();
    group.name = name;
    group.userData.zone = zone;
    group.userData.frontDirection = "+z";
    group.position.set(x, 0, z);
    campus.add(group);
    const pitch = 3.35;
    const height = floors * pitch + 0.6;
    const levels = Array.from({ length: floors }, (_, index) => 0.65 + index * pitch);
    const foundation = campusMesh(new THREE.BoxGeometry(width + 0.8, 0.4, depth + 0.8), dark, "school-building-foundation", zone);
    foundation.position.y = 0.62;
    const rear = campusMesh(new THREE.BoxGeometry(width, height, 0.3), ivory, "school-building-rear-wall", zone);
    rear.position.set(0, height * 0.5 + 0.55, -front * depth * 0.5);
    const sideA = campusMesh(new THREE.BoxGeometry(0.3, height, depth), accent, "school-building-side-wall", zone);
    sideA.position.set(-width * 0.5, height * 0.5 + 0.55, 0);
    const sideB = sideA.clone();
    sideB.position.x = width * 0.5;
    sideB.userData = { ...sideB.userData, cutawayRole: "observation-side" };
    group.add(foundation, rear, sideA, sideB);
    cutawayShell.push(sideB);
    const bayCount = Math.max(4, Math.floor(width / 3.2));
    levels.forEach((level) => {
      const slab = campusMesh(new THREE.BoxGeometry(width - 0.28, 0.18, depth - 0.3), concrete, "school-building-floor-slab", zone);
      slab.position.y = level;
      group.add(slab);
      const band = campusMesh(new THREE.BoxGeometry(width, 0.62, 0.34), accent, "school-building-front-band", zone);
      band.position.set(0, level + 0.42, front * depth * 0.5);
      const head = campusMesh(new THREE.BoxGeometry(width, 0.68, 0.34), ivory, "school-building-front-head", zone);
      head.position.set(0, level + 2.86, front * depth * 0.5);
      group.add(band, head);
      cutawayShell.push(band, head);
      const bayWidth = (width - 1.2) / bayCount;
      for (let bay = 0; bay < bayCount; bay += 1) {
        const pane = campusMesh(new THREE.BoxGeometry(bayWidth - 0.34, 1.58, 0.13), windowGlass, "school-building-window", zone);
        pane.position.set(-width * 0.5 + 0.6 + bayWidth * (bay + 0.5), level + 1.7, front * (depth * 0.5 + 0.16));
        group.add(pane);
        cutawayShell.push(pane);
      }
      for (let pier = 0; pier <= bayCount; pier += 1) {
        const frame = campusMesh(new THREE.BoxGeometry(0.28, 1.62, 0.32), ivory, "school-building-window-frame", zone);
        frame.position.set(-width * 0.5 + 0.6 + bayWidth * pier, level + 1.7, front * (depth * 0.5 + 0.02));
        group.add(frame);
        cutawayShell.push(frame);
      }
      const light = campusMesh(new THREE.BoxGeometry(width * 0.48, 0.07, 0.42), warmLight, "school-interior-ceiling-light", zone);
      light.position.set(0, level + 2.85, 0);
      group.add(light);
    });
    const roofY = 0.7 + floors * pitch;
    const roof = campusMesh(new THREE.BoxGeometry(width + 0.42, 0.32, depth + 0.42), navy, "school-building-flat-roof", zone);
    roof.position.y = roofY;
    group.add(roof);
    cutawayShell.push(roof);
    return { group, levels, width, depth, roofY };
  };

  const teachingA = addBuilding({ name: "school-teaching-building-a", zone: "teaching", x: -57, z: 18, width: 38, depth: 14, floors: 4 });
  const teachingB = addBuilding({ name: "school-teaching-building-b", zone: "teaching", x: -57, z: -2, width: 38, depth: 14, floors: 4 });
  const laboratory = addBuilding({ name: "school-laboratory-building", zone: "laboratory", x: -16, z: 6, width: 26, depth: 20, floors: 5, accent: navy });
  const administration = addBuilding({ name: "school-administration-building", zone: "administration", x: 0, z: 39, width: 28, depth: 13, floors: 3, accent: brickDark });
  const dormA = addBuilding({ name: "school-student-dormitory-a", zone: "dormitory", x: -59, z: -40, width: 34, depth: 13, floors: 6, accent: brickDark });
  const dormB = addBuilding({ name: "school-student-dormitory-b", zone: "dormitory", x: -24, z: -43, width: 28, depth: 13, floors: 6, accent: brickDark });

  const addEntrance = (building: BuildingResult, zone: SchoolZone, label: string) => {
    const front = 1;
    const canopy = campusMesh(new THREE.BoxGeometry(8.5, 0.3, 2.7), navy, `${label}-entrance-canopy`, zone);
    canopy.position.set(0, 3.35, front * (building.depth * 0.5 + 1.1));
    const door = campusMesh(new THREE.BoxGeometry(4.6, 2.45, 0.18), atriumGlass, `${label}-entrance-door`, zone);
    door.position.set(0, 1.9, front * (building.depth * 0.5 + 0.17));
    building.group.add(canopy, door);
    for (const x of [-3.6, 3.6]) {
      const post = campusMesh(new THREE.BoxGeometry(0.22, 2.65, 0.22), dark, `${label}-canopy-post`, zone);
      post.position.set(x, 1.94, front * (building.depth * 0.5 + 1.15));
      building.group.add(post);
    }
  };
  addEntrance(teachingA, "teaching", "school-teaching-a");
  addEntrance(teachingB, "teaching", "school-teaching-b");
  addEntrance(laboratory, "laboratory", "school-laboratory");
  addEntrance(administration, "administration", "school-administration");
  addEntrance(dormA, "dormitory", "school-dormitory-a");
  addEntrance(dormB, "dormitory", "school-dormitory-b");

  for (const [x, z, width, depth] of [
    [-48, 25.2, 18, 3.2],
    [-48, 5.2, 18, 3.2],
    [-9.5, 16.2, 13, 3.2],
    [-24, -33.4, 3.2, 6.8],
  ] as Array<[number, number, number, number]>) {
    const link = campusMesh(new THREE.BoxGeometry(width, 0.12, depth), paving, "school-campus-entrance-link");
    link.position.set(x, 0.49, z);
    campus.add(link);
  }

  // 24 representative classrooms, with desks sized for the 2.40 m rider reference.
  [teachingA, teachingB].forEach((building) => {
    building.levels.forEach((level) => {
      for (let room = 0; room < 3; room += 1) {
        const classroom = new THREE.Group();
        classroom.name = "school-classroom";
        classroom.userData.zone = "teaching";
        classroom.position.set(-11.8 + room * 11.8, level, 0);
        building.group.add(classroom);
        const board = campusMesh(new THREE.BoxGeometry(4.2, 1.35, 0.12), navy, "school-classroom-blackboard", "teaching");
        board.position.set(0, 1.75, -building.depth * 0.5 + 0.34);
        classroom.add(board);
        for (let row = 0; row < 2; row += 1) {
          for (let column = 0; column < 3; column += 1) {
            const desk = campusMesh(new THREE.BoxGeometry(1.25, 0.12, 0.55), timber, "school-classroom-student-desk", "teaching");
            desk.position.set(-2.2 + column * 2.2, 0.84, 0.2 + row * 2.15);
            classroom.add(desk);
          }
        }
      }
    });
  });

  laboratory.levels.slice(0, 4).forEach((level, floor) => {
    for (let room = 0; room < 3; room += 1) {
      const lab = new THREE.Group();
      lab.name = "school-laboratory-room";
      lab.userData.zone = "laboratory";
      lab.position.set(-7.5 + room * 7.5, level, 0);
      laboratory.group.add(lab);
      for (let benchIndex = 0; benchIndex < 2; benchIndex += 1) {
        const bench = campusMesh(new THREE.BoxGeometry(4.2, 0.22, 1.1), labTop, "school-laboratory-bench", "laboratory");
        bench.position.set(0, 0.92, -2.2 + benchIndex * 4.4);
        lab.add(bench);
        for (const x of [-1.3, 0, 1.3]) {
          const apparatus = campusMesh(new THREE.CylinderGeometry(0.18, 0.25, 0.48, 10), atriumGlass, "school-laboratory-apparatus", "laboratory");
          apparatus.position.set(x, 1.26, bench.position.z);
          lab.add(apparatus);
        }
      }
      lab.userData.discipline = ["physics", "chemistry", "biology"][room];
      lab.userData.floor = floor + 1;
    }
  });

  administration.levels.forEach((level) => {
    for (let office = 0; office < 4; office += 1) {
      const desk = campusMesh(new THREE.BoxGeometry(2.1, 0.16, 0.9), timber, "school-administration-office-desk", "administration");
      desk.position.set(-9 + office * 6, level + 0.82, 0.4);
      administration.group.add(desk);
    }
  });
  const clockFace = campusMesh(new THREE.CylinderGeometry(1.55, 1.55, 0.2, 32), ivory, "school-administration-clock", "administration");
  clockFace.rotation.x = Math.PI * 0.5;
  clockFace.position.set(0, administration.roofY + 2, 6.7);
  administration.group.add(clockFace);
  const clockHandA = campusMesh(new THREE.BoxGeometry(0.12, 1.05, 0.12), dark, "school-administration-clock-hand", "administration");
  clockHandA.position.set(0, administration.roofY + 2.15, 6.84);
  administration.group.add(clockHandA);

  [dormA, dormB].forEach((building) => {
    building.levels.forEach((level) => {
      for (let room = 0; room < 4; room += 1) {
        const dormRoom = new THREE.Group();
        dormRoom.name = "school-dorm-room";
        dormRoom.userData.zone = "dormitory";
        dormRoom.position.set(-building.width * 0.34 + room * building.width * 0.225, level, 0);
        building.group.add(dormRoom);
        for (const side of [-1, 1]) {
          const bed = campusMesh(new THREE.BoxGeometry(2.05, 0.42, 0.85), mattress, "school-dorm-bed", "dormitory");
          bed.position.set(side * 1.2, 0.66, -2.3);
          dormRoom.add(bed);
        }
        const desk = campusMesh(new THREE.BoxGeometry(2.7, 0.15, 0.72), timber, "school-dorm-study-desk", "dormitory");
        desk.position.set(0, 0.86, 2.4);
        dormRoom.add(desk);
      }
    });
  });

  // East athletic district: compact six-lane campus training oval, infield and spectator stand.
  const sports = new THREE.Group();
  sports.name = "school-sports-complex";
  sports.userData.zone = "sports";
  sports.position.set(38, 0, -25);
  campus.add(sports);
  const infield = campusMesh(new THREE.BoxGeometry(52, 0.14, 30), fieldGreen, "school-football-field", "sports");
  infield.position.y = 0.52;
  sports.add(infield);
  const track = campusMesh(new THREE.ShapeGeometry(stadiumShape(25, 16.5, 5.4), 16), trackRed, "school-running-track", "sports");
  track.rotation.x = -Math.PI * 0.5;
  track.position.y = 0.61;
  sports.add(track);
  for (let lane = 0; lane <= 6; lane += 1) {
    const curve = stadiumCurve(25, 16.5 + lane * 0.9, 0.66);
    const line = campusMesh(new THREE.TubeGeometry(curve, 110, 0.045, 5, true), whiteLine, "school-running-track-lane-line", "sports");
    sports.add(line);
  }
  const centerLine = campusMesh(new THREE.BoxGeometry(0.08, 0.035, 29), whiteLine, "school-football-field-line", "sports");
  centerLine.position.y = 0.62;
  sports.add(centerLine);
  const centerCircle = campusMesh(new THREE.TorusGeometry(4.3, 0.07, 5, 36), whiteLine, "school-football-center-circle", "sports");
  centerCircle.rotation.x = Math.PI * 0.5;
  centerCircle.position.y = 0.66;
  sports.add(centerCircle);
  for (const x of [-25, 25]) {
    const goal = new THREE.Group();
    goal.name = "school-football-goal";
    goal.position.set(x, 0.6, 0);
    sports.add(goal);
    for (const z of [-3.3, 3.3]) {
      const post = campusMesh(new THREE.CylinderGeometry(0.07, 0.07, 2.5, 8), whiteLine, "school-football-goal-post", "sports");
      post.position.set(0, 1.25, z);
      goal.add(post);
    }
    const bar = campusMesh(new THREE.CylinderGeometry(0.07, 0.07, 6.6, 8), whiteLine, "school-football-goal-bar", "sports");
    bar.rotation.x = Math.PI * 0.5;
    bar.position.set(0, 2.5, 0);
    goal.add(bar);
  }
  const stand = new THREE.Group();
  stand.name = "school-spectator-stand";
  stand.position.set(-3, 0, -28);
  sports.add(stand);
  for (let tier = 0; tier < 5; tier += 1) {
    const bench = campusMesh(new THREE.BoxGeometry(30, 0.48 + tier * 0.46, 1.05), concrete, "school-spectator-stand-tier", "sports");
    bench.position.set(0, (0.48 + tier * 0.46) * 0.5, tier * 0.95);
    stand.add(bench);
  }

  const addBasketballCourt = (x: number, z: number) => {
    const court = new THREE.Group();
    court.name = "school-basketball-court";
    court.userData.zone = "sports";
    court.position.set(x, 0, z);
    campus.add(court);
    const surface = campusMesh(new THREE.BoxGeometry(16, 0.13, 9.5), courtBlue, "school-basketball-court-surface", "sports");
    surface.position.y = 0.53;
    court.add(surface);
    for (const end of [-1, 1]) {
      const pole = campusMesh(new THREE.CylinderGeometry(0.1, 0.14, 3.2, 8), dark, "school-basketball-pole", "sports");
      pole.position.set(end * 6.8, 2.05, 0);
      const board = campusMesh(new THREE.BoxGeometry(0.18, 1.1, 1.8), ivory, "school-basketball-backboard", "sports");
      board.position.set(end * 7.2, 3.15, 0);
      const rim = campusMesh(new THREE.TorusGeometry(0.46, 0.055, 6, 20), trackRed, "school-basketball-rim", "sports");
      rim.rotation.y = Math.PI * 0.5;
      rim.position.set(end * 6.72, 2.9, 0);
      court.add(pole, board, rim);
    }
  };
  addBasketballCourt(22, 18);
  addBasketballCourt(40, 18);

  const addTennisCourt = (x: number, z: number) => {
    const court = new THREE.Group();
    court.name = "school-tennis-court";
    court.userData.zone = "sports";
    court.position.set(x, 0, z);
    campus.add(court);
    const surface = campusMesh(new THREE.BoxGeometry(18, 0.13, 9), tennisGreen, "school-tennis-court-surface", "sports");
    surface.position.y = 0.53;
    court.add(surface);
    const net = campusMesh(new THREE.BoxGeometry(0.08, 0.9, 8.4), atriumGlass, "school-tennis-net", "sports");
    net.position.y = 1.02;
    court.add(net);
    for (const xLine of [-8.2, 0, 8.2]) {
      const line = campusMesh(new THREE.BoxGeometry(0.07, 0.035, 8.2), whiteLine, "school-tennis-court-line", "sports");
      line.position.set(xLine, 0.62, 0);
      court.add(line);
    }
  };
  addTennisCourt(60, 18);
  addTennisCourt(60, 30);

  // Fully enclosed indoor natatorium with eight lanes and a removable glazed south facade.
  const natatorium = new THREE.Group();
  natatorium.name = "school-indoor-natatorium";
  natatorium.userData.zone = "natatorium";
  natatorium.userData.frontDirection = "+z";
  natatorium.position.set(52, 0, 47);
  campus.add(natatorium);
  const poolFoundation = campusMesh(new THREE.BoxGeometry(45, 0.45, 25), navy, "school-natatorium-foundation", "natatorium");
  poolFoundation.position.y = 0.62;
  const poolDeck = campusMesh(new THREE.BoxGeometry(43.8, 0.18, 23.8), ivory, "school-natatorium-pool-deck", "natatorium");
  poolDeck.position.y = 0.94;
  const poolWater = campusMesh(new THREE.BoxGeometry(31, 0.18, 14.4), poolBlue, "school-natatorium-pool-water", "natatorium");
  poolWater.position.set(-2, 1.08, 0);
  natatorium.add(poolFoundation, poolDeck, poolWater);
  for (let lane = 0; lane < 9; lane += 1) {
    const rope = campusMesh(new THREE.CylinderGeometry(0.055, 0.055, 30.5, 8), lane % 2 ? whiteLine : trackRed, "school-swimming-lane-rope", "natatorium");
    rope.rotation.z = Math.PI * 0.5;
    rope.position.set(-2, 1.22, -7.2 + lane * 1.8);
    natatorium.add(rope);
  }
  for (let lane = 0; lane < 8; lane += 1) {
    const block = campusMesh(new THREE.BoxGeometry(0.75, 0.45, 0.75), whiteLine, "school-swimming-starting-block", "natatorium");
    block.position.set(-16.2, 1.36, -6.3 + lane * 1.8);
    natatorium.add(block);
  }
  for (const x of [-22.3, 22.3]) {
    const wall = campusMesh(new THREE.BoxGeometry(0.38, 8.4, 25), brick, "school-natatorium-side-wall", "natatorium");
    wall.position.set(x, 5.1, 0);
    natatorium.add(wall);
    if (x > 0) {
      wall.userData.cutawayRole = "observation-side";
      cutawayShell.push(wall);
    }
  }
  const rearWall = campusMesh(new THREE.BoxGeometry(44.8, 8.4, 0.38), brick, "school-natatorium-rear-wall", "natatorium");
  rearWall.position.set(0, 5.1, -12.3);
  natatorium.add(rearWall);
  for (const side of [-1, 1]) {
    const glassFront = campusMesh(new THREE.BoxGeometry(19.6, 6.4, 0.22), atriumGlass, "school-natatorium-glass-facade", "natatorium");
    glassFront.position.set(side * 12.3, 4.15, 12.3);
    natatorium.add(glassFront);
    cutawayShell.push(glassFront);
  }
  for (const side of [-1, 1]) {
    const entranceDoor = campusMesh(new THREE.BoxGeometry(2.25, 3.1, 0.18), atriumGlass, "school-natatorium-entrance-door", "natatorium");
    entranceDoor.position.set(side * 1.18, 2.35, 12.42);
    natatorium.add(entranceDoor);
  }
  const natatoriumCanopy = campusMesh(new THREE.BoxGeometry(8, 0.28, 2.4), navy, "school-natatorium-entrance-canopy", "natatorium");
  natatoriumCanopy.position.set(0, 4.3, 13.35);
  natatorium.add(natatoriumCanopy);
  const natatoriumPath = campusMesh(new THREE.BoxGeometry(8, 0.12, 2.6), paving, "school-natatorium-entrance-link", "natatorium");
  natatoriumPath.position.set(52, 0.5, 60.7);
  campus.add(natatoriumPath);
  for (let frame = -5; frame <= 5; frame += 1) {
    if (frame === 0) continue;
    const mullion = campusMesh(new THREE.BoxGeometry(0.18, 6.5, 0.28), navy, "school-natatorium-glass-frame", "natatorium");
    mullion.position.set(frame * 4.05, 4.15, 12.4);
    natatorium.add(mullion);
    cutawayShell.push(mullion);
  }
  const roof = campusMesh(new THREE.BoxGeometry(45.2, 0.35, 25.2), navy, "school-natatorium-roof", "natatorium");
  roof.position.y = 9.35;
  natatorium.add(roof);
  cutawayShell.push(roof);
  for (let truss = -4; truss <= 4; truss += 1) {
    const beam = campusMesh(new THREE.BoxGeometry(0.22, 0.32, 24.5), dark, "school-natatorium-roof-truss", "natatorium");
    beam.position.set(truss * 5, 9.05, 0);
    natatorium.add(beam);
  }

  const treePositions: Array<[number, number]> = [
    [-78, 50], [-66, 50], [-52, 50], [-38, 50], [-20, 53], [18, 54], [34, 55], [73, 51],
    [-80, 28], [-80, 8], [-80, -14], [-80, -36], [-78, -56], [-48, -56], [-12, -56], [16, -57],
    [76, -53], [81, -28], [81, -4], [80, 17], [-36, 31], [-22, 28], [-4, 22], [10, 24],
  ];
  treePositions.forEach(([x, z]) => {
    const anchor = new THREE.Group();
    anchor.name = "school-campus-reused-tree-anchor";
    anchor.position.set(x, 0.48, z);
    anchor.userData.sourceModel = "/models/forest/tree_normal_medium_redwood_a.glb";
    campus.add(anchor);
  });

  const lightPositions: Array<[number, number]> = [
    [-10, 51], [10, 51], [-18, 32], [-3, 28], [-42, 30], [-42, 8], [-42, -17], [-45, -31],
    [-10, -27], [15, 7], [24, 30], [42, 8], [67, 8], [77, -5], [77, -42], [16, -53],
  ];
  lightPositions.forEach(([x, z]) => {
    const light = buildLowPolyStreetLight();
    light.position.set(x, 0.48, z);
    light.scale.setScalar(1.08);
    light.traverse((object) => { if (object instanceof THREE.Light) nightLights.push(object); });
    campus.add(light);
  });
  for (const [x, z] of [[-14, 48], [14, 48], [-8, 29], [8, 29], [-38, 28], [-38, -24], [17, 27], [70, 42]] as Array<[number, number]>) {
    const planter = buildLowPolyRoadsidePlanter();
    planter.position.set(x, 0.48, z);
    planter.scale.setScalar(1.15);
    campus.add(planter);
  }

  campus.userData = {
    modelType: "school-campus",
    generatedLocally: true,
    zones: ["teaching", "laboratory", "administration", "dormitory", "sports", "natatorium"],
    buildingCount: 7,
    teachingBuildingCount: 2,
    classroomCount: 24,
    laboratoryCount: 12,
    dormitoryCount: 2,
    dormRoomCount: 48,
    runningTrackLanes: 6,
    basketballCourtCount: 2,
    tennisCourtCount: 2,
    swimmingLaneCount: 8,
    treeAnchorCount: treePositions.length,
    streetLightCount: lightPositions.length,
    planterCount: 8,
    fenceSegmentCount: 5,
    scaleReferenceLengthMeters: 2.4,
    scaleStandard: "rabbit-rider",
    decorationSources: [
      "/models/forest/tree_normal_medium_redwood_a.glb",
      "city-street-light-lowpoly",
      "city-roadside-planter-lowpoly",
    ],
    siteSize: new THREE.Vector3(170, 22, 130),
    runningTrackLengthMeters: 238,
    setMainGateOpen: (open) => {
      mainGatePanels.forEach((panel) => {
        panel.position.x = open ? panel.userData.openX as number : panel.userData.closedX as number;
        panel.userData.open = open;
      });
    },
    setInteriorCutaway: (cutaway) => {
      cutawayShell.forEach((object) => { object.visible = !cutaway; });
    },
    setPowered: (powered) => {
      windowGlass.emissiveIntensity = powered ? 1.15 : 0.12;
      atriumGlass.emissiveIntensity = powered ? 0.82 : 0.1;
      warmLight.emissiveIntensity = powered ? 2.5 : 0.12;
      poolBlue.emissiveIntensity = powered ? 0.75 : 0.14;
      nightLights.forEach((light) => { light.intensity = powered ? 1.65 : 0; });
    },
  };
  campus.userData.setPowered(false);
  campus.userData.setInteriorCutaway(false);
  campus.userData.setMainGateOpen(true);
  return campus;
}
