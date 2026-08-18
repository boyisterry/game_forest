import * as THREE from "three";

export type HospitalZone = "outpatient" | "emergency" | "inpatient";

export type HospitalCampusModel = THREE.Group & {
  userData: {
    modelType: "hospital-campus";
    generatedLocally: true;
    zones: HospitalZone[];
    buildingCount: number;
    floorCounts: Record<HospitalZone, number>;
    consultRoomCount: number;
    emergencyBayCount: number;
    inpatientRoomCount: number;
    inpatientBedCount: number;
    elevatorCount: number;
    internalRoadCount: number;
    pedestrianWalkwayCount: number;
    coveredWalkwayCount: number;
    raisedCrossingCount: number;
    siteSize: THREE.Vector3;
    setInteriorCutaway: (cutaway: boolean) => void;
    setPowered: (powered: boolean) => void;
  };
};

function hospitalMesh<T extends THREE.BufferGeometry>(geometry: T, material: THREE.Material, name: string, zone?: HospitalZone) {
  const object = new THREE.Mesh(geometry, material);
  object.name = name;
  object.castShadow = true;
  object.receiveShadow = true;
  if (zone) object.userData.zone = zone;
  return object;
}

function beamBetween(start: THREE.Vector3, end: THREE.Vector3, radius: number, material: THREE.Material, name: string, zone?: HospitalZone) {
  const direction = end.clone().sub(start);
  const object = hospitalMesh(new THREE.CylinderGeometry(radius, radius, direction.length(), 8), material, name, zone);
  object.position.copy(start).add(end).multiplyScalar(0.5);
  object.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  return object;
}

export function buildLowPolyHospitalCampus(): HospitalCampusModel {
  const campus = new THREE.Group() as HospitalCampusModel;
  campus.name = "city-hospital-campus-lowpoly";
  const cutawayShell: THREE.Object3D[] = [];

  const white = new THREE.MeshStandardMaterial({ color: 0xe9e8e1, roughness: 0.86 });
  const pale = new THREE.MeshStandardMaterial({ color: 0xf4f1e8, roughness: 0.84 });
  const stone = new THREE.MeshStandardMaterial({ color: 0x898d8b, roughness: 0.94 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x354044, roughness: 0.68, metalness: 0.22 });
  const outpatientAccent = new THREE.MeshStandardMaterial({ color: 0x3d8b88, roughness: 0.7, metalness: 0.12 });
  const emergencyAccent = new THREE.MeshStandardMaterial({ color: 0xc94f43, roughness: 0.72, metalness: 0.1 });
  const inpatientAccent = new THREE.MeshStandardMaterial({ color: 0x527b9c, roughness: 0.7, metalness: 0.12 });
  const timber = new THREE.MeshStandardMaterial({ color: 0x9a7455, roughness: 0.86 });
  const green = new THREE.MeshStandardMaterial({ color: 0x47764d, roughness: 0.94 });
  const fabricBlue = new THREE.MeshStandardMaterial({ color: 0x668ca5, roughness: 0.97 });
  const fabricGreen = new THREE.MeshStandardMaterial({ color: 0x6c8b72, roughness: 0.97 });
  const porcelain = new THREE.MeshStandardMaterial({ color: 0xe8ebe7, roughness: 0.5 });
  const medicalMetal = new THREE.MeshStandardMaterial({ color: 0xb8c2c3, roughness: 0.42, metalness: 0.44 });
  const screenMaterial = new THREE.MeshStandardMaterial({
    color: 0x334b57,
    emissive: 0x2d9ec0,
    emissiveIntensity: 0.28,
    roughness: 0.32,
  });
  // Windows are solid glazed surfaces. The former transparent planes made the
  // unbuilt front wall read as empty holes from several camera angles.
  const windowGlass = new THREE.MeshStandardMaterial({
    color: 0x72a8b6,
    emissive: 0x183945,
    emissiveIntensity: 0.08,
    roughness: 0.26,
    metalness: 0.16,
  });
  const interiorGlass = new THREE.MeshStandardMaterial({
    color: 0x8eb7bf,
    emissive: 0x183945,
    emissiveIntensity: 0.08,
    roughness: 0.3,
    transparent: true,
    opacity: 0.34,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const warmLight = new THREE.MeshStandardMaterial({
    color: 0xffdfaa,
    emissive: 0xffaa42,
    emissiveIntensity: 0.16,
    roughness: 0.32,
  });
  const road = new THREE.MeshStandardMaterial({ color: 0x555e60, roughness: 0.98 });
  const walkway = new THREE.MeshStandardMaterial({ color: 0xc8c6ba, roughness: 0.94 });
  const helipad = new THREE.MeshStandardMaterial({ color: 0x596568, roughness: 0.92 });

  const site = hospitalMesh(new THREE.BoxGeometry(80, 0.28, 62), stone, "hospital-campus-site-base");
  site.position.y = 0.14;
  campus.add(site);

  const roads = [
    { size: [76, 6] as const, position: [0, 22] as const, name: "hospital-campus-main-access-road" },
    { size: [5, 36] as const, position: [35.5, 5] as const, name: "hospital-campus-emergency-road" },
    { size: [28, 3.6] as const, position: [0, -29] as const, name: "hospital-campus-ward-service-road" },
    { size: [25, 4.5] as const, position: [-22, 17.5] as const, name: "hospital-campus-outpatient-dropoff-road" },
  ];
  roads.forEach(({ size, position, name }) => {
    const lane = hospitalMesh(new THREE.BoxGeometry(size[0], 0.08, size[1]), road, "hospital-campus-internal-road");
    lane.userData.routeName = name;
    lane.position.set(position[0], 0.34, position[1]);
    campus.add(lane);
  });

  const walkways = [
    { size: [19, 7.5] as const, position: [0, 7.5] as const },
    { size: [13, 2.4] as const, position: [-15.75, 12.5] as const },
    { size: [13, 2.4] as const, position: [15.5, 13.5] as const },
    { size: [3.4, 14] as const, position: [0, -3] as const },
    { size: [17, 2.4] as const, position: [0, -9.2] as const },
  ];
  walkways.forEach(({ size, position }) => {
    const path = hospitalMesh(new THREE.BoxGeometry(size[0], 0.11, size[1]), walkway, "hospital-campus-pedestrian-walkway");
    path.position.set(position[0], 0.39, position[1]);
    campus.add(path);
  });

  const outpatientCrossingApproach = hospitalMesh(new THREE.BoxGeometry(3.2, 0.11, 1.55), walkway, "hospital-campus-crossing-approach");
  outpatientCrossingApproach.position.set(-22, 0.39, 14.475);
  const outpatientRaisedCrossing = hospitalMesh(new THREE.BoxGeometry(3.2, 0.12, 4.5), walkway, "hospital-campus-raised-crossing");
  outpatientRaisedCrossing.position.set(-22, 0.43, 17.5);
  outpatientRaisedCrossing.userData.routeName = "hospital-campus-outpatient-dropoff-crossing";
  campus.add(outpatientCrossingApproach, outpatientRaisedCrossing);
  for (let stripe = -1; stripe <= 1; stripe += 1) {
    const marking = hospitalMesh(new THREE.BoxGeometry(2.65, 0.025, 0.42), pale, "hospital-campus-crossing-marking");
    marking.position.set(-22, 0.505, 17.5 + stripe * 1.05);
    campus.add(marking);
  }

  const addCoveredWalkway = (width: number, depth: number, x: number, z: number, alongX: boolean) => {
    const roof = hospitalMesh(new THREE.BoxGeometry(width, 0.14, depth), pale, "hospital-campus-covered-walkway");
    roof.position.set(x, 2.48, z);
    campus.add(roof);
    const span = alongX ? width : depth;
    const count = Math.max(2, Math.floor(span / 3));
    for (let index = 0; index <= count; index += 1) {
      const offset = -span * 0.5 + index * span / count;
      for (const side of [-1, 1]) {
        const post = hospitalMesh(new THREE.BoxGeometry(0.12, 2.1, 0.12), dark, "hospital-campus-covered-walkway-post");
        post.position.set(alongX ? x + offset : x + side * width * 0.42, 1.42, alongX ? z + side * depth * 0.38 : z + offset);
        campus.add(post);
      }
    }
  };
  addCoveredWalkway(12.5, 2.2, -15.75, 12.5, true);
  addCoveredWalkway(12.5, 2.2, 15.5, 13.5, true);
  addCoveredWalkway(3, 12.5, 0, -3, false);

  const addBuilding = ({
    zone,
    name,
    position,
    width,
    depth,
    floors,
    accent,
  }: {
    zone: HospitalZone;
    name: string;
    position: [number, number];
    width: number;
    depth: number;
    floors: number;
    accent: THREE.Material;
  }) => {
    const buildingScale = 1.55;
    const building = new THREE.Group();
    building.name = name;
    building.userData.zone = zone;
    building.position.set(position[0], 0.28 - 0.28 * buildingScale, position[1]);
    building.scale.setScalar(buildingScale);
    building.userData.architecturalScale = buildingScale;
    campus.add(building);

    const pitch = 2.18;
    const levels = Array.from({ length: floors }, (_, index) => 0.48 + index * pitch);
    const height = floors * pitch + 0.28;
    const centerY = 0.4 + height * 0.5;
    const foundation = hospitalMesh(new THREE.BoxGeometry(width + 0.7, 0.28, depth + 0.7), dark, "hospital-zone-foundation", zone);
    foundation.position.y = 0.42;
    const rearWall = hospitalMesh(new THREE.BoxGeometry(width, height, 0.22), white, "hospital-zone-rear-wall", zone);
    rearWall.position.set(0, centerY, -depth * 0.5);
    const leftWall = hospitalMesh(new THREE.BoxGeometry(0.22, height, depth), white, "hospital-zone-side-wall", zone);
    leftWall.position.set(-width * 0.5, centerY, 0);
    const rightWall = hospitalMesh(new THREE.BoxGeometry(0.22, height, depth), white, "hospital-zone-side-wall", zone);
    rightWall.position.set(width * 0.5, centerY, 0);
    building.add(foundation, rearWall, leftWall, rightWall);

    const bayCount = Math.max(4, Math.floor(width / 2.45));
    const bayWidth = (width - 0.8) / bayCount;
    levels.forEach((level) => {
      const slab = hospitalMesh(new THREE.BoxGeometry(width - 0.35, 0.14, depth - 0.35), pale, "hospital-zone-floor-slab", zone);
      slab.position.y = level;
      building.add(slab);

      // The sill + head + piers form a continuous front facade. Windows sit on
      // top of that facade instead of floating over a completely open elevation.
      const sill = hospitalMesh(new THREE.BoxGeometry(width, 0.4, 0.24), accent, "hospital-zone-front-sill", zone);
      sill.position.set(0, level + 0.75, depth * 0.5);
      const head = hospitalMesh(new THREE.BoxGeometry(width, 0.74, 0.24), white, "hospital-zone-front-head", zone);
      head.position.set(0, level + 2.22, depth * 0.5);
      building.add(sill, head);
      cutawayShell.push(sill, head);

      for (let bay = 0; bay < bayCount; bay += 1) {
        const x = -width * 0.5 + 0.4 + bayWidth * (bay + 0.5);
        const pane = hospitalMesh(new THREE.BoxGeometry(bayWidth - 0.26, 0.9, 0.1), windowGlass, "hospital-zone-window", zone);
        pane.position.set(x, level + 1.4, depth * 0.5 + 0.13);
        building.add(pane);
        cutawayShell.push(pane);
      }
      for (let pier = 0; pier <= bayCount; pier += 1) {
        const x = -width * 0.5 + 0.4 + pier * bayWidth;
        const frame = hospitalMesh(new THREE.BoxGeometry(0.26, 0.9, 0.25), white, "hospital-zone-window-frame", zone);
        frame.position.set(x, level + 1.4, depth * 0.5 + 0.01);
        building.add(frame);
        cutawayShell.push(frame);
      }
      for (const x of [-width * 0.3, 0, width * 0.3]) {
        const ceilingLight = hospitalMesh(new THREE.BoxGeometry(1.2, 0.04, 0.32), warmLight, "hospital-interior-ceiling-light", zone);
        ceilingLight.position.set(x, level + 1.98, 0);
        building.add(ceilingLight);
      }
    });
    const roof = hospitalMesh(new THREE.BoxGeometry(width + 0.2, 0.22, depth + 0.2), dark, "hospital-zone-flat-roof", zone);
    roof.position.y = 0.54 + floors * pitch;
    building.add(roof);
    return { building, levels, roofY: roof.position.y, width, depth };
  };

  const outpatient = addBuilding({
    zone: "outpatient",
    name: "hospital-outpatient-building",
    position: [-22, 5],
    width: 15,
    depth: 11,
    floors: 3,
    accent: outpatientAccent,
  });
  const emergency = addBuilding({
    zone: "emergency",
    name: "hospital-emergency-building",
    position: [22, 6],
    width: 13,
    depth: 10,
    floors: 2,
    accent: emergencyAccent,
  });
  const inpatient = addBuilding({
    zone: "inpatient",
    name: "hospital-inpatient-building",
    position: [0, -17],
    width: 16,
    depth: 12,
    floors: 6,
    accent: inpatientAccent,
  });

  const mainCanopy = hospitalMesh(new THREE.BoxGeometry(8.6, 0.22, 2.5), outpatientAccent, "hospital-main-entrance-canopy", "outpatient");
  mainCanopy.position.set(0, 3.05, 6.2);
  const mainDoorLeft = hospitalMesh(new THREE.BoxGeometry(1.65, 2.15, 0.12), windowGlass, "hospital-main-entrance-door", "outpatient");
  mainDoorLeft.position.set(-0.9, 1.58, 5.58);
  const mainDoorRight = hospitalMesh(new THREE.BoxGeometry(1.65, 2.15, 0.12), windowGlass, "hospital-main-entrance-door", "outpatient");
  mainDoorRight.position.set(0.9, 1.58, 5.58);
  outpatient.building.add(mainCanopy, mainDoorLeft, mainDoorRight);
  cutawayShell.push(mainDoorLeft, mainDoorRight);
  for (const x of [-3.7, 3.7]) {
    const post = hospitalMesh(new THREE.BoxGeometry(0.18, 2.58, 0.18), dark, "hospital-main-canopy-post", "outpatient");
    post.position.set(x, 1.72, 7.1);
    outpatient.building.add(post);
  }

  const emergencyCanopy = hospitalMesh(new THREE.BoxGeometry(9.2, 0.24, 3), emergencyAccent, "hospital-emergency-entrance-canopy", "emergency");
  emergencyCanopy.position.set(0, 3, 6.1);
  const emergencyDoor = hospitalMesh(new THREE.BoxGeometry(3.4, 2.22, 0.12), windowGlass, "hospital-emergency-entrance-door", "emergency");
  emergencyDoor.position.set(0, 1.62, 5.08);
  emergency.building.add(emergencyCanopy, emergencyDoor);
  cutawayShell.push(emergencyDoor);
  for (const x of [-4, 4]) {
    const post = hospitalMesh(new THREE.BoxGeometry(0.2, 2.52, 0.2), emergencyAccent, "hospital-emergency-canopy-post", "emergency");
    post.position.set(x, 1.7, 7.05);
    emergency.building.add(post);
  }
  const crossVertical = hospitalMesh(new THREE.BoxGeometry(0.52, 2.1, 0.14), emergencyAccent, "hospital-emergency-cross-sign", "emergency");
  crossVertical.position.set(5.3, 4.52, 5.12);
  const crossHorizontal = hospitalMesh(new THREE.BoxGeometry(1.65, 0.52, 0.14), emergencyAccent, "hospital-emergency-cross-sign", "emergency");
  crossHorizontal.position.copy(crossVertical.position);
  emergency.building.add(crossVertical, crossHorizontal);

  const inpatientCanopy = hospitalMesh(new THREE.BoxGeometry(6.8, 0.2, 2.1), inpatientAccent, "hospital-inpatient-entrance-canopy", "inpatient");
  inpatientCanopy.position.set(0, 2.75, 7.0);
  const inpatientDoor = hospitalMesh(new THREE.BoxGeometry(3, 2.1, 0.12), windowGlass, "hospital-inpatient-entrance-door", "inpatient");
  inpatientDoor.position.set(0, 1.52, 6.08);
  inpatient.building.add(inpatientCanopy, inpatientDoor);
  cutawayShell.push(inpatientDoor);

  const registration = hospitalMesh(new THREE.BoxGeometry(4.8, 0.86, 0.78), outpatientAccent, "hospital-outpatient-registration-desk", "outpatient");
  registration.position.set(1.6, 1, 3.1);
  outpatient.building.add(registration);
  for (let row = 0; row < 3; row += 1) {
    for (let column = 0; column < 4; column += 1) {
      const chair = hospitalMesh(new THREE.BoxGeometry(0.55, 0.68, 0.58), fabricBlue, "hospital-outpatient-waiting-chair", "outpatient");
      chair.position.set(-5.4 + column * 1.2, 0.83, 3.2 - row * 1.15);
      outpatient.building.add(chair);
    }
  }
  for (let room = 0; room < 6; room += 1) {
    const floorIndex = room < 3 ? 0 : 1;
    const roomIndex = room % 3;
    const level = outpatient.levels[floorIndex];
    const x = -4.5 + roomIndex * 4.5;
    const partition = hospitalMesh(new THREE.BoxGeometry(3.8, 1.62, 0.06), interiorGlass, "hospital-outpatient-consult-room", "outpatient");
    partition.position.set(x, level + 0.88, -1.85);
    const desk = hospitalMesh(new THREE.BoxGeometry(1.25, 0.1, 0.58), timber, "hospital-outpatient-consult-desk", "outpatient");
    desk.position.set(x - 0.65, level + 0.77, -3.0);
    const couch = hospitalMesh(new THREE.BoxGeometry(1.78, 0.58, 0.7), porcelain, "hospital-outpatient-exam-couch", "outpatient");
    couch.position.set(x + 0.55, level + 0.78, -3.75);
    outpatient.building.add(partition, desk, couch);
  }
  const pharmacyCounter = hospitalMesh(new THREE.BoxGeometry(4.5, 1, 0.7), outpatientAccent, "hospital-outpatient-pharmacy-counter", "outpatient");
  pharmacyCounter.position.set(3.5, 1.05, -4.1);
  outpatient.building.add(pharmacyCounter);
  for (let shelf = 0; shelf < 3; shelf += 1) {
    const pharmacyShelf = hospitalMesh(new THREE.BoxGeometry(4, 0.12, 0.42), pale, "hospital-outpatient-pharmacy-shelf", "outpatient");
    pharmacyShelf.position.set(3.5, 1.1 + shelf * 0.48, -4.72);
    outpatient.building.add(pharmacyShelf);
  }

  const triageDesk = hospitalMesh(new THREE.BoxGeometry(3.6, 0.88, 0.78), emergencyAccent, "hospital-emergency-triage-desk", "emergency");
  triageDesk.position.set(0, 1, 3.25);
  emergency.building.add(triageDesk);
  for (let bay = 0; bay < 3; bay += 1) {
    const bayX = -4.1 + bay * 4.1;
    const curtainRail = hospitalMesh(new THREE.TorusGeometry(1.25, 0.035, 5, 16, Math.PI), medicalMetal, "hospital-emergency-curtain-rail", "emergency");
    curtainRail.rotation.x = Math.PI * 0.5;
    curtainRail.position.set(bayX, 2.05, 0.4);
    const bed = hospitalMesh(new THREE.BoxGeometry(1.9, 0.62, 0.82), porcelain, "hospital-emergency-treatment-bed", "emergency");
    bed.position.set(bayX, 0.82, 0.4);
    const monitor = hospitalMesh(new THREE.BoxGeometry(0.48, 0.42, 0.12), screenMaterial, "hospital-emergency-monitor", "emergency");
    monitor.position.set(bayX + 1.08, 1.32, 0.3);
    emergency.building.add(curtainRail, bed, monitor);
  }
  const resusBed = hospitalMesh(new THREE.BoxGeometry(2.15, 0.68, 0.9), porcelain, "hospital-emergency-resus-bed", "emergency");
  resusBed.position.set(-3.1, 0.85, -2.7);
  const resusBoom = beamBetween(new THREE.Vector3(-3.1, 1.2, -2.7), new THREE.Vector3(-3.1, 2.05, -2.7), 0.05, medicalMetal, "hospital-emergency-resus-boom", "emergency");
  const scannerRing = hospitalMesh(new THREE.TorusGeometry(1.05, 0.28, 8, 20), medicalMetal, "hospital-emergency-imaging-scanner", "emergency");
  scannerRing.position.set(3.3, 1.36, -3);
  const scannerBed = hospitalMesh(new THREE.BoxGeometry(2.4, 0.42, 0.64), porcelain, "hospital-emergency-imaging-bed", "emergency");
  scannerBed.position.set(3.3, 0.7, -1.9);
  emergency.building.add(resusBed, resusBoom, scannerRing, scannerBed);

  const ambulance = new THREE.Group();
  ambulance.name = "hospital-emergency-ambulance";
  const ambulanceBody = hospitalMesh(new THREE.BoxGeometry(4.3, 1.6, 1.9), pale, "hospital-ambulance-body", "emergency");
  ambulanceBody.position.set(0, 1.32, 0);
  const ambulanceCab = hospitalMesh(new THREE.BoxGeometry(1.55, 1.35, 1.9), pale, "hospital-ambulance-cab", "emergency");
  ambulanceCab.position.set(2.55, 1.15, 0);
  const ambulanceStripe = hospitalMesh(new THREE.BoxGeometry(5.3, 0.3, 0.06), emergencyAccent, "hospital-ambulance-stripe", "emergency");
  ambulanceStripe.position.set(0.45, 1.35, 0.98);
  ambulance.add(ambulanceBody, ambulanceCab, ambulanceStripe);
  for (const x of [-1.45, 2.4]) {
    for (const z of [-1, 1]) {
      const wheel = hospitalMesh(new THREE.CylinderGeometry(0.48, 0.48, 0.24, 10), dark, "hospital-ambulance-wheel", "emergency");
      wheel.rotation.x = Math.PI * 0.5;
      wheel.position.set(x, 0.52, z * 0.94);
      ambulance.add(wheel);
    }
  }
  // Dedicated side parking bay: the vehicle sits parallel to the emergency
  // service lane, clear of the entrance canopy and ready to depart south-to-north.
  const ambulanceBay = new THREE.Group();
  ambulanceBay.name = "hospital-emergency-ambulance-bay";
  const baySideGeometry = new THREE.BoxGeometry(0.12, 0.035, 7.2);
  for (const x of [33.85, 37.15]) {
    const sideLine = hospitalMesh(baySideGeometry, pale, "hospital-ambulance-bay-line", "emergency");
    sideLine.position.set(x, 0.405, 5.3);
    ambulanceBay.add(sideLine);
  }
  for (const z of [1.7, 8.9]) {
    const endLine = hospitalMesh(new THREE.BoxGeometry(3.4, 0.035, 0.12), pale, "hospital-ambulance-bay-line", "emergency");
    endLine.position.set(35.5, 0.405, z);
    ambulanceBay.add(endLine);
  }
  const bayCrossVertical = hospitalMesh(new THREE.BoxGeometry(0.42, 0.04, 1.8), emergencyAccent, "hospital-ambulance-bay-cross", "emergency");
  bayCrossVertical.position.set(35.5, 0.43, 5.3);
  const bayCrossHorizontal = hospitalMesh(new THREE.BoxGeometry(1.45, 0.04, 0.42), emergencyAccent, "hospital-ambulance-bay-cross", "emergency");
  bayCrossHorizontal.position.copy(bayCrossVertical.position);
  ambulanceBay.add(bayCrossVertical, bayCrossHorizontal);
  ambulance.position.set(35.5, 0.34, 5.3);
  ambulance.rotation.y = -Math.PI * 0.5;
  campus.add(ambulanceBay, ambulance);

  for (let floor = 0; floor < 6; floor += 1) {
    const level = inpatient.levels[floor];
    const station = hospitalMesh(new THREE.BoxGeometry(3.2, 0.82, 0.92), inpatientAccent, "hospital-inpatient-nurse-station", "inpatient");
    station.position.set(0, level + 0.78, 3.2);
    inpatient.building.add(station);
    for (const side of [-1, 1]) {
      const roomX = side * 4.5;
      const roomFloor = hospitalMesh(new THREE.BoxGeometry(5, 0.04, 4.1), fabricGreen, "hospital-inpatient-room-floor", "inpatient");
      roomFloor.position.set(roomX, level + 0.1, -1.7);
      const roomWall = hospitalMesh(new THREE.BoxGeometry(0.06, 1.78, 4.1), interiorGlass, "hospital-inpatient-room-partition", "inpatient");
      roomWall.position.set(side * 1.8, level + 0.98, -1.7);
      const bed = hospitalMesh(new THREE.BoxGeometry(2.05, 0.62, 0.88), porcelain, "hospital-inpatient-bed", "inpatient");
      bed.position.set(roomX, level + 0.78, -1.9);
      const headboard = hospitalMesh(new THREE.BoxGeometry(0.18, 0.85, 1.05), inpatientAccent, "hospital-inpatient-bed-headboard", "inpatient");
      headboard.position.set(roomX, level + 1.05, -2.95);
      const bedside = hospitalMesh(new THREE.BoxGeometry(0.52, 0.64, 0.52), timber, "hospital-inpatient-bedside-cabinet", "inpatient");
      bedside.position.set(roomX + side * 1.18, level + 0.63, -2.25);
      inpatient.building.add(roomFloor, roomWall, bed, headboard, bedside);
    }
    for (const x of [-0.72, 0.72]) {
      const door = hospitalMesh(new THREE.BoxGeometry(1.05, 1.45, 0.06), medicalMetal, "hospital-inpatient-elevator-door", "inpatient");
      door.position.set(x, level + 0.78, 4.85);
      const indicator = hospitalMesh(new THREE.BoxGeometry(0.22, 0.16, 0.04), warmLight, "hospital-inpatient-elevator-indicator", "inpatient");
      indicator.position.set(x, level + 1.62, 4.89);
      inpatient.building.add(door, indicator);
    }
  }
  for (const x of [-0.72, 0.72]) {
    const cabin = new THREE.Group();
    cabin.name = "hospital-inpatient-elevator-cabin";
    cabin.position.set(x, inpatient.levels[0], 4.05);
    const cabinFloor = hospitalMesh(new THREE.BoxGeometry(1.12, 0.1, 1.42), medicalMetal, "hospital-inpatient-elevator-cabin-floor", "inpatient");
    const cabinRoof = hospitalMesh(new THREE.BoxGeometry(1.12, 0.1, 1.42), medicalMetal, "hospital-inpatient-elevator-cabin-roof", "inpatient");
    cabinRoof.position.y = 1.55;
    const cabinBack = hospitalMesh(new THREE.BoxGeometry(1.12, 1.5, 0.08), inpatientAccent, "hospital-inpatient-elevator-cabin-wall", "inpatient");
    cabinBack.position.set(0, 0.78, -0.67);
    const cabinDoor = hospitalMesh(new THREE.BoxGeometry(1.02, 1.45, 0.06), interiorGlass, "hospital-inpatient-elevator-cabin-door", "inpatient");
    cabinDoor.position.set(0, 0.76, 0.72);
    cabin.add(cabinFloor, cabinRoof, cabinBack, cabinDoor);
    for (const side of [-1, 1]) {
      const wall = hospitalMesh(new THREE.BoxGeometry(0.08, 1.5, 1.34), inpatientAccent, "hospital-inpatient-elevator-cabin-wall", "inpatient");
      wall.position.set(side * 0.52, 0.78, 0);
      cabin.add(wall);
    }
    inpatient.building.add(cabin);
  }
  const inpatientStair = new THREE.Group();
  inpatientStair.name = "hospital-inpatient-emergency-stair";
  for (let storey = 0; storey < 5; storey += 1) {
    const baseY = inpatient.levels[storey];
    const halfRise = 2.18 * 0.5;
    const frontZ = 3.4;
    const rearZ = 0.28;
    for (let step = 0; step < 7; step += 1) {
      const progress = (step + 1) / 7;
      const first = hospitalMesh(new THREE.BoxGeometry(0.92, halfRise / 7, 0.46), stone, "hospital-inpatient-stair-step", "inpatient");
      first.position.set(5.72, baseY + halfRise * progress - halfRise / 14, frontZ + (rearZ - frontZ) * (step + 0.5) / 7);
      const second = hospitalMesh(new THREE.BoxGeometry(0.92, halfRise / 7, 0.46), stone, "hospital-inpatient-stair-step", "inpatient");
      second.position.set(6.68, baseY + halfRise + halfRise * progress - halfRise / 14, rearZ + (frontZ - rearZ) * (step + 0.5) / 7);
      inpatientStair.add(first, second);
    }
    const landing = hospitalMesh(new THREE.BoxGeometry(1.9, 0.14, 0.72), stone, "hospital-inpatient-stair-landing", "inpatient");
    landing.position.set(6.2, baseY + halfRise - 0.07, rearZ);
    inpatientStair.add(landing);
    inpatientStair.add(
      beamBetween(new THREE.Vector3(5.22, baseY + 0.72, frontZ), new THREE.Vector3(5.22, baseY + halfRise + 0.72, rearZ), 0.035, medicalMetal, "hospital-inpatient-stair-handrail", "inpatient"),
      beamBetween(new THREE.Vector3(7.18, baseY + halfRise + 0.72, rearZ), new THREE.Vector3(7.18, baseY + 2.18 + 0.72, frontZ), 0.035, medicalMetal, "hospital-inpatient-stair-handrail", "inpatient"),
    );
  }
  inpatient.building.add(inpatientStair);

  const helipadDisc = hospitalMesh(new THREE.CylinderGeometry(4.6, 4.6, 0.18, 28), helipad, "hospital-roof-helipad", "inpatient");
  helipadDisc.position.set(0, inpatient.roofY + 0.18, 0);
  const helipadH1 = hospitalMesh(new THREE.BoxGeometry(0.5, 0.08, 2.5), pale, "hospital-roof-helipad-marking", "inpatient");
  helipadH1.position.set(-0.9, inpatient.roofY + 0.31, 0);
  const helipadH2 = helipadH1.clone();
  helipadH2.position.x = 0.9;
  const helipadH3 = hospitalMesh(new THREE.BoxGeometry(2.3, 0.08, 0.5), pale, "hospital-roof-helipad-marking", "inpatient");
  helipadH3.position.set(0, inpatient.roofY + 0.31, 0);
  inpatient.building.add(helipadDisc, helipadH1, helipadH2, helipadH3);
  const helipadSafetyNet = hospitalMesh(new THREE.TorusGeometry(5.15, 0.28, 6, 36), medicalMetal, "hospital-roof-helipad-safety-net", "inpatient");
  helipadSafetyNet.rotation.x = Math.PI * 0.5;
  helipadSafetyNet.position.set(0, inpatient.roofY + 0.12, 0);
  const helipadAccess = hospitalMesh(new THREE.BoxGeometry(2.1, 2.1, 2.4), pale, "hospital-roof-helipad-access", "inpatient");
  helipadAccess.position.set(-6.7, inpatient.roofY + 1.16, 2.6);
  const helipadAccessDoor = hospitalMesh(new THREE.BoxGeometry(1.15, 1.72, 0.08), medicalMetal, "hospital-roof-helipad-access-door", "inpatient");
  helipadAccessDoor.position.set(-6.7, inpatient.roofY + 1.02, 1.37);
  inpatient.building.add(helipadSafetyNet, helipadAccess, helipadAccessDoor);

  const outpatientPlant = hospitalMesh(new THREE.BoxGeometry(3.2, 1.05, 2.8), dark, "hospital-outpatient-roof-plant", "outpatient");
  outpatientPlant.position.set(-3.5, outpatient.roofY + 0.62, -1.4);
  outpatient.building.add(outpatientPlant);
  const emergencyPlant = hospitalMesh(new THREE.BoxGeometry(2.6, 0.9, 2.2), dark, "hospital-emergency-roof-plant", "emergency");
  emergencyPlant.position.set(2.8, emergency.roofY + 0.55, -1.3);
  emergency.building.add(emergencyPlant);

  const gardenFloor = hospitalMesh(new THREE.BoxGeometry(12, 0.08, 4.5), green, "hospital-healing-garden");
  gardenFloor.position.set(0, 0.46, 4.8);
  campus.add(gardenFloor);
  for (const x of [-4.5, -1.5, 1.5, 4.5]) {
    const planter = hospitalMesh(new THREE.BoxGeometry(1.3, 0.42, 0.82), stone, "hospital-healing-garden-planter");
    planter.position.set(x, 0.7, 4.8);
    const shrub = hospitalMesh(new THREE.DodecahedronGeometry(0.5, 0), green, "hospital-healing-garden-shrub");
    shrub.position.set(x, 1.18, 4.8);
    campus.add(planter, shrub);
  }

  const oxygenTankMaterial = new THREE.MeshStandardMaterial({ color: 0xdadfdc, roughness: 0.54, metalness: 0.28 });
  const oxygenService = new THREE.Group();
  oxygenService.name = "hospital-service-oxygen-compound";
  for (const x of [29, 30.5]) {
    const tank = hospitalMesh(new THREE.CylinderGeometry(0.48, 0.54, 2.2, 10), oxygenTankMaterial, "hospital-service-oxygen-tank", "emergency");
    tank.position.set(x, 1.5, -7.5);
    oxygenService.add(tank);
  }
  for (const x of [27.8, 31.7]) for (const z of [-9.1, -5.9]) {
    const bollard = hospitalMesh(new THREE.CylinderGeometry(0.13, 0.16, 1.15, 8), emergencyAccent, "hospital-service-oxygen-bollard", "emergency");
    bollard.position.set(x, 0.86, z);
    oxygenService.add(bollard);
  }
  for (const z of [-9.25, -5.75]) {
    const rail = hospitalMesh(new THREE.BoxGeometry(4.2, 1.35, 0.12), medicalMetal, "hospital-service-oxygen-cage", "emergency");
    rail.position.set(29.75, 1.08, z);
    oxygenService.add(rail);
  }
  for (const x of [27.65, 31.85]) {
    const rail = hospitalMesh(new THREE.BoxGeometry(0.12, 1.35, 3.4), medicalMetal, "hospital-service-oxygen-cage", "emergency");
    rail.position.set(x, 1.08, -7.5);
    oxygenService.add(rail);
  }
  campus.add(oxygenService);

  const exteriorLights: THREE.PointLight[] = [];
  for (const [x, z, color] of [[-16, 11, 0x78d9d1], [16, 11.5, 0xff6a56], [0, -3.2, 0xffc26b]] as const) {
    const light = new THREE.PointLight(color, 0, 18, 1.8);
    light.name = "hospital-campus-night-light";
    light.position.set(x, 3, z);
    exteriorLights.push(light);
    campus.add(light);
  }

  campus.userData = {
    mapLayer: "exterior",
    modelType: "hospital-campus",
    generatedLocally: true,
    zones: ["outpatient", "emergency", "inpatient"],
    buildingCount: 3,
    floorCounts: { outpatient: 3, emergency: 2, inpatient: 6 },
    consultRoomCount: 6,
    emergencyBayCount: 4,
    inpatientRoomCount: 12,
    inpatientBedCount: 12,
    elevatorCount: 2,
    internalRoadCount: roads.length,
    pedestrianWalkwayCount: walkways.length,
    coveredWalkwayCount: 3,
    raisedCrossingCount: 1,
    siteSize: new THREE.Vector3(80, 24.5, 62),
    setInteriorCutaway(cutaway: boolean) {
      cutawayShell.forEach((object) => { object.visible = !cutaway; });
    },
    setPowered(powered: boolean) {
      windowGlass.color.setHex(powered ? 0xffce85 : 0x72a8b6);
      windowGlass.emissive.setHex(powered ? 0xffa037 : 0x183945);
      windowGlass.emissiveIntensity = powered ? 2.4 : 0.08;
      interiorGlass.emissive.setHex(powered ? 0xffad4c : 0x183945);
      interiorGlass.emissiveIntensity = powered ? 1.35 : 0.08;
      warmLight.emissiveIntensity = powered ? 3.4 : 0.16;
      screenMaterial.emissiveIntensity = powered ? 1.8 : 0.28;
      exteriorLights.forEach((light) => { light.intensity = powered ? 5.2 : 0; });
    },
  };
  campus.userData.setInteriorCutaway(false);
  campus.userData.setPowered(false);
  return campus;
}
