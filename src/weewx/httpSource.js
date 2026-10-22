// -----------------------------------------------------------------------------
// The HTTP source: the JSON file a WeeWX skin writes at every report
// (weewx-json `weewx.json` / `current_minimal.json`, Belchertown
// `weewx_data.json`), served by the web server of the WeeWX host.
//
// WeeWX rewrites it once per archive interval (5 minutes by default): reading
// it more often only catches the new file sooner. A file without a date
// (weewx-json in its "human" date format) is dated by its Last-Modified
// header.
// -----------------------------------------------------------------------------

import { parseHttpPayload } from './parse.js';

export const HTTP_TIMEOUT_MS = 10 * 1000;
const MAX_BYTES = 2 * 1024 * 1024;

export class HttpSourceError extends Error {
  /** @param {'unreachable'|'format'} kind */
  constructor(kind, message) {
    super(message);
    this.kind = kind;
  }
}

/**
 * Read the file once.
 * @param {string} address http(s) URL, credentials allowed (basic auth)
 * @param {object} [options]
 * @param {typeof fetch} [options.fetch]
 * @returns {Promise<{ format: string, reading: object }>}
 * @throws {HttpSourceError}
 */
export async function readHttpSource(address, { fetch: fetchFn = globalThis.fetch } = {}) {
  const url = new URL(address);
  const headers = { accept: 'application/json' };
  // fetch() refuses a URL with credentials: they become a basic auth header.
  if (url.username || url.password) {
    const decode = (value) => {
      try {
        return decodeURIComponent(value);
      } catch {
        return value;
      }
    };
    const credentials = `${decode(url.username)}:${decode(url.password)}`;
    headers.authorization = `Basic ${Buffer.from(credentials).toString('base64')}`;
    url.username = '';
    url.password = '';
  }
  let response;
  try {
    response = await fetchFn(url.toString(), {
      headers,
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    });
  } catch (err) {
    const reason = err?.name === 'TimeoutError' ? 'timeout' : (err?.cause?.code ?? err?.message);
    throw new HttpSourceError('unreachable', String(reason));
  }
  if (!response.ok) {
    throw new HttpSourceError('unreachable', `HTTP ${response.status}`);
  }
  const length = Number(response.headers.get('content-length'));
  if (Number.isFinite(length) && length > MAX_BYTES) {
    throw new HttpSourceError('format', 'file too large');
  }
  const body = await response.text();
  if (body.length > MAX_BYTES) {
    throw new HttpSourceError('format', 'file too large');
  }
  let json;
  try {
    json = JSON.parse(body);
  } catch {
    throw new HttpSourceError('format', 'not JSON');
  }
  const parsed = parseHttpPayload(json);
  if (!parsed) {
    throw new HttpSourceError('format', 'unknown format');
  }
  if (parsed.reading.time === null) {
    const modified = Date.parse(response.headers.get('last-modified') ?? '');
    if (!Number.isFinite(modified)) {
      throw new HttpSourceError('format', 'no date in the file');
    }
    parsed.reading.time = modified;
  }
  return parsed;
}
