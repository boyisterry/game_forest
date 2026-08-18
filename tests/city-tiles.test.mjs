import assert from "node:assert/strict";
import test from "node:test";
import {
  CityTileLayer,
  CityTileOccupancy,
  footprintTiles,
  rasterizeWorldAabb,
  rasterizeWorldAabb2d,
  rotateTileRect90,
  squareTilesFromCircle,
  tileToWorldCenter,
  worldSizeToTiles,
} from "../app/lib/map/cityTiles.ts";

test("city game-scale footprints use one-metre tiles", () => {
  assert.equal(worldSizeToTiles(1), 1);
  assert.equal(worldSizeToTiles(2), 2);
  assert.equal(worldSizeToTiles(4 - 1e-7), 4);
  assert.deepEqual(footprintTiles(4, 1, 0), { w: 4, d: 1 });
  assert.deepEqual(footprintTiles(4, 1, 90), { w: 1, d: 4 });
  assert.deepEqual(squareTilesFromCircle(4.2), { n: 5, padMeters: 5 });
});

test("half-open world AABBs agree at grid edges, centres, and decimal widths", () => {
  assert.deepEqual(rasterizeWorldAabb(-1100, -1099, -1100), { first: 0, lastExclusive: 1 });
  assert.deepEqual(rasterizeWorldAabb(-1099, -1098, -1100), { first: 1, lastExclusive: 2 });
  assert.deepEqual(rasterizeWorldAabb(-0.5, 0.5, -1100), { first: 1099, lastExclusive: 1101 });
  const decimal = rasterizeWorldAabb(100 - 15.1, 100 + 15.1, -1100);
  assert.deepEqual(decimal, { first: 1184, lastExclusive: 1216 });
  assert.deepEqual(rasterizeWorldAabb2d(-1100, -1080, -1099, -1079), { i: 0, j: 0, w: 1, d: 1 });
});

test("grid rotation preserves footprint centre", () => {
  const original = { i: 10, j: 20, w: 4, d: 2 };
  const rotated = rotateTileRect90(original);
  assert.deepEqual(rotated, { i: 11, j: 19, w: 2, d: 4 });
  assert.equal(original.i * 2 + original.w, rotated.i * 2 + rotated.w);
  assert.equal(original.j * 2 + original.d, rotated.j * 2 + rotated.d);
  assert.deepEqual(rotateTileRect90(rotated), original);
});

test("mixed-parity footprints preserve their centre on half-tile corners", () => {
  const original = { i: 10, j: 20, w: 4, d: 1 };
  const rotated = rotateTileRect90(original);
  assert.deepEqual(rotated, { i: 11.5, j: 18.5, w: 1, d: 4 });
  assert.equal(original.i * 2 + original.w, rotated.i * 2 + rotated.w);
  assert.equal(original.j * 2 + original.d, rotated.j * 2 + rotated.d);
});

test("tile centre conversion uses the city north-west origin", () => {
  assert.deepEqual(tileToWorldCenter(0, 0), { x: -1099.5, z: -1079.5 });
  assert.deepEqual(tileToWorldCenter(1099, 1079), { x: -0.5, z: -0.5 });
});

test("typed occupancy tracks layers and reservation owners without string cell keys", () => {
  const occupancy = new CityTileOccupancy();
  assert.equal(occupancy.reservationChunkCount, 0);
  const road = { i: 20, j: 30, w: 4, d: 1 };
  const site = { i: 21, j: 30, w: 2, d: 2 };
  occupancy.paint(road, CityTileLayer.Road);
  occupancy.paint(site, CityTileLayer.Reservation | CityTileLayer.Solid, "hospital-1");
  assert.equal(occupancy.reservationChunkCount, 1);

  assert.equal(occupancy.getLayers(20, 30), CityTileLayer.Road);
  assert.equal(occupancy.getReservationOwner(21, 30), "hospital-1");
  assert.equal(occupancy.hasAny({ i: 0, j: 0, w: 2, d: 2 }, CityTileLayer.Solid), false);
  assert.equal(occupancy.hasAny(site, CityTileLayer.Solid), true);

  occupancy.clear(site, CityTileLayer.Reservation | CityTileLayer.Solid, "someone-else");
  assert.equal(occupancy.getReservationOwner(21, 30), "hospital-1");
  occupancy.clear(site, CityTileLayer.Reservation | CityTileLayer.Solid, "hospital-1");
  assert.equal(occupancy.getReservationOwner(21, 30), null);
  assert.equal(occupancy.reservationChunkCount, 0);
});
