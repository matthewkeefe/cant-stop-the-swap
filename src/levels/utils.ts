export function getNextLevelId(levels: { id: string }[], currentId: string) {
  const idx = levels.findIndex((l) => l.id === currentId);
  if (idx === -1) return levels[0]?.id ?? "";
  return levels[(idx + 1) % levels.length].id;
}
