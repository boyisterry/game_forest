import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as THREE from "three";
import { measureModelGeometry } from "../app/lib/map/cityFurnitureShatter.ts";
import { buildLowPolyResidentialCommunity } from "../app/lib/map/residentialCommunity.ts";

function namedObjects(root, name) {
  const objects = [];
  root.traverse((object) => { if (object.name === name) objects.push(object); });
  return objects;
}

test("builds one complete community with three distinct planning zones", () => {
  const community = buildLowPolyResidentialCommunity();
  assert.equal(community.name, "city-residential-community-lowpoly");
  assert.equal(community.userData.modelType, "residential-community");
  assert.equal(community.userData.generatedLocally, true);
  assert.deepEqual(community.userData.zones, ["residential", "commercial", "kindergarten"]);
  assert.ok(community.getObjectByName("residential-community-main-gate"));
  assert.ok(community.getObjectByName("residential-community-commercial-street"));
  assert.ok(community.getObjectByName("residential-community-kindergarten-gate"));
  assert.equal(namedObjects(community, "residential-community-fire-lane").length, 4);
});

test("provides a complete mixed residential compound and everyday services", () => {
  const community = buildLowPolyResidentialCommunity();
  assert.equal(community.userData.residentialBuildingCount, 8);
  assert.equal(community.userData.highRiseCount, 4);
  assert.equal(community.userData.midRiseCount, 4);
  assert.equal(community.userData.householdCount, 368);
  assert.equal(namedObjects(community, "residential-community-high-rise-1").length, 1);
  assert.equal(namedObjects(community, "residential-community-mid-rise-4").length, 1);
  assert.ok(community.getObjectByName("residential-community-central-garden"));
  assert.ok(community.getObjectByName("residential-community-children-playground"));
  assert.ok(community.getObjectByName("residential-community-senior-fitness-area"));
  assert.ok(community.getObjectByName("residential-community-parcel-station"));
  assert.ok(community.getObjectByName("residential-community-parcel-lockers"));
  assert.ok(community.getObjectByName("residential-community-waste-sorting-station"));
  assert.equal(namedObjects(community, "residential-community-underground-garage-ramp").length, 2);
  assert.equal(community.userData.garageEntranceCount, 2);
  assert.equal(community.getObjectByName("residential-community-high-rise-1").scale.y, 1.7);
  assert.equal(community.getObjectByName("residential-community-mid-rise-1").scale.y, 1.85);
});

test("opens the neighbourhood commercial street directly to the public road", () => {
  const community = buildLowPolyResidentialCommunity();
  const street = community.getObjectByName("residential-community-commercial-street");
  assert.equal(street.userData.openToPublicStreet, true);
  assert.equal(street.userData.frontDirection, "+z");
  assert.ok(community.getObjectByName("residential-community-public-road"));
  assert.ok(community.getObjectByName("residential-community-public-sidewalk"));
  assert.equal(community.userData.commercialBuildingCount, 1);
  assert.equal(community.userData.storefrontCount, 14);
  assert.equal(namedObjects(community, "residential-community-storefront").length, 14);
  assert.equal(namedObjects(community, "residential-community-storefront-glass").length, 14);
  assert.equal(namedObjects(community, "residential-community-store-sign").length, 14);
  assert.equal(namedObjects(community, "residential-community-store-awning").length, 14);
  assert.equal(namedObjects(community, "residential-community-commercial-parking-bay").length, 18);
  const roadBox = new THREE.Box3().setFromObject(community.getObjectByName("residential-community-public-road"));
  const walkBox = new THREE.Box3().setFromObject(community.getObjectByName("residential-community-public-sidewalk"));
  assert.ok(namedObjects(community, "residential-community-commercial-parking-bay").every((bay) => {
    const box = new THREE.Box3().setFromObject(bay);
    return box.min.z > walkBox.max.z && box.max.z < roadBox.min.z && bay.userData.parkingType === "parallel";
  }));
  const tenants = new Set(namedObjects(community, "residential-community-storefront").map((store) => store.userData.tenantType));
  for (const tenant of ["supermarket", "pharmacy", "breakfast", "coffee", "restaurant", "clinic"]) assert.ok(tenants.has(tenant));
});

test("protects a fully equipped 160-child kindergarten with its own pickup flow", () => {
  const community = buildLowPolyResidentialCommunity();
  assert.equal(community.userData.kindergartenBuildingCount, 3);
  assert.equal(community.userData.kindergartenClassroomCount, 8);
  assert.equal(community.userData.kindergartenCapacity, 160);
  assert.equal(namedObjects(community, "residential-community-kindergarten-classroom").length, 8);
  assert.equal(namedObjects(community, "residential-community-kindergarten-activity-table").length, 32);
  assert.ok(community.getObjectByName("residential-community-kindergarten-teaching-building"));
  assert.ok(community.getObjectByName("residential-community-kindergarten-multipurpose-building"));
  assert.ok(community.getObjectByName("residential-community-kindergarten-admin-kitchen"));
  assert.ok(community.getObjectByName("residential-community-kindergarten-playground"));
  assert.ok(community.getObjectByName("residential-community-kindergarten-running-loop"));
  assert.ok(community.getObjectByName("residential-community-kindergarten-sandpit"));
  assert.ok(community.getObjectByName("residential-community-kindergarten-pickup-zone"));
  const accessRoad = community.getObjectByName("residential-community-kindergarten-access-road");
  assert.ok(accessRoad);
  assert.equal(accessRoad.userData.connectsPickupToPublicRoad, true);
  const pickupBox = new THREE.Box3().setFromObject(community.getObjectByName("residential-community-kindergarten-pickup-zone"));
  const accessBox = new THREE.Box3().setFromObject(accessRoad);
  const publicRoadBox = new THREE.Box3().setFromObject(community.getObjectByName("residential-community-public-road"));
  assert.ok(Math.min(pickupBox.max.x, accessBox.max.x) - Math.max(pickupBox.min.x, accessBox.min.x) >= accessRoad.userData.clearWidth);
  assert.ok(accessBox.min.z <= pickupBox.max.z && accessBox.max.z >= publicRoadBox.min.z);
  const gate = community.getObjectByName("residential-community-kindergarten-gate");
  assert.equal(gate.userData.childSafe, true);
  assert.equal(gate.userData.controlledAccess, true);
  const gatePosts = namedObjects(gate, "residential-community-kindergarten-gate-post");
  const postWidth = gatePosts[0].geometry.parameters.width;
  const measuredClearWidth = gatePosts[1].position.x - gatePosts[0].position.x - postWidth;
  assert.equal(measuredClearWidth, gate.userData.clearWidth);
  assert.equal(gate.userData.measuredClearWidth, gate.userData.clearWidth);
});

test("secures residential and kindergarten zones without closing the retail frontage", () => {
  const community = buildLowPolyResidentialCommunity();
  assert.equal(community.userData.fenceSegmentCount, 10);
  assert.equal(namedObjects(community, "residential-community-residential-fence").length, 5);
  assert.equal(namedObjects(community, "residential-community-kindergarten-fence").length, 5);
  assert.equal(community.getObjectByName("residential-community-commercial-fence"), undefined);
  const gatePanels = [
    ...namedObjects(community, "residential-community-main-gate-panel"),
    ...namedObjects(community, "residential-community-kindergarten-gate-panel"),
  ];
  assert.equal(gatePanels.length, 4);
  const mainGate = community.getObjectByName("residential-community-main-gate");
  const mainGatePiers = namedObjects(mainGate, "residential-community-gate-pier");
  assert.equal(mainGatePiers[1].position.x - mainGatePiers[0].position.x - mainGatePiers[0].geometry.parameters.width, mainGate.userData.clearWidth);
  assert.ok(gatePanels.every((panel) => panel.userData.open === false));
  community.userData.setAccessGatesOpen(true);
  assert.ok(gatePanels.every((panel) => panel.userData.open === true));
  assert.ok(namedObjects(community, "residential-community-residential-fence-post").length > 190);
  assert.ok(namedObjects(community, "residential-community-kindergarten-fence-post").length > 160);
});

test("reuses existing city decorations and keeps the rabbit rider scale", () => {
  const community = buildLowPolyResidentialCommunity();
  assert.equal(community.userData.scaleReferenceLengthMeters, 2.4);
  assert.equal(community.userData.scaleStandard, "rabbit-rider");
  assert.deepEqual(community.userData.decorationSources, [
    "/models/forest/tree_normal_medium_redwood_a.glb",
    "city-street-light-lowpoly",
    "city-roadside-planter-lowpoly",
  ]);
  assert.equal(namedObjects(community, "residential-community-reused-tree-anchor").length, 26);
  assert.equal(namedObjects(community, "city-street-light-lowpoly").length, 18);
  assert.equal(namedObjects(community, "city-roadside-planter-lowpoly").length, 10);
  const metrics = measureModelGeometry(community);
  assert.ok(metrics.size.x >= 189);
  assert.ok(metrics.size.z >= 144);
  assert.ok(metrics.size.y >= 35);
  assert.equal(community.userData.siteSize.x, 190);
  assert.equal(community.userData.siteSize.y, 60);
  assert.equal(community.userData.siteSize.z, 145);
});

test("supports night lighting, residential elevators and structural cutaway", () => {
  const community = buildLowPolyResidentialCommunity();
  const storefront = namedObjects(community, "residential-community-storefront-glass")[0];
  const kindergartenWindow = namedObjects(community, "residential-community-kindergarten-window")[0];
  const lights = namedObjects(community, "street-light-point-light");
  assert.ok(storefront instanceof THREE.Mesh && kindergartenWindow instanceof THREE.Mesh);
  community.userData.setPowered(true);
  assert.ok(storefront.material.emissiveIntensity > 1);
  assert.ok(lights.every((light) => light.intensity > 0));
  community.userData.setPowered(false);
  assert.ok(lights.every((light) => light.intensity === 0));
  assert.equal(kindergartenWindow.visible, true);
  community.userData.setInteriorCutaway(true);
  assert.equal(kindergartenWindow.visible, false);
  assert.equal(community.getObjectByName("residential-community-commercial-building").visible, false);
  assert.ok(namedObjects(community, "residential-community-storefront-glass").every((pane) => !pane.visible));
  assert.ok(namedObjects(community, "residential-community-commercial-upper-window").every((pane) => !pane.visible));
  assert.ok(namedObjects(community, "residential-community-commercial-floor-slab").every((slab) => slab.visible));
  assert.equal(namedObjects(community, "residential-community-commercial-tenant-divider").length, 13);
  assert.ok(namedObjects(community, "residential-community-commercial-tenant-divider").every((divider) => divider.visible && divider.userData.separatesTenantBays));
  community.userData.setInteriorCutaway(false);
  assert.equal(kindergartenWindow.visible, true);
  assert.doesNotThrow(() => community.userData.update(1 / 60));
});

test("exposes the complete community from the archive and map studio", async () => {
  const [demoSource, archiveSource, studioSource] = await Promise.all([
    readFile(new URL("../app/demos/residential-community/ResidentialCommunityDemo.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/demos/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/MapStudio.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(demoSource, /buildLowPolyResidentialCommunity/);
  assert.match(demoSource, /完整住宅组团/);
  assert.match(demoSource, /社区商业街/);
  assert.match(demoSource, /独立幼儿园/);
  assert.match(demoSource, /兔子骑车主角整体外廓约 2\.40 m/);
  assert.match(demoSource, /RABBIT_RIDER_URL/);
  assert.match(archiveSource, /完整住宅社区/);
  assert.match(archiveSource, /\/demos\/residential-community/);
  assert.match(studioSource, /商业中心 · 完整社区/);
});
