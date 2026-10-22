/** Route prefetch disabled — avoid downloading unused chunks and warming APIs. */
export function prefetchRoute(_path: string): void {
  // no-op (cost + clutter control)
}
