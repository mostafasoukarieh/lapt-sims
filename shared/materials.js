// Densities from the Grade 7 book, Chapter 3, Table 1 (p.32), in g/cm³.
// Same values in the EN and FR editions. Glycerin (1.4) is in the EN book only and is left out.
// Names are not here: each simulation takes them from its strings.js (EN/FR).
export const DENSITY = {
  osmium: 22.6,
  platinum: 21.4,
  gold: 19.3,
  lead: 11.3,
  silver: 10.5,
  copper: 8.9,
  iron: 7.8,
  aluminium: 2.7,
  ice: 0.92,
  wood: 0.5,
  mercury: 13.6,
  water: 1,
  benzene: 0.91,
  oil: 0.9,
  alcohol: 0.8,
};

// Mass (g) of a volume V (cm³) of a substance, rounded to 0.01 g to avoid floating-point noise.
export function massOf(substance, V) {
  return Math.round(DENSITY[substance] * V * 100) / 100;
}
