/** Shared request validation for public handlers. */
export function numeric(value: unknown): number {
  if (typeof value !== 'number' && typeof value !== 'string') return NaN;
  if (typeof value === 'string' && !value.trim()) return NaN;
  return Number(value);
}

export function validCoordinates(lat: number, lon: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
}

export function errorResponse(error: string, status = 400): Response {
  return Response.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } });
}

export function allowMethods(req: Request, methods: string[]): Response | null {
  if (methods.includes(req.method)) return null;
  const response = errorResponse('method not allowed', 405);
  response.headers.set('Allow', methods.join(', '));
  return response;
}

/** Enforce the limit while streaming, even without Content-Length. */
export async function readJson(req: Request, maxBytes = 64 * 1024): Promise<unknown> {
  if (Number(req.headers.get('content-length')) > maxBytes) throw errorResponse('request too large', 413);
  if (!req.body) throw errorResponse('invalid JSON');
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw errorResponse('request too large', 413);
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch (error) {
    if (error instanceof Response) throw error;
    throw errorResponse('invalid JSON');
  } finally {
    reader.releaseLock();
  }
}

export function validHoles(holes: unknown[]): boolean {
  return holes.every((value) => {
    if (!value || typeof value !== 'object') return false;
    const h = value as Record<string, unknown>;
    return typeof h.number === 'number' && Number.isInteger(h.number) && h.number >= 1 && h.number <= 54
      && typeof h.yards === 'number' && Number.isFinite(h.yards) && h.yards > 0 && h.yards <= 2000
      && typeof h.bearingDeg === 'number' && Number.isFinite(h.bearingDeg) && h.bearingDeg >= 0 && h.bearingDeg <= 360
      && ['teeElevationM', 'greenElevationM', 'par'].every((key) => h[key] === undefined || (typeof h[key] === 'number' && Number.isFinite(h[key])))
      && (h.name === undefined || (typeof h.name === 'string' && h.name.length <= 200));
  });
}
