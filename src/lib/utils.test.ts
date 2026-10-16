import { describe, expect, it } from "vitest";
import { errorMessage, formatPrice, isSlotTakenError } from "./utils";

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

describe("formatPrice", () => {
  it("formatea pesos con separador de miles argentino y sin decimales", () => {
    expect(formatPrice(9500)).toBe("$ 9.500");
    expect(formatPrice(125000)).toBe("$ 125.000");
    expect(formatPrice(0)).toBe("$ 0");
  });

  it("muestra centavos solo si los hay", () => {
    expect(formatPrice(1234.5)).toBe("$ 1.234,50");
  });
});
