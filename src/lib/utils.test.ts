import { describe, expect, it } from "vitest";
import { errorMessage, isSlotTakenError } from "./utils";

describe("errorMessage", () => {
  it("usa el message de un Error", () => {
    expect(errorMessage(new Error("se rompió"), "fallback")).toBe("se rompió");
  });

  it("usa el message de un objeto no-Error (ej. PostgrestError de Supabase)", () => {
    expect(errorMessage({ message: "duplicate key", code: "23505" }, "fallback")).toBe("duplicate key");
  });

  it("cae al fallback si no hay message usable", () => {
    expect(errorMessage(undefined, "fallback")).toBe("fallback");
    expect(errorMessage({ message: "" }, "fallback")).toBe("fallback");
    expect(errorMessage("texto suelto", "fallback")).toBe("fallback");
  });
});

describe("isSlotTakenError", () => {
  it("reconoce la superposición de turnos (exclusion_violation) y el índice único", () => {
    expect(isSlotTakenError({ code: "23P01", message: "conflicting key value" })).toBe(true);
    expect(isSlotTakenError({ code: "23505", message: "duplicate key" })).toBe(true);
  });

  it("no confunde otros errores con un horario ocupado", () => {
    expect(isSlotTakenError({ code: "23514", message: "anticipación" })).toBe(false);
    expect(isSlotTakenError(new Error("red"))).toBe(false);
    expect(isSlotTakenError(null)).toBe(false);
  });
});
