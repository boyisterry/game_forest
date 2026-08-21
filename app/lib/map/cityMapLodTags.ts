import type * as THREE from "three";

type HiddenMapLayer = "interior" | "micro-detail" | "animated-detail";

type ReviewedRule = Readonly<{
  layer: HiddenMapLayer;
  name: RegExp;
  userData?: Readonly<Record<string, string>>;
}>;

const REVIEWED_RULES: Readonly<Record<string, readonly ReviewedRule[]>> = Object.freeze({
  "shopping-mall": Object.freeze([
    Object.freeze({ layer: "interior", name: /.*/, userData: Object.freeze({ zone: "interior" }) }),
    Object.freeze({ layer: "interior", name: /(?:interior|restroom|service-core|fire-stair)/ }),
    Object.freeze({ layer: "micro-detail", name: /(?:checkout|counter|garment-rack|bread-rack|lounge-(?:sofa|coffee-table)|interior-luminaire)/ }),
  ]),
  "amusement-park": Object.freeze([
    Object.freeze({ layer: "micro-detail", name: /(?:passenger-seat|seat-(?:back|cushion|restraint)|steering-(?:column|wheel)|go-kart-driver|control-(?:column|wheel|console)|visitor-locker|information-desk|ticket-counter|lap-bar|guide-wheel)/ }),
  ]),
  "city-center": Object.freeze([
    Object.freeze({ layer: "interior", name: /(?:tower-lobby|hub-service-counter|pavilion-(?:accessible-)?counter|plaza-shop-counter)/ }),
    Object.freeze({ layer: "micro-detail", name: /(?:waiting-seat|platform-seat|public-bench|fountain-bench|bicycle-rack)/ }),
  ]),
  "city-park": Object.freeze([
    Object.freeze({ layer: "interior", name: /(?:greenhouse-interior|potting-bench|information-desk|cafe-counter)/ }),
    Object.freeze({ layer: "animated-detail", name: /(?:water-jet|fountain-jet)/ }),
  ]),
  "sports-center": Object.freeze([
    Object.freeze({ layer: "interior", name: /(?:ticket-counter|fitness-(?:equipment|station)|service-interior)/ }),
  ]),
  "fire-station": Object.freeze([
    Object.freeze({ layer: "interior", name: /(?:command-(?:desk|screen)|dining-table|dorm-bed|equipment-rack|turnout-gear-locker)/ }),
  ]),
  "office-campus": Object.freeze([
    Object.freeze({ layer: "interior", name: /(?:workstation|meeting-|phone-room|reception-desk|restroom-|kitchenette|cafe-|lobby-(?:floor|light|sofa|table|turnstile)|collaboration-|elevator-cabin|emergency-stair|service-core)/ }),
  ]),
  "residential-building": Object.freeze([
    Object.freeze({ layer: "interior", name: /(?:stair-(?:step|landing|handrail)|floor-(?:platform|door)|stair-core-back-wall)/ }),
    Object.freeze({ layer: "micro-detail", name: /(?:ac-fan|door-handle)/ }),
  ]),
});

function matchesUserData(object: THREE.Object3D, expected: Readonly<Record<string, string>> | undefined) {
  if (!expected) return true;
  return Object.entries(expected).every(([key, value]) => object.userData[key] === value);
}

export type CityMapLodTagReport = Readonly<{
  factoryId: string;
  interior: number;
  microDetail: number;
  animatedDetail: number;
}>;

export function applyReviewedCityMapLodTags(root: THREE.Group, factoryId: string): CityMapLodTagReport {
  const rules = REVIEWED_RULES[factoryId] ?? [];
  let interior = 0;
  let microDetail = 0;
  let animatedDetail = 0;
  root.traverse((object) => {
    if (object === root || typeof object.userData.mapLayer === "string") return;
    const rule = rules.find((candidate) => candidate.name.test(object.name) && matchesUserData(object, candidate.userData));
    if (!rule) return;
    object.userData.mapLayer = rule.layer;
    if (rule.layer === "interior") interior += 1;
    else if (rule.layer === "micro-detail") microDetail += 1;
    else animatedDetail += 1;
  });
  return Object.freeze({ factoryId, interior, microDetail, animatedDetail });
}
