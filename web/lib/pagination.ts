export type PaginationToken = number | "...";

/**
 * Builds compact pagination tokens with ellipses.
 * Example: [1, "...", 4, 5, 6, "...", 20]
 */
export function buildCompactPagination(totalPages: number, currentPage: number): PaginationToken[] {
  if (!Number.isFinite(totalPages) || totalPages <= 1) return [1];

  const total = Math.max(1, Math.floor(totalPages));
  const current = Math.min(Math.max(1, Math.floor(currentPage)), total);

  const pages = new Set<number>([1, total, current - 1, current, current + 1]);

  // Add extra near edges for smoother navigation.
  if (current <= 3) {
    pages.add(2);
    pages.add(3);
    pages.add(4);
  }
  if (current >= total - 2) {
    pages.add(total - 1);
    pages.add(total - 2);
    pages.add(total - 3);
  }

  const sorted = [...pages].filter((page) => page >= 1 && page <= total).sort((a, b) => a - b);
  const tokens: PaginationToken[] = [];

  for (let index = 0; index < sorted.length; index += 1) {
    const value = sorted[index];
    const prev = sorted[index - 1];
    if (index > 0 && prev !== undefined && value - prev > 1) {
      tokens.push("...");
    }
    tokens.push(value);
  }

  return tokens;
}
