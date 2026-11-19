export const roles = ["administrator", "pemilik", "abk", "reseller"] as const;
export type Role = (typeof roles)[number];

export const roleLabels: Record<Role, string> = {
  administrator: "Administrator",
  pemilik: "Pemilik",
  abk: "ABK",
  reseller: "Reseller",
};

export const themes = ["system", "light", "dark"] as const;
export type Theme = (typeof themes)[number];
