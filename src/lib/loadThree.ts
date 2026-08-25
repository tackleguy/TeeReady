/** Lazy-loaded three.js — keeps WebGL out of the main / Today bundle. */

let threePromise: Promise<typeof import('three')> | null = null;

export function loadThree(): Promise<typeof import('three')> {
  threePromise ??= import('three');
  return threePromise;
}
