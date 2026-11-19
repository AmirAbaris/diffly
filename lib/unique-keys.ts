export function keyByValue<T>(
  items: readonly T[],
  getBaseKey: (item: T) => string
): Array<{ key: string; item: T }> {
  const counts = new Map<string, number>()
  return items.map((item) => {
    const base = getBaseKey(item)
    const count = (counts.get(base) ?? 0) + 1
    counts.set(base, count)
    return {
      key: `${base}-${count}`,
      item,
    }
  })
}
