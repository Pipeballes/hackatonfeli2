import type { MenuItem } from "../domain/model.js";

// Todos los importes se expresan en centavos para evitar errores de punto flotante.
export const demoMenu: MenuItem[] = [
  { id: "burrata", name: "Burrata de estación", description: "Tomates asados, pesto de albahaca y focaccia", category: "Para empezar", priceInCents: 1_380_000, available: true },
  { id: "papas-bravas", name: "Papas bravas", description: "Alioli ahumado, salsa brava y verdeo", category: "Para empezar", priceInCents: 890_000, available: true },
  { id: "burger", name: "Burger de la casa", description: "Doble carne, cheddar, cebolla y papas rústicas", category: "Principales", priceInCents: 1_790_000, available: true },
  { id: "risotto", name: "Risotto de hongos", description: "Portobellos, parmesano y aceite de trufas", category: "Principales", priceInCents: 1_860_000, available: true },
  { id: "pesca", name: "Pesca del día", description: "Puré de coliflor, limón quemado y alcaparras", category: "Principales", priceInCents: 2_240_000, available: true },
  { id: "volcan", name: "Volcán de chocolate", description: "Centro tibio, helado de crema y sal marina", category: "Postres", priceInCents: 970_000, available: true },
  { id: "gin-citrico", name: "Gin cítrico", description: "Gin, pomelo, romero y tónica", category: "Bebidas", priceInCents: 940_000, available: true },
  { id: "limonada", name: "Limonada de menta", description: "Limón, menta fresca y jengibre", category: "Bebidas", priceInCents: 520_000, available: true },
];
