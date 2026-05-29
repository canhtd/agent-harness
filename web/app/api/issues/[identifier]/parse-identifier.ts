export function parseIdentifier(
  identifier: string,
): { teamKey: string; number: number } | null {
  const match = identifier.match(/^([A-Z]+)-(\d+)$/);
  if (!match) return null;
  return { teamKey: match[1], number: parseInt(match[2], 10) };
}
