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
