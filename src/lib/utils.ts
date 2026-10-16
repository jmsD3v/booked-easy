import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Supabase devuelve errores como objetos planos con `message` (PostgrestError,
// StorageError), no siempre como instancias de Error — por eso no alcanza
// con `err instanceof Error`.
export function errorMessage(err: unknown, fallback: string): string {
  if (typeof err === "object" && err !== null && "message" in err) {
    const { message } = err as { message: unknown };
    if (typeof message === "string" && message) return message;
  }
  return fallback;
}

// La base rechaza un turno que se pisa con otro del mismo empleado:
// 23P01 (restricción de exclusión por superposición) o 23505 (índice único).
export function isSlotTakenError(err: unknown): boolean {
  if (typeof err !== "object" || err === null || !("code" in err)) return false;
  const { code } = err as { code: unknown };
  return code === "23P01" || code === "23505";
}

// Pesos argentinos: "$ 9.500" (espacio no separable, así el monto no se
// parte en dos líneas). Centavos solo si el precio los tiene.
export function formatPrice(amount: number): string {
  const hasCents = !Number.isInteger(amount);
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: hasCents ? 2 : 0,
  }).format(amount);
}
