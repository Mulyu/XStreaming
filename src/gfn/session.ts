import {storage} from '../store/mmkv';

// GeForce NOW CloudMatch session layer. This requests a game session from
// NVIDIA's CloudMatch service, polls it until a GPU seat is ready, and resolves
// the WebRTC signaling endpoint + ICE servers the streaming client connects to.
// Ported from OpenNOW (MIT) and slimmed for React Native: no node crypto/dns/fs
// and no proxy — ids come from a persisted UUID in MMKV, ICE hostnames are left
// for react-native-webrtc to resolve, and only the WebRTC (usage=14) signaling
// path is handled (no classic NVST/RTSPS or ads).

// Default streaming service; CloudMatch redirects us to the nearest region.
const DEFAULT_BASE_URL = 'https://prod.cloudmatchbeta.nvidiagrid.net';
const GFN_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 NVIDIACEFClient/HEAD/debb5919f6 GFN-PC/2.0.80.173';
const GFN_CLIENT_VERSION = '2.0.80.173';
const GFN_PLAY_ORIGIN = 'https://play.geforcenow.com';
const GFN_PLAY_REFERER = 'https://play.geforcenow.com/';

const CLOUDMATCH_DEVICE_ID_KEY = 'gfn.cloudMatchDeviceId';

export type GfnIceServer = {
  urls: string[];
  username?: string;
  credential?: string;
};

export type GfnStreamSettings = {
  /** e.g. "1920x1080" */
  resolution: string;
  fps: number;
  maxBitrateMbps: number;
  /** Wire codec: only H264 is safe to assume works everywhere on RN today. */
  codec: 'H264' | 'H265' | 'AV1';
};

export const DEFAULT_GFN_SETTINGS: GfnStreamSettings = {
  resolution: '1920x1080',
  fps: 60,
  maxBitrateMbps: 30,
  codec: 'H264',
};

// The resolved session, ready for the signaling/WebRTC stage.
export type GfnSession = {
  sessionId: string;
  /** CloudMatch status: 1=setup/queue, 2=ready, 3=streaming, >3 terminal (except 6=cleanup). */
  status: number;
  queuePosition?: number;
  seatSetupStep?: number;
  serverIp: string;
  /** wss://host:443/nvst/ */
  signalingUrl: string;
  iceServers: GfnIceServer[];
  streamingBaseUrl: string;
  clientId: string;
  deviceId: string;
  gpuType?: string;
};

// ---- ids ----

// RFC4122-ish v4 UUID from Math.random. Not cryptographically strong, but these
// ids are only correlation handles for the session, not secrets.
export const uuid = (): string =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });

// A device id kept stable across the create -> poll -> resume lifecycle; NVIDIA's
// resume reliability depends on it staying constant.
export const getStableDeviceId = (): string => {
  let id = storage.getString(CLOUDMATCH_DEVICE_ID_KEY);
  if (id && id.length > 0) {
    return id;
  }
  id = uuid();
  try {
    storage.set(CLOUDMATCH_DEVICE_ID_KEY, id);
  } catch {}
  return id;
};

// ---- headers ----

const buildCloudMatchHeaders = (opts: {
  token: string;
  clientId: string;
  deviceId: string;
  includeOrigin: boolean;
}): Record<string, string> => {
  const headers: Record<string, string> = {
    'User-Agent': GFN_USER_AGENT,
    Authorization: `GFNJWT ${opts.token}`,
    'Content-Type': 'application/json',
    'nv-browser-type': 'CHROME',
    'nv-client-id': opts.clientId,
    'nv-client-streamer': 'NVIDIA-CLASSIC',
    'nv-client-type': 'NATIVE',
    'nv-client-version': GFN_CLIENT_VERSION,
    'x-device-id': opts.deviceId,
    'nv-device-os': 'WINDOWS',
    'nv-device-type': 'DESKTOP',
    'nv-device-make': 'UNKNOWN',
    'nv-device-model': 'UNKNOWN',
  };
  if (opts.includeOrigin) {
    headers.Origin = GFN_PLAY_ORIGIN;
    headers.Referer = GFN_PLAY_REFERER;
  }
  return headers;
};

// ---- request body ----

const parseResolution = (input: string): {width: number; height: number} => {
  const [w, h] = input.split('x');
  const width = parseInt(w ?? '', 10);
  const height = parseInt(h ?? '', 10);
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return {width: 1920, height: 1080};
  }
  return {width, height};
};

const codecWireValue = (codec: GfnStreamSettings['codec']): number =>
  codec === 'AV1' ? 3 : codec === 'H265' ? 2 : 1;

const buildSessionRequestBody = (
  appId: string,
  settings: GfnStreamSettings,
  deviceHashId: string,
): unknown => {
  const {width, height} = parseResolution(settings.resolution);
  return {
    sessionRequestData: {
      appId,
      internalTitle: null,
      availableSupportedControllers: [],
      networkTestSessionId: null,
      parentSessionId: null,
      clientIdentification: 'GFN-PC',
      deviceHashId,
      clientVersion: '30.0',
      sdkVersion: '1.0',
      streamerVersion: 1,
      clientPlatformName: 'windows',
      clientRequestMonitorSettings: [
        {
          monitorId: 0,
          positionX: 0,
          positionY: 0,
          widthInPixels: width,
          heightInPixels: height,
          framesPerSecond: settings.fps,
          sdrHdrMode: 0,
          displayData: {},
          hdr10PlusGamingData: null,
          dpi: 0,
        },
      ],
      useOps: true,
      audioMode: 2,
      metaData: [
        {key: 'SubSessionId', value: uuid()},
        {key: 'wssignaling', value: '1'},
        {key: 'GSStreamerType', value: 'WebRTC'},
        {key: 'networkType', value: 'Unknown'},
        {key: 'ClientImeSupport', value: '0'},
        {
          key: 'clientPhysicalResolution',
          value: JSON.stringify({
            horizontalPixels: width,
            verticalPixels: height,
          }),
        },
        {key: 'surroundAudioInfo', value: '2'},
      ],
      sdrHdrMode: 0,
      clientDisplayHdrCapabilities: null,
      surroundAudioInfo: 0,
      remoteControllersBitmap: 0,
      clientTimezoneOffset: -new Date().getTimezoneOffset() * 60 * 1000,
      enhancedStreamMode: 1,
      // gamepadFriendly (2): ask NVIDIA to launch big-picture/console style.
      appLaunchMode: 2,
      secureRTSPSupported: false,
      partnerCustomData: '',
      accountLinked: true,
      enablePersistingInGameSettings: false,
      userAge: 26,
      requestedStreamingFeatures: {
        reflex: settings.fps >= 60,
        bitDepth: 0,
        cloudGsync: false,
        enabledL4S: false,
        supportedHidDevices: 0,
        profile: 0,
        fallbackToLogicalResolution: false,
        chromaFormat: 0,
        prefilterMode: 0,
        prefilterSharpness: 0,
        prefilterNoiseReduction: 0,
        hudStreamingMode: 0,
        maxBitrateKbps: Math.round(settings.maxBitrateMbps * 1000),
        codec: codecWireValue(settings.codec),
        vsync: false,
        dynamicStreamingMode: 3,
        audioChannelCount: 2,
      },
    },
  };
};

// ---- response parsing (WebRTC signaling path only) ----

type RawConnection = {
  ip?: string | string[];
  port?: number;
  usage?: number;
  resourcePath?: string;
};

type RawCloudMatchResponse = {
  requestStatus?: {statusCode?: number; statusDescription?: string};
  session?: {
    sessionId?: string;
    status?: number;
    queuePosition?: number;
    gpuType?: string;
    seatSetupInfo?: {seatSetupStep?: number; queuePosition?: number};
    connectionInfo?: RawConnection[];
    sessionControlInfo?: {ip?: string | string[]};
    iceServerConfiguration?: {
      iceServers?: Array<{
        urls?: string | string[];
        username?: string;
        credential?: string;
      }>;
    };
  };
};

const firstIp = (ip?: string | string[]): string | undefined =>
  Array.isArray(ip) ? ip[0] : ip;

const streamingServerIp = (
  session: NonNullable<RawCloudMatchResponse['session']>,
): string | null => {
  const connections = session.connectionInfo ?? [];
  const sigConn = connections.find(c => c.usage === 14);
  const directIp = firstIp(sigConn?.ip);
  if (directIp && directIp.length > 0) {
    return directIp;
  }
  const controlIp = firstIp(session.sessionControlInfo?.ip);
  return controlIp && controlIp.length > 0 ? controlIp : null;
};

const buildSignalingUrl = (serverIp: string, resourcePath?: string): string => {
  const raw = resourcePath ?? '/nvst/';
  if (raw.startsWith('wss://')) {
    return raw;
  }
  if (raw.startsWith('rtsps://') || raw.startsWith('rtsp://')) {
    const host = raw
      .replace(/^rtsps?:\/\//, '')
      .split(':')[0]
      .split('/')[0];
    if (host && host.length > 0 && !host.startsWith('.')) {
      return `wss://${host}/nvst/`;
    }
    return `wss://${serverIp}:443/nvst/`;
  }
  if (raw.startsWith('/')) {
    return `wss://${serverIp}:443${raw}`;
  }
  return `wss://${serverIp}:443/nvst/`;
};

const normalizeIceServers = (
  session: NonNullable<RawCloudMatchResponse['session']>,
): GfnIceServer[] => {
  const raw = session.iceServerConfiguration?.iceServers ?? [];
  const servers = raw
    .map(entry => ({
      urls: Array.isArray(entry.urls)
        ? entry.urls
        : entry.urls
        ? [entry.urls]
        : [],
      username: entry.username,
      credential: entry.credential,
    }))
    .filter(entry => entry.urls.length > 0);
  if (servers.length > 0) {
    return servers;
  }
  // Fallbacks matching NVIDIA's defaults.
  return [
    {urls: ['stun:s1.stun.gamestream.nvidia.com:19308']},
    {urls: ['stun:stun.l.google.com:19302']},
  ];
};

const toGfnSession = (
  payload: RawCloudMatchResponse,
  ctx: {streamingBaseUrl: string; clientId: string; deviceId: string},
): GfnSession => {
  if (payload.requestStatus?.statusCode !== 1 || !payload.session?.sessionId) {
    throw new Error(
      `CloudMatch error: ${
        payload.requestStatus?.statusDescription ?? 'unknown'
      } (code ${payload.requestStatus?.statusCode})`,
    );
  }
  const session = payload.session;
  const serverIp = streamingServerIp(session) ?? '';
  const sigConn = (session.connectionInfo ?? []).find(
    c => c.usage === 14 && c.ip,
  );
  return {
    sessionId: session.sessionId,
    status: session.status ?? 1,
    queuePosition:
      session.queuePosition ?? session.seatSetupInfo?.queuePosition,
    seatSetupStep: session.seatSetupInfo?.seatSetupStep,
    serverIp,
    signalingUrl: serverIp
      ? buildSignalingUrl(serverIp, sigConn?.resourcePath)
      : '',
    iceServers: normalizeIceServers(session),
    streamingBaseUrl: ctx.streamingBaseUrl,
    clientId: ctx.clientId,
    deviceId: ctx.deviceId,
    gpuType: session.gpuType,
  };
};

// ---- transport ----

const CLOUDMATCH_TIMEOUT_MS = 30_000;

const fetchCloudMatch = async (
  url: string,
  init: RequestInit,
): Promise<Response> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CLOUDMATCH_TIMEOUT_MS);
  try {
    return await fetch(url, {...init, signal: controller.signal});
  } finally {
    clearTimeout(timeout);
  }
};

const readJson = async <T>(response: Response): Promise<T> => {
  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `CloudMatch HTTP ${response.status}: ${text.slice(0, 300)}`,
    );
  }
  return JSON.parse(text) as T;
};

// Resolve the caller into the nearest region base, when starting from the
// default prod endpoint. Tolerant of failure — falls back to the given base.
const resolveRegionBase = async (
  base: string,
  headers: Record<string, string>,
): Promise<string> => {
  if (!base.includes('prod.cloudmatchbeta.nvidiagrid.net')) {
    return base;
  }
  try {
    const response = await fetchCloudMatch(`${base}/v2/serverInfo`, {
      method: 'GET',
      headers,
    });
    if (!response.ok) {
      return base;
    }
    const payload = (await response.json()) as {
      metaData?: Array<{key: string; value: string}>;
    };
    const byKey = new Map((payload.metaData ?? []).map(e => [e.key, e.value]));
    const local = byKey.get('local-region')?.trim();
    const regionUrl = local ? byKey.get(local) : undefined;
    if (regionUrl?.startsWith('http')) {
      return regionUrl.replace(/\/$/, '');
    }
    return base;
  } catch {
    return base;
  }
};

// ---- public API ----

// Create a new session for a numeric CloudMatch appId. Returns the initial
// (usually still-queuing) session; call pollGfnSession until it is ready.
export const createGfnSession = async (
  appId: string,
  token: string,
  settings: GfnStreamSettings = DEFAULT_GFN_SETTINGS,
): Promise<GfnSession> => {
  if (!/^\d+$/.test(appId)) {
    throw new Error(`Invalid GFN appId '${appId}' (must be numeric)`);
  }
  const clientId = uuid();
  const deviceId = getStableDeviceId();
  const originHeaders = buildCloudMatchHeaders({
    token,
    clientId,
    deviceId,
    includeOrigin: false,
  });
  const base = await resolveRegionBase(DEFAULT_BASE_URL, originHeaders);
  const body = buildSessionRequestBody(appId, settings, deviceId);
  const query = new URLSearchParams({
    keyboardLayout: 'en-US-qwerty',
    languageCode: 'en_US',
  }).toString();
  const response = await fetchCloudMatch(`${base}/v2/session?${query}`, {
    method: 'POST',
    headers: buildCloudMatchHeaders({
      token,
      clientId,
      deviceId,
      includeOrigin: true,
    }),
    body: JSON.stringify(body),
  });
  const payload = await readJson<RawCloudMatchResponse>(response);
  return toGfnSession(payload, {streamingBaseUrl: base, clientId, deviceId});
};

// Poll an existing session once. When the session becomes ready and a real
// server IP appears, re-poll directly against it for accurate signaling info.
export const pollGfnSession = async (
  session: GfnSession,
  token: string,
): Promise<GfnSession> => {
  const {clientId, deviceId, streamingBaseUrl, sessionId} = session;
  const headers = buildCloudMatchHeaders({
    token,
    clientId,
    deviceId,
    includeOrigin: false,
  });
  const response = await fetchCloudMatch(
    `${streamingBaseUrl}/v2/session/${sessionId}`,
    {method: 'GET', headers},
  );
  const payload = await readJson<RawCloudMatchResponse>(response);
  const next = toGfnSession(payload, {streamingBaseUrl, clientId, deviceId});

  // When ready and we learned a direct server IP, re-poll it directly so the
  // signaling endpoint is the real game server, not the zone load balancer.
  const ready = next.status === 2 || next.status === 3;
  const baseHost = streamingBaseUrl.replace(/^https?:\/\//, '').split('/')[0];
  if (ready && next.serverIp && next.serverIp !== baseHost) {
    try {
      const directBase = `https://${next.serverIp}`;
      const direct = await fetchCloudMatch(
        `${directBase}/v2/session/${sessionId}`,
        {method: 'GET', headers},
      );
      if (direct.ok) {
        const directPayload = JSON.parse(
          await direct.text(),
        ) as RawCloudMatchResponse;
        if (directPayload.requestStatus?.statusCode === 1) {
          return toGfnSession(directPayload, {
            streamingBaseUrl: directBase,
            clientId,
            deviceId,
          });
        }
      }
    } catch {}
  }
  return next;
};

// Delete/stop a session on the server.
export const stopGfnSession = async (
  session: GfnSession,
  token: string,
): Promise<void> => {
  const headers = buildCloudMatchHeaders({
    token,
    clientId: session.clientId,
    deviceId: session.deviceId,
    includeOrigin: false,
  });
  try {
    await fetchCloudMatch(
      `${session.streamingBaseUrl}/v2/session/${session.sessionId}`,
      {
        method: 'DELETE',
        headers,
      },
    );
  } catch {}
};

export type GfnLaunchProgress = {
  status: number;
  queuePosition?: number;
  seatSetupStep?: number;
};

// Orchestrate a launch: create the session, then poll until a seat is ready
// (status 2/3) or a terminal state / timeout. Reports queue progress via
// onProgress and aborts early if shouldCancel returns true.
export const launchGfnSession = async (
  appId: string,
  token: string,
  options: {
    settings?: GfnStreamSettings;
    onProgress?: (p: GfnLaunchProgress) => void;
    shouldCancel?: () => boolean;
    maxAttempts?: number;
  } = {},
): Promise<GfnSession> => {
  const settings = options.settings ?? DEFAULT_GFN_SETTINGS;
  let session = await createGfnSession(appId, token, settings);
  options.onProgress?.({
    status: session.status,
    queuePosition: session.queuePosition,
    seatSetupStep: session.seatSetupStep,
  });

  const maxAttempts = options.maxAttempts ?? 180; // ~3 min at 1s
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (options.shouldCancel?.()) {
      await stopGfnSession(session, token);
      throw new Error('cancelled');
    }
    if (session.status === 2 || session.status === 3) {
      if (session.signalingUrl) {
        return session;
      }
    }
    // Terminal states other than setup(1)/ready(2)/streaming(3)/cleanup(6).
    if (session.status > 3 && session.status !== 6) {
      throw new Error(`GFN session failed (status ${session.status})`);
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
    session = await pollGfnSession(session, token);
    options.onProgress?.({
      status: session.status,
      queuePosition: session.queuePosition,
      seatSetupStep: session.seatSetupStep,
    });
  }
  await stopGfnSession(session, token);
  throw new Error('GFN session did not become ready in time');
};
