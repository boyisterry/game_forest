import assert from "node:assert/strict";
import test from "node:test";
import {
  motorFundamental,
  motorBusGain,
  motorCutoff,
  windGain,
  windCutoff,
  skidAmount,
  brakeGain,
} from "../app/lib/map/audioEngine.ts";

// Headless checks of the pure parameter math that maps ride state to the Web
// Audio graph. The graph itself needs a browser AudioContext; these functions
// are plain numbers and run under --experimental-strip-types.

test("motor fundamental rises with speed from a positive idle", () => {
  assert.ok(motorFundamental(0) > 0, "idle hum present at standstill");
  assert.ok(motorFundamental(14) > motorFundamental(0), "faster speed -> higher pitch");
  assert.ok(motorFundamental(19) > motorFundamental(14), "monotonic up to top speed");
  assert.equal(motorFundamental(-12), motorFundamental(12), "pitch depends on speed magnitude");
});

test("motor bus is quiet at idle and louder under throttle/boost", () => {
  const idle = motorBusGain(0, 0, false);
  const cruise = motorBusGain(14, 1, false);
  const boost = motorBusGain(19, 1, true);
  assert.ok(idle > 0 && idle < cruise, `idle ${idle} below cruise ${cruise}`);
  assert.ok(boost > cruise, `boost ${boost} above cruise ${cruise}`);
  assert.ok(boost <= 0.22, "bus gain bounded");
  assert.ok(motorCutoff(14) > motorCutoff(0), "drone brightens with speed");
});

test("wind is silent at low speed and whooshes near the top", () => {
  assert.equal(windGain(0), 0, "no wind at standstill");
  assert.ok(windGain(5) < 0.03, `barely any wind at 5 m/s, got ${windGain(5)}`);
  assert.ok(windGain(14) > windGain(5) * 3, "wind grows quickly with speed");
  assert.ok(windCutoff(19) > windCutoff(5), "wind brightens with speed");
});

test("skid stays silent while gripping and opens up while drifting", () => {
  assert.equal(skidAmount(0, false, false, 0), 0, "no skid while parked");
  assert.equal(skidAmount(0, false, false, 14), 0, "no skid gripping in a straight line");
  const drift = skidAmount(0.4, true, false, 12);
  assert.ok(drift > 0.6, `drift opens the screech, got ${drift}`);
  const slipOnly = skidAmount(0.4, false, false, 12);
  assert.ok(slipOnly > 0.3, `sustained slip screeches, got ${slipOnly}`);
  assert.ok(skidAmount(0, false, true, 14) > 0, "high-speed hard brake squeals");
  assert.ok(skidAmount(0, false, true, 6) > 0, "moderate-speed hard brake squeals");
  assert.equal(skidAmount(0, false, true, 2), 0, "no skid when nearly stopped");
});

test("brake scrub is audible under S or Space and scales with input", () => {
  assert.equal(brakeGain(1, false, 0), 0, "no scrub while parked");
  assert.equal(brakeGain(0, false, 14), 0, "no scrub without brake input");
  assert.ok(brakeGain(1, false, 14) > 0.1, `S brake is audible, got ${brakeGain(1, false, 14)}`);
  assert.ok(brakeGain(0, true, 14) > 0.1, `Space brake is audible, got ${brakeGain(0, true, 14)}`);
  assert.ok(brakeGain(1, false, 14) > brakeGain(0.3, false, 14), "harder S brake -> more scrub");
  assert.equal(brakeGain(1, true, 1), 0, "no scrub when nearly stopped");
});
