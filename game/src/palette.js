// Protocol: Breach — original colour plan. Six values, one accent; nothing
// beyond them appears in code. Mirrored by the CSS custom properties in index.html.
export const PALETTE = {
  canvas: '#0b0f14',   // deep void — background / fog
  surface: '#161d26',  // wall face
  hairline: '#263238', // cover / trim
  ink: '#e3e7ea',      // reads — player, HUD, highlight
  muted: '#7a8794',    // secondary text
  accent: '#ff6b35',   // danger — enemy, bomb, low ammo
};

export function shade(name) {
  return PALETTE[name];
}
