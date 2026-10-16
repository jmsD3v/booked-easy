import { describe, expect, it } from "vitest";
import { errorMessage } from "./utils";

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
