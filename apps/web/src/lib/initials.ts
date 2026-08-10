export function initials(name: string): string {
  const clean = name.trim();
  if (!clean) return "?";
  return clean
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
