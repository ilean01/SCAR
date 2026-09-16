import test from "node:test";
import assert from "node:assert/strict";
import { daypart } from "../js/daypart.js";

function at(hour, minute = 0) {
  return new Date(2026, 8, 16, hour, minute);
}

test("muestra mañana desde las 06:00 hasta antes de las 15:00", () => {
  assert.equal(daypart(at(6)).key, "mañana");
  assert.equal(daypart(at(14, 59)).key, "mañana");
});

test("muestra cuidado extra desde las 15:00 hasta antes de las 20:00", () => {
  assert.equal(daypart(at(15)).key, "extra");
  assert.equal(daypart(at(19, 59)).key, "extra");
});

test("muestra noche desde las 20:00 hasta antes de las 06:00", () => {
  assert.equal(daypart(at(20)).key, "noche");
  assert.equal(daypart(at(5, 59)).key, "noche");
});
