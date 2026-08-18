import assert from "node:assert/strict";
import test from "node:test";
import {
  BUILTIN_SURFACE_PROFILES,
  BUILTIN_SURFACE_TRANSITIONS,
  canonicalFloat64Bits,
  canonicalTupleKey,
  citySurfaceChunkKey,
  decodeCitySurfaceChunkKey,
  getBuiltinSurfaceProfile,
} from "../app/lib/map/cityCollisionTypes.ts";

test("canonical tuple keys do not collide on delimiters or unicode", () => {
  const keys = new Set([
    canonicalTupleKey(["a:b", "c"]),
    canonicalTupleKey(["a", "b:c"]),
    canonicalTupleKey(["a|b", "c"]),
    canonicalTupleKey(["a", "b|c"]),
    canonicalTupleKey(["兔", "路"]),
    canonicalTupleKey(["兔路"]),
    canonicalTupleKey([1, "1"]),
  ]);
  assert.equal(keys.size, 7);
  assert.notEqual(canonicalFloat64Bits(0), canonicalFloat64Bits(-0));
  assert.equal(canonicalFloat64Bits(1.25), "3ff4000000000000");
});

test("surface chunk keys round-trip signed coordinate bounds", () => {
  for (const pair of [[-32768, -32768], [-1, 0], [0, -1], [32767, 32767]]) {
    assert.deepEqual(decodeCitySurfaceChunkKey(citySurfaceChunkKey(pair[0], pair[1])), pair);
  }
  assert.throws(() => citySurfaceChunkKey(32768, 0), RangeError);
  assert.throws(() => decodeCitySurfaceChunkKey(2 ** 32), RangeError);
});

test("built-in surface profiles retain sidewalk speed cap and curb policy", () => {
  assert.equal(new Set(BUILTIN_SURFACE_PROFILES.map((profile) => profile.id)).size, BUILTIN_SURFACE_PROFILES.length);
  assert.equal(getBuiltinSurfaceProfile("sidewalk")?.speedCap, 12);
  assert.equal(getBuiltinSurfaceProfile("asphalt")?.speedCap, Infinity);
  const curb = BUILTIN_SURFACE_TRANSITIONS.find((profile) => profile.kind === "road-curb");
  assert.equal(curb?.maxStepUpMeters, 0.30);
  assert.equal(curb?.maxStepDownMeters, 0.30);
  assert.equal(curb?.bumpProfile, "curb-strong");
});
