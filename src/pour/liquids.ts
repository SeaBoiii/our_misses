/** Each colour has a distinct optional symbol, including similar hues. */
export const colors = [
  { name: "lavender", hex: "#ad8bfa", light: "#d6bfff", symbol: "✦" },
  { name: "mint", hex: "#53cdb3", light: "#a0eed8", symbol: "●" },
  { name: "peach", hex: "#f5a274", light: "#ffce9f", symbol: "▲" },
  { name: "rose", hex: "#e776a1", light: "#ffb2cb", symbol: "♥" },
  { name: "blue", hex: "#629bea", light: "#a9d2ff", symbol: "≋" },
  { name: "gold", hex: "#e9c35c", light: "#ffed97", symbol: "◆" },
  { name: "coral", hex: "#ef706d", light: "#ffada0", symbol: "+" },
  { name: "lilac", hex: "#cd7bdf", light: "#f2b1ff", symbol: "○" },
  { name: "lime", hex: "#acd25b", light: "#e1f49d", symbol: "■" },
  { name: "teal", hex: "#35a4b5", light: "#8ae4e8", symbol: "×" },
  { name: "tangerine", hex: "#eb8c3c", light: "#ffd078", symbol: "−" },
  { name: "periwinkle", hex: "#737bdc", light: "#b4baff", symbol: "★" },
];
export function bottleLabel(layers: number[], index: number, hiddenCount = 0) {
  const concealed = Math.max(0, Math.min(hiddenCount, layers.length - 1));
  return `Bottle ${index + 1}, ${layers.length ? `${layers.length} of 4 layers, bottom to top: ${layers.map((c, layer) => layer < concealed ? "unknown" : (colors[c]?.name ?? c)).join(", ")}` : "empty"}`;
}
