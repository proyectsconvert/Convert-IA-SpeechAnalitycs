import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as fflate from "https://esm.sh/fflate@0.8.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

function waitUntil(promise: Promise<unknown>) {
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil?: (promise: Promise<unknown>) => void } }).EdgeRuntime;
  if (runtime?.waitUntil) runtime.waitUntil(promise);
  else promise.catch((error) => console.error("background task failed", error));
}

async function internalJobToken(jobId: string, connectionId: string) {
  const raw = new TextEncoder().encode(`${jobId}:${connectionId}:${supabaseServiceKey}`);
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", raw));
  return Array.from(hash).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function dispatchImportBatch(jobId: string, connectionId: string) {
  const url = `${supabaseUrl}/functions/v1/remote-import`;
  console.log(`[dispatchImportBatch] Re-encadenando job ${jobId} para conexión ${connectionId}...`);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${supabaseServiceKey}`,
        "Content-Type": "application/json",
        "x-remote-import-internal": supabaseServiceKey,
      },
      body: JSON.stringify({ action: "process-job", jobId }),
    });
    console.log(`[dispatchImportBatch] Respuesta de re-encadenamiento: ${res.status}`);
  } catch (err) {
    console.error(`[dispatchImportBatch] Error fatal re-encadenando:`, err);
  }
}

type Action = "save" | "test" | "scan" | "run" | "scheduled" | "update-automation" | "run-automation" | "process-job" | "stop" | "list-automations" | "save-automation" | "delete-automation" | "toggle-automation" | "save-manual-config" | "load-manual-config";
type RemoteFile = { path: string; name: string; size?: number; modifiedAt?: string; isDirectory?: boolean };
type Credentials = { password?: string; privateKey?: string };
type ImportCounters = { imported: number; failed: number; queued: number; remaining?: number; partial?: boolean };
type ScanPersistOptions = {
  runKey?: string;
  triggerSource?: "manual" | "scheduled";
  scheduledFor?: string | null;
  lockId?: string | null;
  responseFileLimit?: number;
};

const DEFAULT_RESPONSE_FILE_LIMIT = 25000;
// Ventana por lote ampliada: runImportJob se ejecuta en background (waitUntil),
// donde el runtime permite hasta ~150s. Usamos 25s por lote y luego re-encadenamos
// para dejar CPU libre entre iteraciones y evitar "WORKER_LIMIT".
const MAX_BATCH_RUNTIME_MS = 25000;
const DEFAULT_IMPORT_BATCH_SIZE = 40; // Grabaciones por lote

type ConnectionRow = {
  id: string;
  account_id: string;
  name: string;
  connection_type: "sftp" | "ftp";
  host: string;
  port: number;
  username: string;
  auth_method: "password" | "private_key";
  remote_root_path: string;
  credentials_encrypted?: string | null;
  import_filters?: Record<string, unknown> | null;
  default_prompt_id?: string | null;
  schedule_interval_minutes?: number | null;
  status: "active" | "inactive" | "error" | "testing";
};

type AutomationRow = {
  id: string;
  account_id: string;
  connection_id: string;
  name: string;
  is_enabled: boolean;
  import_filters: Record<string, unknown>;
  default_prompt_id: string | null;
  schedule_interval_minutes: number;
  last_run_at: string | null;
  next_run_at: string | null;
  last_run_status: string | null;
  last_run_message: string | null;
  automation_lock_id: string | null;
  updated_at: string;
};

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object") {
    const record = err as Record<string, unknown>;
    const parts = [record.message, record.details, record.hint, record.code]
      .map((v) => (v == null ? "" : String(v).trim()))
      .filter(Boolean);
    if (parts.length) return parts.join(" | ");
    try {
      return JSON.stringify(record);
    } catch (_) {
      return "Error interno no serializable";
    }
  }
  return String(err || "Error desconocido");
}

function nextRunAt(intervalMinutes?: number | null) {
  return new Date(Date.now() + Math.max(1, Number(intervalMinutes || 60)) * 60000).toISOString();
}

function nextRunAtAfter(intervalMinutes?: number | null, anchorIso?: string | null, leadSeconds?: number | null) {
  const intervalMs = Math.max(1, Number(intervalMinutes || 60)) * 60000;
  const anchorMs = anchorIso ? Date.parse(anchorIso) : NaN;
  let nextMs = Number.isFinite(anchorMs) ? anchorMs + intervalMs : Date.now() + intervalMs;
  const minimumMs = Date.now() + Math.max(0, Number(leadSeconds || 0)) * 1000;
  while (nextMs <= minimumMs) nextMs += intervalMs;
  return new Date(nextMs).toISOString();
}

function runKeyFor(target: ConnectionRow | AutomationRow, scheduledFor?: string | null) {
  const nextRun = (target as AutomationRow).next_run_at;
  const basis = scheduledFor || nextRun || new Date().toISOString().slice(0, 16);
  return `${target.id}:${basis}`;
}

function safePath(...parts: string[]) {
  return (
    parts
      .join("/")
      .replace(/\/+/g, "/")
      .replace(/([^:])\/\/+/g, "$1/")
      .replace(/\/$/, "") || "/"
  );
}

async function cryptoKey() {
  const material = new TextEncoder().encode(supabaseServiceKey.slice(0, 64));
  const hash = await crypto.subtle.digest("SHA-256", material);
  return crypto.subtle.importKey("raw", hash, "AES-GCM", false, ["encrypt", "decrypt"]);
}

function b64(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary);
}

function unb64(value: string) {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}

async function encryptCredentials(credentials: Credentials) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await cryptoKey();
  const encoded = new TextEncoder().encode(JSON.stringify(credentials));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded));
  return `${b64(iv)}.${b64(cipher)}`;
}

async function decryptCredentials(payload?: string | null): Promise<Credentials> {
  if (!payload) return {};
  const [ivRaw, cipherRaw] = payload.split(".");
  const key = await cryptoKey();
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(ivRaw) }, key, unb64(cipherRaw));
  return JSON.parse(new TextDecoder().decode(plain));
}

async function assertUserAccess(req: Request, accountId?: string) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) throw new Error("Unauthorized");
  const token = authHeader.replace("Bearer ", "");
  if (token === supabaseServiceKey) return { userId: null, isService: true };
  const userClient = createClient(supabaseUrl, supabaseAnonKey, { global: { headers: { Authorization: authHeader } } });
  const {
    data: { user },
    error,
  } = await userClient.auth.getUser();
  if (error || !user) throw new Error("Unauthorized");
  if (accountId) {
    const { data: allowed } = await userClient.rpc("user_has_account_access", {
      _user_id: user.id,
      _account_id: accountId,
    });
    const { data: isSuper } = await userClient.rpc("is_superadmin", { _user_id: user.id });
    if (!allowed && !isSuper) throw new Error("No tienes acceso a esta cuenta");
  }
  return { userId: user.id, isService: false };
}

function normalizeFilters(filters: Record<string, unknown> = {}) {
  // Priorizar allowedExtensions (que viene de la UI) sobre el array viejo 'extensions'
  const rawAllowed = filters.allowedExtensions ? String(filters.allowedExtensions) : null;
  const extensions = rawAllowed
    ? rawAllowed.split(",").map((x) => x.trim().toLowerCase()).filter(Boolean)
    : (Array.isArray(filters.extensions) ? filters.extensions.map(x => String(x).trim().toLowerCase()) : (filters.importDestination === "whatsapp" ? ["zip"] : ["mp3", "wav", "m4a", "ogg"]));

  const subfolders = Array.isArray(filters.subfolders)
    ? filters.subfolders.map(String).filter(Boolean)
    : String(filters.subfolders || "")
      .split("\n")
      .map((x) => x.trim())
      .filter(Boolean);

  return {
    startDate: String(filters.startDate || ""),
    endDate: String(filters.endDate || ""),
    mainFolder: String(filters.mainFolder || "/"),
    remotePath: String(filters.remotePath || ""),
    includeSubfolders: filters.includeSubfolders !== false,
    subfolders,
    filePattern: String(filters.filePattern || ""),
    extensions: extensions.map((x) => x.replace(/^\./, "")),
    minSizeKB: parseFloat(String(filters.minSizeKB || "0")) || 0,
    maxSizeKB: parseFloat(String(filters.maxSizeKB || "0")) || 0,
    campaign: String(filters.campaign || ""),
    segment: String(filters.segment || ""),
    extraParams: String(filters.extraParams || ""),
    maxScanLimit: (() => {
      const n = Number(filters.maxScanLimit);
      if (!Number.isFinite(n) || n <= 0) return 25000;
      // 0 o negativo = sin límite; permitir hasta 1,000,000
      return Math.min(Math.floor(n), 1_000_000);
    })(),
    importDestination: (String(filters.importDestination || "grabaciones")) as "grabaciones" | "whatsapp",
    minMessagesForAnalysis: Math.max(0, Number(filters.minMessagesForAnalysis) || 3),
    minClientMessagesForAnalysis: Math.max(0, Number(filters.minClientMessagesForAnalysis) || 1),
  };
}

function buildExcludedSummary(excluded: Array<{ name: string; path: string; reason?: string | null }>) {
  const reasonCounts = excluded.reduce<Record<string, number>>((acc, f) => {
    const reason = String(f.reason || "No cumple filtros");
    acc[reason] = (acc[reason] || 0) + 1;
    return acc;
  }, {});

  return {
    excluded_preview: excluded.slice(0, 250).map((f) => ({ file: f.name, path: f.path, reason: f.reason })),
    excluded_reason_counts: reasonCounts,
    excluded_total_logged: excluded.length,
  };
}

function isExtensionOnlyPattern(patterns: string): boolean {
  // Detecta si el patrón solo contiene wildcards de extensión como "*.mp3, *.wav"
  // En ese caso, el filtro de extensiones es suficiente y más confiable.
  const parts = patterns.split(",").map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return false;
  return parts.every((p) => /^\*\.[a-zA-Z0-9]+$/.test(p));
}

function wildcardToRegExp(patterns: string) {
  const parts = patterns
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (!parts.length) return null;
  // Si todos los patrones son simplemente "*.ext", no usar regex
  // ya que el filtro de extensiones se encarga de eso
  if (isExtensionOnlyPattern(patterns)) return null;
  try {
    const escaped = parts.map((p) => {
      // Escapar caracteres especiales de regex excepto * y ?
      let result = "";
      for (const char of p) {
        if (".+^${}()|[]\\".includes(char)) {
          result += "\\" + char;
        } else if (char === "*") {
          result += ".*";
        } else if (char === "?") {
          result += ".";
        } else {
          result += char;
        }
      }
      return result;
    });
    return new RegExp(`^(${escaped.join("|")})$`, "i");
  } catch (e) {
    console.error("Error al construir regex del patrón:", e, "patterns:", patterns);
    return null;
  }
}

let _filterDebugDone = false;

function passesFilters(file: RemoteFile, filters: ReturnType<typeof normalizeFilters>) {
  if (file.isDirectory) return { ok: false, reason: "Es una carpeta" };

  // Debug: imprimir info del primer archivo para diagnóstico
  if (!_filterDebugDone) {
    _filterDebugDone = true;
    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    console.log("[passesFilters DEBUG] Primer archivo:", {
      name: file.name,
      ext,
      size: file.size,
      sizeKB: file.size !== undefined ? (Number(file.size) / 1024).toFixed(2) : "N/A",
      filePattern: filters.filePattern,
      isExtOnly: isExtensionOnlyPattern(filters.filePattern),
      extensions: filters.extensions,
      minSizeKB: filters.minSizeKB,
      maxSizeKB: filters.maxSizeKB,
    });
  }

  // 1. Verificar patrón de archivo si existe (solo patrones complejos, no "*.ext")
  const pattern = filters.filePattern?.trim();
  if (pattern && pattern !== "*" && pattern !== "*.*") {
    const rx = wildcardToRegExp(pattern);
    if (rx && !rx.test(file.name)) {
      return { ok: false, reason: "Patrón de nombre no coincide" };
    }
  }

  // 2. Verificar extensión
  const ext = file.name.split(".").pop()?.toLowerCase() || "";
  if (filters.extensions.length > 0 && !filters.extensions.includes(ext)) {
    return { ok: false, reason: "Extensión no permitida" };
  }

  // 3. Fechas
  const modified = file.modifiedAt ? new Date(file.modifiedAt) : null;
  if (filters.startDate && modified && modified < new Date(`${filters.startDate}T00:00:00`))
    return { ok: false, reason: "Fuera de rango de fecha" };
  if (filters.endDate && modified && modified > new Date(`${filters.endDate}T23:59:59`))
    return { ok: false, reason: "Fuera de rango de fecha" };

  // 4. Tamaño en KB (file.size viene en bytes del SFTP)
  const sizeInBytes = file.size !== undefined ? Number(file.size) : undefined;
  if (sizeInBytes !== undefined) {
    const sizeInKB = sizeInBytes / 1024;
    if (filters.minSizeKB > 0 && sizeInKB < filters.minSizeKB) {
      return { ok: false, reason: "Tamaño inferior al mínimo" };
    }
    if (filters.maxSizeKB > 0 && sizeInKB > filters.maxSizeKB) {
      return { ok: false, reason: "Tamaño superior al máximo" };
    }
  }

  return { ok: true, reason: null };
}

function contentTypeFor(fileName: string) {
  const ext = fileName.split(".").pop()?.toLowerCase();
  if (ext === "wav") return "audio/wav";
  if (ext === "m4a") return "audio/mp4";
  if (ext === "ogg") return "audio/ogg";
  if (ext === "mp3") return "audio/mpeg";
  return "application/octet-stream";
}

async function withSftp<T>(connection: ConnectionRow, credentials: Credentials, fn: (client: any) => Promise<T>) {
  const mod = await import("npm:ssh2-sftp-client@10.0.3");
  const Client = mod.default;
  const client = new Client();

  const host = String(connection.host || "").trim();
  const username = String(connection.username || "").trim();
  const password = connection.auth_method === "password" ? String(credentials.password || "").trim() : undefined;
  const privateKey = connection.auth_method === "private_key" ? credentials.privateKey : undefined;

  await client.connect({
    host,
    port: Number(connection.port) || 22,
    username,
    password,
    privateKey,
    readyTimeout: 15000,
    tryKeyboard: true,
    algorithms: {
      serverHostKey: [
        "ssh-ed25519",
        "ecdsa-sha2-nistp256",
        "ecdsa-sha2-nistp384",
        "ecdsa-sha2-nistp521",
        "rsa-sha2-512",
        "rsa-sha2-256",
        "ssh-rsa",
      ],
      kex: [
        "curve25519-sha256",
        "curve25519-sha256@libssh.org",
        "ecdh-sha2-nistp256",
        "ecdh-sha2-nistp384",
        "ecdh-sha2-nistp521",
        "diffie-hellman-group-exchange-sha256",
        "diffie-hellman-group14-sha256",
        "diffie-hellman-group16-sha512",
        "diffie-hellman-group18-sha512",
      ],
    },
  });
  try {
    return await fn(client);
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function withFtp<T>(connection: ConnectionRow, credentials: Credentials, fn: (client: any) => Promise<T>) {
  const ftp = await import("npm:basic-ftp@5.0.5");
  const client = new ftp.Client(20000);
  client.ftp.verbose = false;
  await client.access({
    host: connection.host,
    port: connection.port,
    user: connection.username,
    password: credentials.password,
    secure: false,
  });
  try {
    return await fn(client);
  } finally {
    client.close();
  }
}

async function listRemoteFiles(
  connection: ConnectionRow,
  credentials: Credentials,
  rawFilters: Record<string, unknown>,
) {
  const filters = normalizeFilters(rawFilters);
  const roots = [
    safePath(connection.remote_root_path, filters.remotePath || filters.mainFolder),
    ...filters.subfolders.map((s) => safePath(connection.remote_root_path, s)),
  ];
  const maxFiles = filters.maxScanLimit;
  // Use a hard ceiling large enough to cover the entire directory for accurate date sorting,
  // without artificially capping the collection based on maxFiles.
  const internalCeiling = 100000;
  const files: RemoteFile[] = [];
  const MAX_DEPTH = 8;
  const SCAN_TIMEOUT_MS = 60000; // 60s timeout
  const scanStart = Date.now();

  const isTimedOut = () => Date.now() - scanStart > SCAN_TIMEOUT_MS;

  const addSftpDir = async (client: any, dir: string, depth = 0) => {
    if (files.length >= internalCeiling || isTimedOut() || depth > MAX_DEPTH) return;
    try {
      const entries = await client.list(dir);
      for (const item of entries) {
        if (files.length >= internalCeiling || isTimedOut()) return;
        const path = safePath(dir, item.name);
        if (item.type === "d" && filters.includeSubfolders) await addSftpDir(client, path, depth + 1);
        else if (item.type !== "d")
          files.push({
            path,
            name: item.name,
            size: item.size,
            modifiedAt: item.modifyTime ? new Date(item.modifyTime).toISOString() : undefined,
          });
      }
    } catch (err) {
      console.warn(`Error reading sftp dir ${dir}:`, err);
    }
  };

  const addFtpDir = async (client: any, dir: string, depth = 0) => {
    if (files.length >= internalCeiling || isTimedOut() || depth > MAX_DEPTH) return;
    try {
      const entries = await client.list(dir);
      for (const item of entries) {
        if (files.length >= internalCeiling || isTimedOut()) return;
        const path = safePath(dir, item.name);
        if (item.isDirectory && filters.includeSubfolders) await addFtpDir(client, path, depth + 1);
        else if (!item.isDirectory)
          files.push({
            path,
            name: item.name,
            size: item.size,
            modifiedAt: item.modifiedAt ? new Date(item.modifiedAt).toISOString() : undefined,
          });
      }
    } catch (err) {
      console.warn(`Error reading ftp dir ${dir}:`, err);
    }
  };

  if (connection.connection_type === "sftp") {
    await withSftp(connection, credentials, async (client) => {
      for (const root of roots) {
        if (isTimedOut()) break;
        await addSftpDir(client, root);
      }
    });
  } else {
    await withFtp(connection, credentials, async (client) => {
      for (const root of roots) {
        if (isTimedOut()) break;
        await addFtpDir(client, root);
      }
    });
  }
  if (isTimedOut()) console.warn(`Scan timed out after ${SCAN_TIMEOUT_MS}ms, returning ${files.length} newest files found so far`);

  // Sort by modifiedAt descending so the scan limit always keeps the NEWEST files
  files.sort((a, b) => {
    const ta = a.modifiedAt ? new Date(a.modifiedAt).getTime() : 0;
    const tb = b.modifiedAt ? new Date(b.modifiedAt).getTime() : 0;
    return tb - ta; // newest first
  });

  // Recortar al límite de escaneo configurado: SOLO evaluamos los N archivos
  // más recientes (por modifiedAt desc). Esto evita saturar CPU cuando el
  // directorio contiene decenas de miles de archivos antiguos.
  if (maxFiles > 0 && files.length > maxFiles) {
    console.log(
      `[listRemoteFiles] Directorio con ${files.length} archivos. Recortando a los ${maxFiles} más recientes (límite de escaneo).`,
    );
    files.length = maxFiles;
  }

  return files;
}

async function downloadRemoteFile(
  connection: ConnectionRow,
  credentials: Credentials,
  path: string,
): Promise<Uint8Array> {
  if (connection.connection_type === "sftp") {
    return await withSftp(connection, credentials, async (client) => {
      const data = await client.get(path);
      return data instanceof Uint8Array ? data : new Uint8Array(data);
    });
  }
  return await withFtp(connection, credentials, async (client) => {
    const { Writable } = await import("node:stream");
    const chunks: Uint8Array[] = [];
    const writable = new Writable({
      write(chunk, _encoding, callback) {
        chunks.push(chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk));
        callback();
      },
    });
    await client.downloadTo(writable, path);
    const total = chunks.reduce((sum, c) => sum + c.length, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      out.set(chunk, offset);
      offset += chunk.length;
    }
    return out;
  });
}

async function getConnection(supabase: any, connectionId: string): Promise<ConnectionRow> {
  const { data, error } = await supabase.from("remote_connections").select("*").eq("id", connectionId).single();
  if (error || !data) throw new Error("No se encontró la conexión remota");
  return data as ConnectionRow;
}

async function scanConnection(
  supabase: any,
  connection: ConnectionRow,
  credentials: Credentials,
  filters: Record<string, unknown>,
  promptId: string | null,
  userId: string | null,
  persist = true,
  persistOptions: ScanPersistOptions = {},
) {
  const normalized = normalizeFilters(filters);
  _filterDebugDone = false; // Reset debug para cada scan
  console.log("[scanConnection] Filtros normalizados:", JSON.stringify({
    filePattern: normalized.filePattern,
    isExtOnly: isExtensionOnlyPattern(normalized.filePattern),
    extensions: normalized.extensions,
    minSizeKB: normalized.minSizeKB,
    maxSizeKB: normalized.maxSizeKB,
    remotePath: normalized.remotePath,
    mainFolder: normalized.mainFolder,
  }));
  const listed = await listRemoteFiles(connection, credentials, filters);
  const baseEvaluated = listed.map((file) => ({ file, filterResult: passesFilters(file, normalized) }));
  const remotePaths = listed.map((f) => f.path);
  const fileNames = listed.map((f) => f.name);
  const isWhatsapp = normalized.importDestination === "whatsapp";
  const targetTable = isWhatsapp ? "whatsapp_conversations" : "audio_files";
  const targetField = isWhatsapp ? "external_id" : "file_name";

  // OPTIMIZACIÓN CPU: en lugar de cargar TODO el historial (puede ser 80k+ filas
  // y disparar "CPU Time exceeded"), consultamos solo los paths/nombres del lote
  // actual usando .in() en chunks. Esto reduce el trabajo de O(historial) a O(lote).
  // Nota: chunk pequeño para evitar "Bad Request" por URL demasiado larga
  // en PostgREST (.in() serializa los valores en query string, límite ~8KB).
  const CHUNK = 80;
  const chunked = <T,>(arr: T[]): T[][] => {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += CHUNK) out.push(arr.slice(i, i + CHUNK));
    return out;
  };

  const remoteSet = new Set<string>();
  console.log(`[scanConnection] Consultando duplicados remotos para ${remotePaths.length} rutas del lote...`);
  for (const chunk of chunked(remotePaths)) {
    const { data, error } = await supabase
      .from("remote_import_files")
      .select("remote_path")
      .eq("account_id", connection.account_id)
      .in("remote_path", chunk);
    if (error) throw error;
    (data || []).forEach((r: any) => remoteSet.add(r.remote_path));
  }
  console.log(`[scanConnection] Duplicados remotos encontrados en lote: ${remoteSet.size}.`);

  const audioSet = new Set<string>();
  const waExternalSet = new Set<string>();

  if (isWhatsapp) {
    // Para WhatsApp el external_id suele ser el basename del ZIP
    const waCandidates = Array.from(new Set(
      fileNames.map((n) => n.replace(/\.zip$/i, "").trim()).filter(Boolean)
    ));
    console.log(`[scanConnection] WA: consultando ${waCandidates.length} external_id candidatos...`);
    for (const chunk of chunked(waCandidates)) {
      const { data, error } = await supabase
        .from("whatsapp_conversations")
        .select("external_id")
        .eq("account_id", connection.account_id)
        .in("external_id", chunk);
      if (error) throw error;
      (data || []).forEach((r: any) => {
        const v = String(r.external_id || "").trim();
        if (v) {
          waExternalSet.add(v);
          waExternalSet.add(v.toLowerCase());
        }
      });
    }
    console.log(`[scanConnection] WA: ${waExternalSet.size} external_id ya registrados en el lote.`);
  } else {
    // Para audio buscamos por file_name (variantes normalizadas del lote)
    const audioCandidates = Array.from(new Set(fileNames.flatMap((n) => {
      const norm = n.normalize("NFC").trim();
      const noExt = norm.includes(".") ? norm.replace(/\.[^/.]+$/, "") : norm;
      return [norm, noExt];
    }).filter(Boolean)));
    console.log(`[scanConnection] Consultando ${audioCandidates.length} nombres de archivo candidatos en ${targetTable}...`);
    for (const chunk of chunked(audioCandidates)) {
      const { data, error } = await supabase
        .from(targetTable)
        .select(targetField)
        .eq("account_id", connection.account_id)
        .in(targetField, chunk);
      if (error) throw error;
      (data || []).forEach((r: any) => {
        const val = String(r[targetField] || "").normalize("NFC").trim().toLowerCase();
        if (val) {
          audioSet.add(val);
          const valNoExt = val.includes(".") ? val.replace(/\.[^/.]+$/, "") : val;
          audioSet.add(valNoExt);
          audioSet.add(val.replace(/[^a-z0-9]/g, ""));
          audioSet.add(valNoExt.replace(/[^a-z0-9]/g, ""));
        }
      });
    }
    console.log(`[scanConnection] Duplicados de audio en lote: ${audioSet.size} variantes.`);
  }



  const localSeen = new Set<string>();

  const evaluated = baseEvaluated.map(({ file, filterResult }) => {
    const lowerName = file.name.normalize("NFC").trim().toLowerCase();
    const nameNoExt = lowerName.includes(".") ? lowerName.replace(/\.[^/.]+$/, "") : lowerName;
    const slugName = lowerName.replace(/[^a-z0-9]/g, "");
    const slugNoExt = nameNoExt.replace(/[^a-z0-9]/g, "");

    let ok = true;
    let reason = null;

    // 1. Prioridad Máxima: Duplicidad ya importada
    //    - Audio: por nombre (con/sin extensión, normalizado)
    //    - WhatsApp: por external_id (basename del ZIP === id de la conversación)
    const waBaseId = isWhatsapp ? nameNoExt : "";
    if (
      !isWhatsapp && (
        audioSet.has(lowerName) ||
        audioSet.has(nameNoExt) ||
        audioSet.has(slugName) ||
        audioSet.has(slugNoExt)
      )
    ) {
      ok = false;
      reason = "Archivo ya existe en la plataforma (Duplicado)";
    }
    else if (
      isWhatsapp && waBaseId && (
        waExternalSet.has(waBaseId) ||
        waExternalSet.has(waBaseId.toLowerCase()) ||
        waExternalSet.has(file.name.replace(/\.zip$/i, ""))
      )
    ) {
      ok = false;
      reason = "Conversación ya importada (external_id duplicado)";
    }
    // 2. Duplicidad en el mismo lote
    else if (localSeen.has(lowerName) || localSeen.has(nameNoExt)) {
      ok = false;
      reason = "Duplicado en el mismo lote SFTP";
    }
    // 3. Filtros técnicos (tamaño, extensión, etc)
    else if (!filterResult.ok) {
      ok = false;
      reason = filterResult.reason;
    }

    if (ok) {
      localSeen.add(lowerName);
      localSeen.add(nameNoExt);
    }

    return { ...file, ok, reason };
  });
  let eligible = evaluated.filter((f) => f.ok);
  let excluded = evaluated.filter((f) => !f.ok);

  const maxScanLimit = normalized.maxScanLimit;
  if (eligible.length > maxScanLimit) {
    console.log(`[scanConnection] Recortando ${eligible.length} archivos elegibles al límite máximo de ${maxScanLimit}.`);
    const excess = eligible.slice(maxScanLimit).map(f => ({ ...f, ok: false, reason: "Excede límite de escaneo" }));
    eligible = eligible.slice(0, maxScanLimit);
    excluded = [...excluded, ...excess];
  }

  let jobId: string | null = null;
  if (persist) {
    const runKey = persistOptions.runKey ?? null;
    if (runKey) {
      const { data: existing, error: existingError } = await supabase
        .from("remote_import_jobs")
        .select("id,status,files_found,files_eligible,files_excluded,files_imported")
        .eq("connection_id", connection.id)
        .eq("run_key", runKey)
        .maybeSingle();
      if (existingError) throw existingError;
      if (existing) {
        return {
          jobId: existing.id,
          filesFound: existing.files_found ?? 0,
          filesEligible: existing.files_eligible ?? 0,
          filesExcluded: existing.files_excluded ?? 0,
          excludedPreview: [],
          files: [],
          deduped: true,
          status: existing.status,
        };
      }
    }
    const isAutomationRun = persistOptions.triggerSource === "scheduled" || !!persistOptions.runKey || !userId;
    const { data: job, error } = await supabase
      .from("remote_import_jobs")
      .insert({
        account_id: connection.account_id,
        connection_id: connection.id,
        prompt_id: promptId,
        status: eligible.length > 0 ? (isAutomationRun ? "importing" : "ready") : "completed",
        run_key: runKey,
        trigger_source: persistOptions.triggerSource ?? (userId ? "manual" : "scheduled"),
        scheduled_for: persistOptions.scheduledFor ?? null,
        lock_id: persistOptions.lockId ?? null,
        runner_started_at: new Date().toISOString(),
        target_module: normalized.importDestination === "whatsapp" ? "whatsapp" : "audio",
        filters: normalized,
        files_found: evaluated.length,
        files_eligible: eligible.length,
        files_excluded: excluded.length,
        summary: buildExcludedSummary(excluded),
        created_by: userId,
      })
      .select()
      .single();
    if (error) throw error;
    jobId = job.id;
    const newExcluded = excluded.filter(f => !remoteSet.has(f.path));
    if (newExcluded.length) {
      console.log(`[scanConnection] Guardando ${newExcluded.length} nuevos archivos excluidos/vistos...`);
      for (let i = 0; i < newExcluded.length; i += 1000) {
        const chunk = newExcluded.slice(i, i + 1000);
        await supabase.from("remote_import_files").upsert(
          chunk.map((f) => ({
            account_id: connection.account_id,
            import_job_id: jobId,
            connection_id: connection.id,
            remote_path: f.path,
            file_name: f.name,
            file_size_bytes: f.size ?? null,
            modified_at: f.modifiedAt ?? null,
            status: "excluded",
            excluded_reason: f.reason || "No cumple filtros",
            error_message: f.reason || "No cumple filtros",
            metadata: { source: "remote_import", filter_rejected: true, reason: f.reason || "No cumple filtros" },
          })),
          { onConflict: "import_job_id,remote_path" }
        );
      }
    }
    const insertableFiles = evaluated.filter((f) => f.ok);
    if (insertableFiles.length) {
      for (let i = 0; i < insertableFiles.length; i += 500) {
        const chunk = insertableFiles.slice(i, i + 500);
        await supabase.from("remote_import_files").upsert(
          chunk.map((f) => ({
            account_id: connection.account_id,
            import_job_id: jobId,
            connection_id: connection.id,
            remote_path: f.path,
            file_name: f.name,
            file_size_bytes: f.size ?? null,
            modified_at: f.modifiedAt ?? null,
            status: "pending_import",
            excluded_reason: null,
            metadata: { source: "remote_import" },
          })),
          { onConflict: "import_job_id,remote_path" }
        );
      }
    }
  }
  return {
    jobId,
    filesFound: evaluated.length,
    filesEligible: eligible.length,
    filesExcluded: excluded.length,
    excludedPreview: excluded.slice(0, 50),
    excludedReasons: buildExcludedSummary(excluded).excluded_reason_counts,
    files: evaluated.slice(0, Math.max(0, persistOptions.responseFileLimit ?? DEFAULT_RESPONSE_FILE_LIMIT)),
    responseTruncated: evaluated.length > Math.max(0, persistOptions.responseFileLimit ?? DEFAULT_RESPONSE_FILE_LIMIT),
  };
}

// ========== WHATSAPP ZIP PROCESSING ==========
function decodeHtmlEntities(value: string) {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function parseHtmlWhatsappMessages(htmlContent: string | null, firstAgentName: string, contactName: string) {
  if (!htmlContent) return [];
  const text = decodeHtmlEntities(
    htmlContent
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<(br|\/p|\/div|\/li|\/tr)\b[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/[\t ]+/g, " ")
      .replace(/\n{2,}/g, "\n")
  );
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const parsed: Array<{ sender_type: string; agent_name: string; timestamp: string; message_type: string; content: string; external_message_id: string; is_transfer: boolean }> = [];
  const rx = /^(?:\[)?(\d{1,4}[\/-]\d{1,2}[\/-]\d{1,4})(?:,)?\s+(\d{1,2}:\d{2}(?::\d{2})?)(?:\])?\s*-?\s*([^:]{1,120}):\s*(.+)$/;
  const toIso = (date: string, time: string) => {
    const parts = date.includes("-") ? date.split("-") : date.split("/");
    let y: string, m: string, d: string;
    if (parts[0].length === 4) [y, m, d] = parts;
    else[d, m, y] = parts;
    if (y.length === 2) y = `20${y}`;
    const t = new Date(`${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}T${time.length === 5 ? `${time}:00` : time}`);
    return Number.isNaN(t.getTime()) ? new Date().toISOString() : t.toISOString();
  };
  for (const line of lines) {
    const match = line.match(rx);
    if (!match) continue;
    const sender = match[3].trim();
    const content = match[4].trim();
    const senderLower = sender.toLowerCase();
    const agentLower = String(firstAgentName || "").toLowerCase();
    const contactLower = String(contactName || "").toLowerCase();
    const isAgent = Boolean(agentLower && senderLower.includes(agentLower)) || (!senderLower.includes(contactLower) && !/^\+?\d/.test(senderLower));
    parsed.push({
      sender_type: isAgent ? "Agente" : "Contacto",
      agent_name: isAgent ? sender : "",
      timestamp: toIso(match[1], match[2]),
      message_type: "Texto",
      content,
      external_message_id: `html-${parsed.length}-${match[1]}-${match[2]}`,
      is_transfer: false,
    });
  }
  return parsed;
}

async function processWhatsappZip(
  supabase: any,
  accountId: string,
  zipFileName: string,
  jsonData: any,
  htmlContent: string | null,
  promptId: string | null,
  minMsgs: number,
  minClientMsgs: number,
): Promise<{ conversationId: string; autoAnalyze: boolean; totalMessages: number; clientMessages: number }> {
  const zipBaseName = zipFileName.replace(/\.zip$/i, "");

  // --- Parse events from JSON first; HTML is persisted as raw metadata for audit/opening ---
  const events: any[] = Array.isArray(jsonData?.events) ? jsonData.events : [];
  const messages: Array<{
    sender_type: string;
    agent_name: string;
    timestamp: string;
    message_type: string;
    content: string;
    external_message_id: string;
    is_transfer: boolean;
  }> = [];

  for (const evt of events) {
    const text = evt.message?.text;
    if (!text || typeof text !== "string") continue;
    const isAgent = evt.creator === "agent";
    const agentRaw = evt.agent || "";
    const agentName = agentRaw.split("@")[0] || agentRaw;
    messages.push({
      sender_type: isAgent ? "Agente" : "Contacto",
      agent_name: isAgent ? agentName : "",
      timestamp: evt.timestamp || new Date().toISOString(),
      message_type: evt.message?.msgtype || "text",
      content: text,
      external_message_id: evt.message?.id || "",
      is_transfer: false,
    });
  }

  // --- Extract metadata ---
  const agentHistoryKeys = Object.keys(jsonData?.agentHistory || {});
  const firstAgentRaw = agentHistoryKeys[0] || jsonData?.__last_step?.agent || "";
  const firstAgentName = firstAgentRaw.split("@")[0] || firstAgentRaw;
  const campaignRaw = jsonData?.campaign || "";
  const campaignName = campaignRaw.split("@")[0] || campaignRaw;
  const contactAddress = jsonData?.contactAddress || jsonData?.interactionData?.chatId || "";
  const contactName = jsonData?.interactionData?.contactName || jsonData?.properties?.display_name || contactAddress;
  const externalId = zipBaseName;
  const startDate = jsonData?.startTimestampReadable || null;
  const initiative = jsonData?.initiative || "OUTBOUND";
  const disposition = jsonData?.dispositionCode || "";
  const vcc = jsonData?.VCC || "";
  const accountName = jsonData?.interactionData?.accountName || "";

  const totalMessages = messages.length;
  const clientMessages = messages.filter(m => m.sender_type === "Contacto").length;
  const agentMessages = messages.filter(m => m.sender_type === "Agente").length;

  if (messages.length === 0 && htmlContent) {
    const htmlMessages = parseHtmlWhatsappMessages(htmlContent, firstAgentName, contactName);
    messages.push(...htmlMessages);
  }

  const finalTotalMessages = messages.length;
  const finalClientMessages = messages.filter(m => m.sender_type === "Contacto").length;
  const finalAgentMessages = messages.filter(m => m.sender_type === "Agente").length;

  // --- Calculate duration ---
  let duracionSec = 0;
  if (messages.length >= 2) {
    const first = new Date(messages[0].timestamp).getTime();
    const last = new Date(messages[messages.length - 1].timestamp).getTime();
    if (!isNaN(first) && !isNaN(last)) duracionSec = Math.round((last - first) / 1000);
  }

  // --- Check for duplicate ---
  const { data: existing } = await supabase
    .from("whatsapp_conversations")
    .select("id")
    .eq("account_id", accountId)
    .eq("external_id", externalId)
    .maybeSingle();

  let conversationId: string;
  if (existing) {
    conversationId = existing.id;
    console.log(`processWhatsappZip: Conversación existente (external_id=${externalId}), sincronizando mensajes/metadata.`);
    await supabase
      .from("whatsapp_conversations")
      .update({
        contact_name: contactName,
        phone_number: contactAddress,
        campaign: campaignName,
        first_agent_name: firstAgentName,
        start_date: startDate ? (startDate.includes("T") ? startDate : new Date(startDate.replace(/-/g, "/")).toISOString()) : new Date().toISOString(),
        initiate_type: initiative,
        total_messages: finalTotalMessages,
        mensajes_cliente: finalClientMessages,
        mensajes_agente: finalAgentMessages,
        duracion_conversacion: duracionSec,
        canal: "whatsapp",
        initial_msg_text: messages[0]?.content?.substring(0, 500) || null,
        metadata: {
          source: "sftp_import",
          zip_file_name: zipFileName,
          disposition,
          vcc,
          account_name: accountName,
          json_id: jsonData?.id,
          json_raw: jsonData || null,
          html_raw: htmlContent || null,
        },
      })
      .eq("id", conversationId);
  } else {
    // --- Insert conversation ---
    const { data: conv, error: convErr } = await supabase
      .from("whatsapp_conversations")
      .insert({
        account_id: accountId,
        external_id: externalId,
        contact_name: contactName,
        phone_number: contactAddress,
        campaign: campaignName,
        first_agent_name: firstAgentName,
        start_date: startDate ? (startDate.includes("T") ? startDate : new Date(startDate.replace(/-/g, "/")).toISOString()) : new Date().toISOString(),
        initiate_type: initiative,
        total_messages: finalTotalMessages,
        mensajes_cliente: finalClientMessages,
        mensajes_agente: finalAgentMessages,
        duracion_conversacion: duracionSec,
        status: "no_analizado",
        canal: "whatsapp",
        initial_msg_text: messages[0]?.content?.substring(0, 500) || null,
        metadata: {
          source: "sftp_import",
          zip_file_name: zipFileName,
          disposition,
          vcc,
          account_name: accountName,
          json_id: jsonData?.id,
          json_raw: jsonData || null,
          html_raw: htmlContent || null,
        },
      })
      .select()
      .single();

    if (convErr) throw new Error(`Error creando conversación WhatsApp: ${convErr.message}`);
    conversationId = conv.id;

    // Incrementar contador de consumo solo cuando se crea una nueva conversación
    try {
      const { error: incErr } = await supabase.rpc("increment_usage", {
        p_account_id: accountId,
        p_whatsapp_conversations: 1,
      });
      if (incErr) console.warn(`processWhatsappZip: increment_usage error: ${incErr.message}`);
    } catch (err: any) {
      console.warn(`processWhatsappZip: increment_usage threw: ${err?.message || err}`);
    }
  }
  console.log(`processWhatsappZip: Conversación creada/sincronizada ${conversationId} (${finalTotalMessages} msgs, ${finalClientMessages} del cliente)`);

  // --- Replace messages in batches so ZIP re-runs repair empty/incomplete conversations ---
  if (messages.length > 0) {
    await supabase.from("whatsapp_messages").delete().eq("conversation_id", conversationId);
    for (let i = 0; i < messages.length; i += 200) {
      const batch = messages.slice(i, i + 200).map((m, idx) => ({
        conversation_id: conversationId,
        account_id: accountId,
        sender_type: m.sender_type,
        sender_name: m.sender_type === "Agente" ? m.agent_name || "Agente" : contactName,
        agent_name: m.agent_name || null,
        timestamp: m.timestamp.includes("T") ? m.timestamp : new Date(m.timestamp.replace(/-/g, "/")).toISOString(),
        message_type: m.message_type,
        message_text: m.content,
        content: m.content,
        external_message_id: m.external_message_id || null,
        is_transfer: m.is_transfer,
        metadata: { sequence_number: i + idx, source: "sftp_zip_json" },
      }));
      const { error: msgErr } = await supabase.from("whatsapp_messages").insert(batch);
      if (msgErr) throw new Error(`Error insertando mensajes WA batch ${i}: ${msgErr.message}`);
    }
  }

  // --- Decide auto-analysis ---
  const autoAnalyze = finalTotalMessages >= minMsgs && finalClientMessages >= minClientMsgs;
  console.log(`processWhatsappZip: autoAnalyze=${autoAnalyze} (total=${finalTotalMessages}>=${minMsgs}, client=${finalClientMessages}>=${minClientMsgs})`);

  return { conversationId, autoAnalyze, totalMessages: finalTotalMessages, clientMessages: finalClientMessages };
}

async function runImportJob(
  supabase: any,
  jobId: string,
  options: { maxItems?: number } = {},
): Promise<ImportCounters> {
  console.log(`[runImportJob] STARTING job: ${jobId}`);
  const { data: job, error: jobErr } = await supabase.from("remote_import_jobs").select("*").eq("id", jobId).single();
  if (jobErr || !job) throw new Error("No se encontró la importación");

  if (job.status === "cancelled") {
    console.log(`runImportJob [${jobId}]: El trabajo ya está cancelado.`);
    return { imported: 0, failed: 0, queued: 0, partial: false };
  }

  let connection;
  let credentials;
  try {
    connection = await getConnection(supabase, job.connection_id);
    credentials = await decryptCredentials(connection.credentials_encrypted);
  } catch (err) {
    console.error(`runImportJob [${jobId}]: Error obteniendo credenciales:`, err);
    throw new Error("No se pudo autenticar con la conexión remota");
  }

  await supabase
    .from("remote_import_jobs")
    .update({ status: "importing", started_at: new Date().toISOString() })
    .eq("id", jobId);
  const isWhatsapp = (job.filters?.importDestination === "whatsapp");
  const targetTable = isWhatsapp ? "whatsapp_conversations" : "audio_files";
  const targetField = isWhatsapp ? "external_id" : "file_name";

  // Recuperar archivos que quedaron marcados como importando por una función cancelada/timeout.
  // No toca los recién reclamados para evitar doble procesamiento concurrente.
  const staleImportingBefore = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  await supabase
    .from("remote_import_files")
    .update({ status: "pending_import", updated_at: new Date().toISOString() })
    .eq("import_job_id", jobId)
    .eq("status", "importing")
    .lt("updated_at", staleImportingBefore);

  // ===== DEDUP SET: Se llena SOLO con los nombres del lote actual =====
  // Antes se paginaba TODA la tabla audio_files por cuenta (40k+ filas por Hughes)
  // en cada re-encadenamiento del job. Eso saturaba CPU y RAM y hacía que los
  // lotes se quedaran colgados en 0 archivos importados.
  // Ahora consultamos solo los nombres del lote pendiente vía .in() en chunks.
  const audioSet = new Set<string>();
  const CHUNK_AUDIO = 80;
  const loadAudioExistingForBatch = async (pendingItems: any[]) => {
    audioSet.clear();
    if (isWhatsapp) return;
    const candidates = Array.from(new Set(pendingItems.flatMap((it) => {
      const norm = String(it.file_name || "").normalize("NFC").trim();
      const noExt = norm.includes(".") ? norm.replace(/\.[^/.]+$/, "") : norm;
      return [norm, noExt].filter(Boolean);
    })));
    if (!candidates.length) return;
    for (let i = 0; i < candidates.length; i += CHUNK_AUDIO) {
      const chunk = candidates.slice(i, i + CHUNK_AUDIO);
      const { data, error } = await supabase
        .from(targetTable)
        .select(targetField)
        .eq("account_id", connection.account_id)
        .in(targetField, chunk);
      if (error) throw error;
      (data || []).forEach((r: any) => {
        const val = String(r[targetField] || "").normalize("NFC").trim().toLowerCase();
        if (val) {
          audioSet.add(val);
          const valNoExt = val.includes(".") ? val.replace(/\.[^/.]+$/, "") : val;
          audioSet.add(valNoExt);
          audioSet.add(val.replace(/[^a-z0-9]/g, ""));
          audioSet.add(valNoExt.replace(/[^a-z0-9]/g, ""));
        }
      });
    }
    console.log(`[runImportJob] Dedup grabaciones (por lote): ${audioSet.size} variantes ya existentes.`);
  };

  // ===== WA DEDUP: solo validar los external_id del lote actual =====
  // Antes se cargaban todas las conversaciones de la cuenta (40k+ filas) en cada lote.
  // Eso disparaba statement timeouts y dejaba los jobs colgados en 0/importando.
  const waExternalIdSet = new Set<string>();
  const loadWhatsappExistingForBatch = async (pendingItems: any[]) => {
    waExternalIdSet.clear();
    const candidates = Array.from(new Set(
      pendingItems
        .map((item) => String(item.file_name || "").replace(/\.zip$/i, "").trim())
        .filter(Boolean)
    ));
    for (let i = 0; i < candidates.length; i += 80) {
      const chunk = candidates.slice(i, i + 80);
      const { data, error } = await supabase
        .from("whatsapp_conversations")
        .select("external_id")
        .eq("account_id", connection.account_id)
        .in("external_id", chunk);
      if (error) throw error;
      (data || []).forEach((r: any) => {
        const v = String(r.external_id || "").trim();
        if (v) {
          waExternalIdSet.add(v);
          waExternalIdSet.add(v.toLowerCase());
        }
      });
    }
    console.log(`[runImportJob] WA: ${waExternalIdSet.size} external_id existentes detectados solo en este lote.`);
  };

  let processed = 0;
  let imported = 0;
  let failed = 0;
  let queued = 0;
  const waConvIdsToAnalyze: string[] = [];
  const startTime = Date.now();

  // ============================================================================================
  // === FLUJO WHATSAPP MASIVO: 1 conexión SFTP → descarga todo → crea conversaciones rápido ===
  // ============================================================================================
  if (isWhatsapp) {
    // Lote WA reducido para caber en la ventana ampliada y liberar CPU entre ciclos.
    const WA_BATCH_SIZE = 20;
    const maxWaItems = Math.max(1, Math.min(Number(options.maxItems ?? WA_BATCH_SIZE), 60));

    // 1. Obtener archivos pendientes (más recientes primero para respuesta útil)
    const { data: pending } = await supabase
      .from("remote_import_files")
      .select("*")
      .eq("import_job_id", jobId)
      .in("status", ["pending_import", "error"])
      .order("modified_at", { ascending: false, nullsFirst: false })
      .limit(maxWaItems);

    console.log(`runImportJob [WA BULK]: ${pending?.length || 0} archivos pendientes. Ventana: ${MAX_BATCH_RUNTIME_MS}ms`);
    if (!pending?.length) {
      // Nada que procesar, cerrar
      await supabase.from("remote_import_jobs").update({
        status: "completed", files_imported: Number(job.files_imported || 0),
        finished_at: new Date().toISOString(), runner_finished_at: new Date().toISOString(),
      }).eq("id", jobId);
      return { imported: 0, failed: 0, queued: 0, partial: false };
    }

    // Verificar cancelación
    const { data: currentJobCheck } = await supabase.from("remote_import_jobs").select("status").eq("id", jobId).single();
    if (currentJobCheck?.status === "cancelled") {
      console.log(`runImportJob [${jobId}]: Abortando por cancelación.`);
      return { imported: 0, failed: 0, queued: 0, partial: false };
    }

    const minMsgs = Number(job.filters?.minMessagesForAnalysis) || 3;
    const minClientMsgs = Number(job.filters?.minClientMessagesForAnalysis) || 1;
    await loadWhatsappExistingForBatch(pending);

    // 2. UNA SOLA conexión SFTP para descargar TODOS los archivos del lote
    console.log(`runImportJob [WA BULK]: Abriendo conexión SFTP única para descarga masiva...`);
    try {
      const mod = await import("npm:ssh2-sftp-client@10.0.3");
      const Client = mod.default;
      const sftpClient = new Client();
      const host = String(connection.host || "").trim();
      const username = String(connection.username || "").trim();
      const password = connection.auth_method === "password" ? String(credentials.password || "").trim() : undefined;
      const privateKey = connection.auth_method === "private_key" ? credentials.privateKey : undefined;

      await sftpClient.connect({
        host,
        port: Number(connection.port) || 22,
        username, password, privateKey,
        readyTimeout: 15000,
        tryKeyboard: true,
        algorithms: {
          serverHostKey: ["ssh-ed25519", "ecdsa-sha2-nistp256", "ecdsa-sha2-nistp384", "ecdsa-sha2-nistp521", "rsa-sha2-512", "rsa-sha2-256", "ssh-rsa"],
          kex: ["curve25519-sha256", "curve25519-sha256@libssh.org", "ecdh-sha2-nistp256", "ecdh-sha2-nistp384", "ecdh-sha2-nistp521", "diffie-hellman-group-exchange-sha256", "diffie-hellman-group14-sha256", "diffie-hellman-group16-sha512", "diffie-hellman-group18-sha512"],
        },
      });
      console.log(`runImportJob [WA BULK]: Conexión SFTP establecida. Descargando archivos...`);

      // 3. Descargar + extraer + crear conversación para cada archivo (con control de tiempo)
      for (const item of pending) {
        if (Date.now() - startTime > MAX_BATCH_RUNTIME_MS - 1500) {
          console.log(`runImportJob [WA BULK]: Límite de tiempo cercano (${Date.now() - startTime}ms). Cortando lote.`);
          break;
        }
        processed++;

        // Claim el archivo
        const { data: claimed } = await supabase
          .from("remote_import_files")
          .update({ status: "importing", updated_at: new Date().toISOString() })
          .eq("id", item.id)
          .in("status", ["pending_import", "error"])
          .select("id")
          .maybeSingle();
        if (!claimed) continue;

        try {
          // Descargar usando la conexión ya abierta (SIN reconexión)
          const bytes = await sftpClient.get(item.remote_path);
          const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
          console.log(`runImportJob [WA BULK]: Descargado ${item.file_name} (${data.byteLength} bytes)`);

          if (!item.file_name.toLowerCase().endsWith(".zip")) {
            // No-ZIP en modo WA → skip
            await supabase.from("remote_import_files")
              .update({ status: "imported", metadata: { skipped: true, reason: "not_a_zip" } })
              .eq("id", item.id);
            imported++;
            continue;
          }

          // Descomprimir ZIP y extraer JSON+HTML
          const decompressed = fflate.unzipSync(new Uint8Array(data));
          const entries = Object.entries(decompressed);
          const jsonEntry = entries.find(([name]) => name.toLowerCase().endsWith(".json"));
          const htmlEntry = entries.find(([name]) => name.toLowerCase().endsWith(".html"));

          let jsonData: any = null;
          let htmlContent: string | null = null;

          if (jsonEntry) {
            try {
              const jsonText = new TextDecoder().decode(jsonEntry[1]);
              jsonData = JSON.parse(jsonText);
              if (Array.isArray(jsonData)) jsonData = jsonData[0];
            } catch (e) {
              console.error(`runImportJob [WA BULK]: Error parseando JSON en ${item.file_name}:`, e);
            }
          }
          if (htmlEntry) {
            htmlContent = new TextDecoder().decode(htmlEntry[1]);
          }

          if (!jsonData && !htmlContent) {
            throw new Error(`ZIP ${item.file_name} no contiene .json ni .html válidos`);
          }

          // Verificar duplicado por external_id ANTES de procesar/subir
          const candidateExternalId = String(item.file_name.replace(/\.zip$/i, "")).trim();
          if (
            candidateExternalId &&
            (waExternalIdSet.has(candidateExternalId) || waExternalIdSet.has(candidateExternalId.toLowerCase()))
          ) {
            console.log(`runImportJob [WA BULK]: ⏭️ Duplicado detectado (external_id=${candidateExternalId}). Omitiendo ${item.file_name}.`);
            await supabase.from("remote_import_files").update({
              status: "imported",
              metadata: { skipped: true, reason: "duplicate_external_id", external_id: candidateExternalId },
            }).eq("id", item.id);
            imported++;
            continue;
          }

          // Crear conversación + mensajes usando processWhatsappZip
          const result = await processWhatsappZip(
            supabase, connection.account_id, item.file_name,
            jsonData, htmlContent, job.prompt_id, minMsgs, minClientMsgs,
          );

          // Registrar en el set para evitar reprocesar duplicados dentro del mismo lote
          if (candidateExternalId) waExternalIdSet.add(candidateExternalId);

          // Marcar como importado
          await supabase.from("remote_import_files").update({
            status: "imported",
            metadata: {
              whatsapp_conversation_id: result.conversationId,
              total_messages: result.totalMessages,
              client_messages: result.clientMessages,
              auto_analyze: result.autoAnalyze,
            },
          }).eq("id", item.id);
          imported++;

          // Acumular para análisis si cumple criterios
          if (result.autoAnalyze && job.prompt_id) {
            waConvIdsToAnalyze.push(result.conversationId);
          }

          console.log(`runImportJob [WA BULK]: ✅ ${item.file_name} → conv=${result.conversationId} (${result.totalMessages} msgs) [${imported}/${processed}]`);
        } catch (err) {
          failed++;
          const errMsg = errorMessage(err);
          console.error(`runImportJob [WA BULK]: ❌ ${item.file_name}: ${errMsg}`);
          await supabase.from("remote_import_files")
            .update({ status: "error", error_message: errMsg })
            .eq("id", item.id);
        }
      }

      // Cerrar conexión SFTP
      await sftpClient.end().catch(() => undefined);
      console.log(`runImportJob [WA BULK]: Conexión SFTP cerrada. Importados: ${imported}, Fallidos: ${failed}`);
    } catch (sftpErr) {
      console.error(`runImportJob [WA BULK]: Error fatal SFTP:`, sftpErr);
      // Si la conexión falla, marcar los que estaban "importing" como error
      await supabase.from("remote_import_files")
        .update({ status: "error", error_message: `Error SFTP: ${errorMessage(sftpErr)}` })
        .eq("import_job_id", jobId)
        .eq("status", "importing");
      failed += processed - imported;
    }

  } else {
    // ============================================================================================
    // === FLUJO GRABACIONES (sin cambios) ===
    // ============================================================================================
    const maxItems = Math.max(1, Math.min(Number(options.maxItems ?? DEFAULT_IMPORT_BATCH_SIZE), 100));

    while (processed < maxItems) {
      if (Date.now() - startTime > MAX_BATCH_RUNTIME_MS) {
        console.log(`runImportJob [${jobId}]: Límite de tiempo por lote alcanzado (${MAX_BATCH_RUNTIME_MS}ms). Re-encadenando...`);
        break;
      }

      const { data: pending } = await supabase
        .from("remote_import_files")
        .select("*")
        .eq("import_job_id", jobId)
        .in("status", ["pending_import", "error"])
        .order("modified_at", { ascending: false, nullsFirst: false })
        .limit(Math.min(60, maxItems - processed));

      console.log(`runImportJob [${jobId}]: Encontrados ${pending?.length || 0} archivos pendientes para importar`);
      if (!pending?.length) break;
      // Precargar dedup solo para los nombres de este sub-lote (evita cargar toda la biblioteca).
      await loadAudioExistingForBatch(pending);

      const { data: currentJob } = await supabase.from("remote_import_jobs").select("status").eq("id", jobId).single();
      if (currentJob?.status === "cancelled") {
        console.log(`runImportJob [${jobId}]: Abortando lote por cancelación.`);
        return { imported, failed, queued, partial: false };
      }

      for (const item of pending) {
        if (processed >= maxItems) break;
        if (Date.now() - startTime > MAX_BATCH_RUNTIME_MS) break;
        processed++;
        try {
          console.log(`[runImportJob DEBUG] Procesando ${item.file_name} - Job: ${jobId}`);
          const { data: claimed, error: claimError } = await supabase
            .from("remote_import_files")
            .update({ status: "importing", updated_at: new Date().toISOString() })
            .eq("id", item.id)
            .in("status", ["pending_import", "error"])
            .select("id")
            .maybeSingle();
          if (claimError) throw claimError;
          if (!claimed) continue;

          // --- PRE-DOWNLOAD DUPLICATE CHECK (Solo para grabaciones) ---
          const lowerName = item.file_name.normalize("NFC").trim().toLowerCase();
          const nameNoExt = lowerName.replace(/\.[^/.]+$/, "");
          const slugName = lowerName.replace(/[^a-z0-9]/g, "");
          const slugNoExt = nameNoExt.replace(/[^a-z0-9]/g, "");

          if (
            audioSet.has(lowerName) ||
            audioSet.has(nameNoExt) ||
            audioSet.has(slugName) ||
            audioSet.has(slugNoExt)
          ) {
            console.log(`runImportJob: SKIP duplicado detectado (en memoria): ${item.file_name}`);
            await supabase
              .from("remote_import_files")
              .update({ status: "excluded", excluded_reason: "Duplicado detectado en tiempo real" })
              .eq("id", item.id);
            imported++;
            continue;
          }

          console.log(`[runImportJob DEBUG] Iniciando descarga de ${item.remote_path}...`);
          const bytes = await downloadRemoteFile(connection, credentials, item.remote_path);
          console.log(`[runImportJob DEBUG] Descarga completada: ${bytes.byteLength} bytes`);
          console.log(`runImportJob: Descargado ${bytes.byteLength} bytes. Procesando...`);

          let audioBytes = bytes;
          let finalFileName = item.file_name;
          let extractedMetadata: any = {};

          // Lógica para archivos ZIP
          if (item.file_name.toLowerCase().endsWith(".zip")) {
            try {
              const decompressed = fflate.unzipSync(new Uint8Array(bytes));
              const entries = Object.entries(decompressed);
              console.log(`runImportJob: Archivos encontrados en el ZIP (${item.file_name}): ${entries.map(e => e[0]).join(", ")}`);

              // Buscar el audio (.mp3, .wav, etc)
              const audioEntry = entries.find(([name]) =>
                name.toLowerCase().endsWith(".mp3") ||
                name.toLowerCase().endsWith(".wav") ||
                name.toLowerCase().endsWith(".m4a")
              );

              // Buscar el JSON de metadatos (cualquier archivo .json)
              const jsonEntry = entries.find(([name]) => name.toLowerCase().endsWith(".json"));

              if (audioEntry) {
                audioBytes = audioEntry[1];
                // Renombrar audio con el nombre del ZIP (como estaba antes)
                const zipBaseName = item.file_name.replace(/\.zip$/i, "");
                const audioExt = audioEntry[0].split(".").pop()?.toLowerCase() || "mp3";
                finalFileName = `${zipBaseName}.${audioExt}`;
                console.log(`runImportJob: Audio extraído y renombrado a ${finalFileName}`);
              }

              if (jsonEntry) {
                try {
                  const jsonText = new TextDecoder().decode(jsonEntry[1]);
                  let rawJson = JSON.parse(jsonText);
                  if (Array.isArray(rawJson)) rawJson = rawJson[0];

                  const dialerValues = rawJson.interactionData?.dialer?.agentDialerValues || [];
                  const customFields: Record<string, any> = {};
                  if (Array.isArray(dialerValues)) {
                    dialerValues.forEach((v: any) => {
                      const key = (v.key || v.Name || "").toLowerCase();
                      if (key) customFields[key] = v.value || v.Value;
                    });
                  }
                  extractedMetadata = {
                    agent: rawJson.agent || rawJson.__last_step?.agent || rawJson.dispositionAgent || rawJson.agentName || customFields["agent"] || customFields["agente"],
                    campaign: rawJson.campaign || rawJson.campaignName || rawJson.interactionData?.campaign || customFields["campaign"] || customFields["campaña"],
                    phone: rawJson.phone || rawJson.interactionData?.dialer?.phone || rawJson.destination || rawJson.contactAddress,
                    contact_name: rawJson.contactName || rawJson.customerName || customFields["nombre"] || customFields["cliente"],
                    disposition: rawJson.dispositionCode || rawJson.disposition || rawJson.dispositionName || rawJson.interactionData?.disposition,
                    disposition_is_goal: rawJson.dispositionIsGoal,
                    batch_id: rawJson.interactionData?.dialer?.batchId || rawJson.batchId,
                    initiative: rawJson.initiative,
                    vcc: rawJson.VCC,
                    start_time: rawJson.startTimestampReadable || rawJson.timestamp || rawJson.date || rawJson.start_date,
                    attention_level: rawJson.attentionLevel,
                    retries: rawJson.interactionData?.dialer?.retries,
                    total_duration: rawJson.interactionData?.totals?.totalRecordsTimeSec,
                    // Campos específicos de Hughes/Nexo
                    adeudo: customFields["adeudo"] || rawJson.adeudo,
                    ciudad: customFields["ciudad"] || rawJson.ciudad,
                    estado: customFields["estado"] || rawJson.estado,
                    cp: customFields["cp"] || rawJson.cp,
                    direccion: customFields["direccion"] || rawJson.direccion,
                    json_raw: rawJson
                  };
                  console.log(`runImportJob: Metadata JSON extraída con éxito para ${extractedMetadata.agent}`);
                } catch (e) {
                  console.error("Error al procesar JSON interno:", e);
                }
              }
            } catch (e) {
              console.error("Error al descomprimir ZIP:", e);
            }
          }

          // --- FALLBACK: Si no hay metadata, intentar sacar algo del nombre ---
          if (!extractedMetadata.agent && item.file_name.includes("_")) {
            extractedMetadata.agent = item.file_name.split("_")[0];
          }
          if (!extractedMetadata.campaign) {
            extractedMetadata.campaign = job.filters?.campaign || "SFTP Import";
          }

          // --- PREPARAR METADATA FINAL ---
          const finalMetadata = {
            source: "sftp_ftp",
            remote_path: item.remote_path,
            connection_id: connection.id,
            import_job_id: jobId,
            // Forzar que estos campos existan en el objeto raíz de metadata
            agent: extractedMetadata.agent || null,
            campaign: extractedMetadata.campaign || job.filters?.campaign || "SFTP Import",
            phone: extractedMetadata.phone || null,
            start_time: extractedMetadata.start_time || null,
            json_raw: extractedMetadata.json_raw || null,
            is_sftp_import: true, // Sello para evitar interferencias
            ...extractedMetadata
          };

          const safeName = String(finalFileName).replace(/[^a-zA-Z0-9._-]+/g, "_");
          const storagePath = `${connection.account_id}/remote-${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${safeName}`;
          const contentType = contentTypeFor(finalFileName);

          console.log(`runImportJob: Subiendo audio a storage: ${storagePath} (${contentType})`);

          const up = await supabase.storage.from("audio-files").upload(storagePath, audioBytes, { contentType, upsert: false });
          if (up.error) throw up.error;

          // Strip extension from database file_name as requested by user ("solo el nombre")
          const dbFileName = finalFileName.replace(/\.[^/.]+$/, "");

          // --- SAFETY CHECK YA REALIZADO ANTES DE DESCARGA ---

          const { data: audio, error: insErr } = await supabase
            .from("audio_files")
            .insert({
              account_id: connection.account_id,
              file_name: dbFileName,
              file_path: storagePath,
              file_size_bytes: bytes.byteLength,
              mime_type: contentType,
              prompt_id: job.prompt_id,
              status: "uploaded",
              metadata: finalMetadata
            })
            .select()
            .single();

          if (insErr) throw insErr;
          console.log(`runImportJob: Audio guardado con ID ${audio.id} y metadata completa.`);

          // --- AUTO-POBLAR REGLAS DE EXTRACCIÓN DESDE JSON ---
          if (audio && audio.id && extractedMetadata) {
            try {
              // 1. Primero borramos cualquier extracción previa (como las que saca el sistema del nombre del archivo)
              // para que los datos del JSON sean la única fuente de verdad.
              await supabase.from("call_extractions").delete().eq("audio_file_id", audio.id);

              const { data: rules } = await supabase
                .from("extraction_rules")
                .select("id, name")
                .eq("account_id", connection.account_id);

              if (rules && rules.length > 0) {
                const extractionsToInsert = [];
                for (const rule of rules) {
                  const ruleName = rule.name.toUpperCase();
                  let val = null;

                  // Mapeo robusto: Priorizar campos del JSON
                  if (ruleName.includes("ASESOR")) {
                    val = extractedMetadata.agent || extractedMetadata.disposition_agent;
                  } else if (ruleName.includes("CAMPAÑA") || ruleName.includes("CAMPANA")) {
                    val = extractedMetadata.campaign;
                  } else if (ruleName.includes("FECHA")) {
                    val = extractedMetadata.start_time;
                  } else if (ruleName.includes("TELÉFONO") || ruleName.includes("TELEFONO")) {
                    val = extractedMetadata.phone;
                  } else if (ruleName.includes("ESTADO") || ruleName.includes("TIPIFICACIÓN") || ruleName.includes("TIPIFICACION")) {
                    val = extractedMetadata.disposition;
                  } else if (ruleName.includes("CLIENTE")) {
                    val = extractedMetadata.contact_name;
                  } else if (ruleName.includes("ADEUDO")) {
                    val = extractedMetadata.adeudo;
                  } else if (ruleName.includes("CIUDAD")) {
                    val = extractedMetadata.ciudad;
                  }

                  if (val && String(val).trim() !== "" && String(val) !== "undefined") {
                    extractionsToInsert.push({
                      audio_file_id: audio.id,
                      rule_id: rule.id,
                      extracted_value: String(val).trim()
                    });
                  }
                }

                if (extractionsToInsert.length > 0) {
                  const { error: extErr } = await supabase.from("call_extractions").insert(extractionsToInsert);
                  if (extErr) console.error("Error inserting JSON extractions:", extErr);
                  else console.log(`runImportJob: Sincronizados ${extractionsToInsert.length} campos desde JSON para ${audio.id}`);
                }
              }
            } catch (ruleErr) {
              console.error("Error in JSON auto-population logic:", ruleErr);
            }
          }
          // --------------------------------------------------
          await supabase
            .from("remote_import_files")
            .update({ status: "imported", audio_file_id: audio.id })
            .eq("id", item.id);
          imported++;
          queued++;

          const analysisUrl = `${supabaseUrl.replace(/\/$/, "")}/functions/v1/process-call`;
          console.log(`runImportJob: Triggering auto-analysis for ${audio.id} at ${analysisUrl}`);
          await supabase.from("audio_files").update({ status: "queued" }).eq("id", audio.id);

          waitUntil(
            fetch(analysisUrl, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${supabaseAnonKey}`,
                "Content-Type": "application/json",
                apikey: supabaseAnonKey,
                "x-remote-import-internal": supabaseServiceKey
              },
              body: JSON.stringify({
                audio_file_id: audio.id,
                account_id: connection.account_id,
                prompt_id: job.prompt_id,
                quality_matrix_id: (job as any)?.quality_matrix_id || (automation as any)?.default_quality_matrix_id || null,
              }),
            })
              .then(async (res) => {
                const text = await res.text();
                if (!res.ok) {
                  console.error(`process-call failed for ${audio.id} [${res.status}]: ${text}`);
                } else {
                  console.log(`process-call OK for ${audio.id}: ${text.substring(0, 100)}`);
                }
                await supabase
                  .from("remote_import_files")
                    .update({ status: res.ok ? "analyzed" : "imported", error_message: res.ok ? null : `Análisis pendiente/error: ${text}` })
                  .eq("audio_file_id", audio.id);
              })
              .catch(async (err) => {
                console.error(`process-call network error for ${audio.id}:`, err.message);
                await supabase
                  .from("remote_import_files")
                  .update({ status: "imported", error_message: `Análisis pendiente/error: ${err.message}` })
                  .eq("audio_file_id", audio.id);
              }),
          );
        } catch (err) {
          failed++;
          console.error(`runImportJob: Error procesando item ${item.id}:`, err);
          await supabase
            .from("remote_import_files")
              .update({ status: "error", error_message: errorMessage(err) })
            .eq("id", item.id);
        } finally {
          // Dar un respiro al CPU para evitar "CPU Time exceeded" en procesos pesados (unzip)
          await new Promise(r => setTimeout(r, 10));
        }
      }
    } // end while
  } // end else (grabaciones)

  const { count: remainingCount } = await supabase
    .from("remote_import_files")
    .select("id", { count: "exact", head: true })
    .eq("import_job_id", jobId)
    .eq("status", "pending_import");
  const remaining = remainingCount ?? 0;
  const cumulativeImported = Number(job.files_imported || 0) + imported;

  // Si acumulamos conversaciones de WhatsApp para analizar, disparamos el batch worker (Optimizado para acelerar creación)
  if (waConvIdsToAnalyze.length > 0 && job.prompt_id) {
    console.log(`runImportJob [WA]: Disparando análisis masivo para ${waConvIdsToAnalyze.length} conversaciones en batch worker`);
    waitUntil(
      fetch(`${supabaseUrl}/functions/v1/process-whatsapp-batch`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${supabaseAnonKey}`,
          "Content-Type": "application/json",
          apikey: supabaseAnonKey,
          "x-remote-import-internal": supabaseServiceKey
        },
        body: JSON.stringify({
          conversation_ids: waConvIdsToAnalyze,
          account_id: connection.account_id,
          prompt_id: job.prompt_id,
          config: {
            blockSize: 10,
            delayBetweenBlocks: 2000
          }
        }),
      })
        .then(async (res) => {
          const text = await res.text();
          if (!res.ok) console.error(`runImportJob [WA]: Batch analysis trigger failed: ${text}`);
          else console.log(`runImportJob [WA]: Batch analysis trigger OK: ${text.substring(0, 100)}`);
        })
        .catch((err) => console.error(`runImportJob [WA]: Batch analysis trigger network error:`, err.message))
    );
    // Marcamos como queued para el informe final
    queued += waConvIdsToAnalyze.length;
  }

  if (remaining > 0) {
    await supabase
      .from("remote_import_jobs")
      .update({
        status: "importing",
        files_imported: cumulativeImported,
        error_message: failed > 0 ? `${failed} archivo(s) fallaron durante este lote` : null,
        summary: { ...(job.summary || {}), pending_import: remaining, last_batch_at: new Date().toISOString() },
      })
      .eq("id", jobId);

    // IMPORTANTE: await para asegurar que se registre antes de que termine la función
    await dispatchImportBatch(jobId, String(job.connection_id));
    return { imported, failed, queued, remaining, partial: true };
  }

  await supabase
    .from("remote_import_jobs")
    .update({
      status: failed > 0 ? "error" : "completed",
      files_imported: cumulativeImported,
      error_message: failed > 0 ? `${failed} archivo(s) fallaron durante la importación` : null,
      finished_at: new Date().toISOString(),
      runner_finished_at: new Date().toISOString(),
    })
    .eq("id", jobId);
  return { imported, failed, queued, remaining, partial: false };
}

async function runScheduled(supabase: any) {
  const { data: due, error } = await supabase.rpc("claim_due_remote_automations", {
    p_limit: 10,
    p_lock_seconds: 900,
    p_lead_seconds: 20,
  });
  if (error) throw error;
  const results = [];
  for (const automation of due ?? []) {
    const lockId = automation.automation_lock_id ?? null;
    const scheduledFor = automation.next_run_at ?? new Date().toISOString();
    const runKey = runKeyFor(automation as AutomationRow, scheduledFor);
    let activeJobId: string | null = null;
    let connection: ConnectionRow | null = null;
    try {
      connection = await getConnection(supabase, automation.connection_id);
      if (!automation.default_prompt_id) throw new Error("La automatización no tiene prompt seleccionado");

      const { data: existingJob, error: existingError } = await supabase
        .from("remote_import_jobs")
        .select("id,status")
        .eq("automation_id", automation.id)
        .eq("run_key", runKey)
        .maybeSingle();

      if (existingError) throw existingError;
      if (existingJob) {
        const next = nextRunAtAfter(automation.schedule_interval_minutes, scheduledFor, 0);
        await supabase
          .from("remote_import_automations")
          .update({
            last_run_at: new Date().toISOString(),
            next_run_at: next,
            last_run_status: "skipped",
            last_run_message: "Ejecución omitida: el lote programado ya estaba registrado",
          })
          .eq("id", automation.id);
        await supabase.rpc("release_remote_automation_lock", { p_automation_id: automation.id, p_lock_id: lockId });
        results.push({ automationId: automation.id, skipped: true, jobId: existingJob.id });
        continue;
      }

      const credentials = await decryptCredentials(connection.credentials_encrypted);
      const mergedFilters = {
        ...(connection.import_filters as Record<string, unknown> ?? {}),
        ...(automation.import_filters as Record<string, unknown> ?? {}),
      };
      const scan = await scanConnection(
        supabase,
        connection as ConnectionRow,
        credentials,
        mergedFilters,
        automation.default_prompt_id,
        null,
        true,
        { runKey, triggerSource: "scheduled", scheduledFor, lockId }
      );

      // Vincular el job a la automatización
      if (scan.jobId) {
        await supabase.from("remote_import_jobs").update({ automation_id: automation.id }).eq("id", scan.jobId);
        console.log(`runScheduled: Escaneo completado para job ${scan.jobId}. Elegibles: ${scan.filesEligible}`);
      }

      activeJobId = scan.jobId;
      let run: ImportCounters = { imported: 0, failed: 0, queued: 0 };
      if (scan.jobId && scan.filesEligible > 0) {
        run = { imported: 0, failed: 0, queued: scan.filesEligible, remaining: scan.filesEligible, partial: true };
        console.log(`runScheduled: Despachando lote de importación para job ${scan.jobId}...`);
        waitUntil(dispatchImportBatch(scan.jobId, connection.id));
      } else if (scan.jobId) {
        await supabase
          .from("remote_import_jobs")
          .update({ status: "completed", finished_at: new Date().toISOString() })
          .eq("id", scan.jobId);
      }

      const next = nextRunAtAfter(automation.schedule_interval_minutes, scheduledFor, 0);
      await supabase
        .from("remote_import_automations")
        .update({
          last_run_at: new Date().toISOString(),
          next_run_at: next,
          last_run_status: "ok",
          last_run_message: run.partial
            ? `${scan.filesEligible} archivo(s) en cola`
            : `${run.imported} archivo(s) importado(s)`,
        })
        .eq("id", automation.id);

      await supabase.rpc("release_remote_automation_lock", { p_automation_id: automation.id, p_lock_id: lockId });
      results.push({ automationId: automation.id, ...scan, ...run });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const next = nextRunAtAfter(automation.schedule_interval_minutes, scheduledFor, 0);

      if (activeJobId) {
        await supabase
          .from("remote_import_jobs")
          .update({ status: "error", error_message: msg, finished_at: new Date().toISOString() })
          .eq("id", activeJobId);
      }

      await supabase
        .from("remote_import_automations")
        .update({
          last_run_at: new Date().toISOString(),
          next_run_at: next,
          last_run_status: "error",
          last_run_message: msg,
        })
        .eq("id", automation.id);

      await supabase.rpc("release_remote_automation_lock", { p_automation_id: automation.id, p_lock_id: lockId });
      results.push({ automationId: automation.id, error: msg });
    }
  }
  return { processed: results.length, results };
}

async function runAutomation(supabase: any, automationId: string) {
  const { data: automation, error: autErr } = await supabase.from("remote_import_automations").select("*").eq("id", automationId).single();
  if (autErr || !automation) throw new Error("No se encontró la automatización");

  const connection = await getConnection(supabase, automation.connection_id);
  try {
    if (!automation.default_prompt_id) throw new Error("La automatización no tiene un prompt asignado");

    const credentials = await decryptCredentials(connection.credentials_encrypted);
    // Fusionar filtros: la configuración manual de la conexión es la base "que funciona";
    // los filtros propios de la automatización solo sobrescriben campos explícitos.
    const mergedFilters = {
      ...(connection.import_filters as Record<string, unknown> ?? {}),
      ...(automation.import_filters as Record<string, unknown> ?? {}),
    };
    const scan = await scanConnection(
      supabase,
      connection as ConnectionRow,
      credentials,
      mergedFilters,
      automation.default_prompt_id,
      null,
      true,
    );

    let run: ImportCounters = { imported: 0, failed: 0, queued: 0 };
    if (scan.jobId && scan.filesEligible > 0) {
      await supabase.from("remote_import_jobs").update({ automation_id: automation.id }).eq("id", scan.jobId);
      run = { imported: 0, failed: 0, queued: scan.filesEligible, remaining: scan.filesEligible, partial: true };
      waitUntil(dispatchImportBatch(scan.jobId, connection.id));
    } else if (scan.jobId) {
      await supabase
        .from("remote_import_jobs")
        .update({ status: "completed", finished_at: new Date().toISOString() })
        .eq("id", scan.jobId);
    }

    const next = nextRunAt(automation.schedule_interval_minutes);

    await supabase
      .from("remote_import_automations")
      .update({
        last_run_at: new Date().toISOString(),
        next_run_at: next,
        last_run_status: "ok",
        last_run_message: run.partial
          ? `${scan.filesEligible} archivo(s) en cola`
          : `${run.imported} archivo(s) importado(s)`,
      })
      .eq("id", automation.id);

    return { ...scan, ...run };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const next = nextRunAt(automation.schedule_interval_minutes);

    await supabase.from("remote_import_jobs").insert({
      account_id: automation.account_id,
      connection_id: automation.connection_id,
      automation_id: automation.id,
      status: "error",
      trigger_source: "manual",
      error_message: msg,
      summary: { error: msg },
    });

    await supabase
      .from("remote_import_automations")
      .update({
        last_run_at: new Date().toISOString(),
        next_run_at: next,
        last_run_status: "error",
        last_run_message: msg,
      })
      .eq("id", automation.id);
    throw err;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const authHeader = req.headers.get("Authorization");
  const isService = authHeader === `Bearer ${supabaseServiceKey}`;

  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action as Action;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const connectionId = body.connectionId as string | undefined;
    const accountId = body.accountId as string | undefined;
    const isInternal = isService || req.headers.get("x-remote-import-internal") === supabaseServiceKey;
    console.log(`remote-import action: ${action}`, body);

    if (action === "scheduled") {
      const configuredCronSecret = Deno.env.get("REMOTE_IMPORT_CRON_SECRET");
      const isCronSecret = configuredCronSecret && req.headers.get("x-scheduled-token") === configuredCronSecret;
      const isSupabaseCron = req.headers.get("x-remote-import-scheduler") === "pg_cron";
      if (!isInternal && !isCronSecret && !isSupabaseCron) {
        console.warn("Unauthorized scheduled trigger", { hasAuth: !!authHeader, hasCronHeader: req.headers.get("x-remote-import-scheduler") });
        return json({ error: "Unauthorized scheduled trigger" }, 401);
      }
      console.log("✅ Scheduled trigger authorized, executing runScheduled...");
      const scheduledPromise = runScheduled(supabase).then(r => {
        console.log("runScheduled completed:", JSON.stringify(r));
      }).catch(e => {
        console.error("runScheduled background error:", e);
      });
      waitUntil(scheduledPromise);
      return json({ success: true, message: "Scheduled run dispatched in background" });
    }

    // El procesamiento interno no recibe accountId desde el cliente; valida por service key
    // o, si lo dispara un usuario, valida acceso contra la cuenta del job antes de ejecutar.
    if (action === "process-job") {
      const jobId = body.jobId as string;
      if (!jobId) throw new Error("Falta jobId");
      const { data: jobAccess, error: jobAccessError } = await supabase
        .from("remote_import_jobs")
        .select("account_id, connection_id")
        .eq("id", jobId)
        .single();
      if (jobAccessError || !jobAccess?.account_id) throw new Error("No se encontró la importación");

      const expectedToken = await internalJobToken(jobId, String(jobAccess.connection_id));
      const hasValidInternalToken = body.internalToken === expectedToken;
      if (!isInternal && !hasValidInternalToken) {
        await assertUserAccess(req, jobAccess.account_id);
      }

      waitUntil(
        (async () => {
          try {
            console.log(`[BACKGROUND] Iniciando runImportJob para ${jobId}`);
            await runImportJob(supabase, jobId, { maxItems: DEFAULT_IMPORT_BATCH_SIZE });
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            console.error(`[BACKGROUND] Error fatal en runImportJob para ${jobId}:`, err);
            await supabase.from("remote_import_jobs").update({
              status: "error",
              error_message: message,
              finished_at: new Date().toISOString()
            }).eq("id", jobId);
          }
        })()
      );

      return json({ success: true, message: "Procesamiento iniciado en segundo plano" });
    }

    const access = await assertUserAccess(req, accountId);

    if (action === "save") {
      if (!accountId) throw new Error("Falta la cuenta");
      const connection = body.connection as Partial<ConnectionRow> & Credentials;

      let encrypted;
      if (connection.password || connection.privateKey) {
        encrypted = await encryptCredentials({ password: connection.password, privateKey: connection.privateKey });
      }

      const nextRunAt = body.autoImportEnabled
        ? new Date(Date.now() + Math.max(1, Number(body.scheduleIntervalMinutes || 60)) * 60000).toISOString()
        : null;

      if (connectionId) {
        const updatePayload: any = {
          name: connection.name,
          connection_type: connection.connection_type,
          host: connection.host,
          port: connection.port,
          username: connection.username,
          auth_method: connection.auth_method,
          remote_root_path: connection.remote_root_path,
        };
        if (encrypted) updatePayload.credentials_encrypted = encrypted;

        const { data, error } = await supabase
          .from("remote_connections")
          .update(updatePayload)
          .eq("id", connectionId)
          .select()
          .single();
        if (error) throw error;
        return json({ success: true, connection: data });
      } else {
        if (!encrypted) throw new Error("Debes proporcionar contraseña o llave privada para una conexión nueva");
        const { data, error } = await supabase
          .from("remote_connections")
          .insert({
            account_id: accountId,
            name: connection.name,
            connection_type: connection.connection_type,
            host: connection.host,
            port: connection.port,
            username: connection.username,
            auth_method: connection.auth_method,
            remote_root_path: connection.remote_root_path,
            credentials_encrypted: encrypted,
            status: "inactive",
            created_by: access.userId,
          })
          .select()
          .single();
        if (error) throw error;
        return json({ success: true, connection: data });
      }
    }

    if (action === "list-automations") {
      if (!accountId) throw new Error("Falta accountId");
      const { data, error } = await supabase
        .from("remote_import_automations")
        .select("*")
        .eq("account_id", accountId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return json({ success: true, automations: data });
    }

    if (action === "save-automation") {
      if (!accountId) throw new Error("Falta accountId");
      const automation = body.automation;
      if (!automation) throw new Error("Falta datos de automatización");

      const normalizedFilters = normalizeFilters(automation.filters ?? {});
      const payload = {
        account_id: accountId,
        connection_id: automation.connection_id,
        name: automation.name,
        import_filters: normalizedFilters,
        default_prompt_id: automation.prompt_id || null,
        default_quality_matrix_id: automation.quality_matrix_id || automation.default_quality_matrix_id || null,
        schedule_interval_minutes: Math.max(1, Number(automation.schedule_interval_minutes || 60)),
        is_enabled: automation.is_enabled !== false,
        target_module: automation.target_module || normalizedFilters.importDestination || "audio",
      };

      if (automation.id) {
        const { data, error } = await supabase
          .from("remote_import_automations")
          .update(payload)
          .eq("id", automation.id)
          .select()
          .single();
        if (error) throw error;
        return json({ success: true, automation: data });
      } else {
        const { data, error } = await supabase
          .from("remote_import_automations")
          .insert(payload)
          .select()
          .single();
        if (error) throw error;
        return json({ success: true, automation: data });
      }
    }

    if (action === "delete-automation") {
      const id = body.automationId;
      if (!id) throw new Error("Falta automationId");
      const { error } = await supabase.from("remote_import_automations").delete().eq("id", id);
      if (error) throw error;
      return json({ success: true });
    }

    if (action === "toggle-automation") {
      const id = body.automationId;
      const enabled = body.enabled;
      if (!id) throw new Error("Falta automationId");
      const { error } = await supabase
        .from("remote_import_automations")
        .update({ is_enabled: enabled })



        .eq("id", id);
      if (error) throw error;
      return json({ success: true });
    }

    if (action === "test" && !connectionId && body.connection) {
      const temp = body.connection as ConnectionRow & Credentials;
      const credentials = { password: temp.password, privateKey: temp.privateKey } as Credentials;
      if (temp.connection_type === "sftp")
        await withSftp(temp, credentials, async (client) => client.list(temp.remote_root_path || "/"));
      else await withFtp(temp, credentials, async (client) => client.list(temp.remote_root_path || "/"));
      return json({ success: true, message: "Conexión validada correctamente" });
    }

    if (action === "run-automation") {
      const automationId = body.automationId;
      if (!automationId) throw new Error("Falta automationId");
      return json({ success: true, ...(await runAutomation(supabase, automationId)) });
    }

    if (action === "run") {
      const jobId = body.jobId as string;
      if (!jobId) throw new Error("Falta jobId");
      console.log(`[action:run] Job ${jobId} triggered manually`);
      waitUntil(dispatchImportBatch(jobId, connectionId || ""));
      return json({ success: true, queued: true, message: "Importación despachada en segundo plano" });
    }

    if (action === "stop") {
      const jobId = body.jobId as string;
      if (!jobId) throw new Error("Falta jobId");
      const { error } = await supabase
        .from("remote_import_jobs")
        .update({ status: "cancelled", finished_at: new Date().toISOString() })
        .eq("id", jobId);
      if (error) throw error;
      return json({ success: true, message: "Trabajo detenido correctamente" });
    }

    // Actions that DO require a connectionId
    if (!connectionId) throw new Error("Falta connectionId");
    const connection = await getConnection(supabase, connectionId);
    await assertUserAccess(req, connection.account_id);
    const credentials = body.credentials
      ? (body.credentials as Credentials)
      : await decryptCredentials(connection.credentials_encrypted);

    if (action === "test") {
      if (connection.connection_type === "sftp")
        await withSftp(connection, credentials, async (client) => client.list(connection.remote_root_path));
      else await withFtp(connection, credentials, async (client) => client.list(connection.remote_root_path));
      await supabase
        .from("remote_connections")
        .update({
          status: "active",
          last_test_status: "success",
          last_test_message: "Conexión validada correctamente",
          last_tested_at: new Date().toISOString(),
        })
        .eq("id", connection.id);
      return json({ success: true, message: "Conexión validada correctamente" });
    }

    if (action === "scan") {
      // Escaneo síncrono: devuelve totales/preview para que el usuario vea
      // cuántos archivos se encontraron y cuántos cumplen filtros.
      // El listado remoto ya está acotado por maxScanLimit (más recientes) para evitar timeouts.
      const scan = await scanConnection(
        supabase,
        connection,
        credentials,
        body.filters ?? connection.import_filters ?? {},
        body.promptId ?? connection.default_prompt_id ?? null,
        access.userId,
        true,
      );

      // Si hay elegibles, disparamos la importación en segundo plano
      // para que el cliente pueda hacer polling del progreso.
      let autoQueued = false;
      if (scan.jobId && Number(scan.filesEligible || 0) > 0) {
        await supabase
          .from("remote_import_jobs")
          .update({
            status: "importing",
            runner_started_at: new Date().toISOString(),
            error_message: null,
          })
          .eq("id", scan.jobId);
        waitUntil(dispatchImportBatch(scan.jobId, connection.id));
        autoQueued = true;
      }

      return json({
        success: true,
        autoQueued,
        jobId: scan.jobId,
        filesFound: scan.filesFound,
        filesEligible: scan.filesEligible,
        filesExcluded: scan.filesExcluded,
        excludedPreview: scan.excludedPreview,
        excludedReasons: scan.excludedReasons,
        files: scan.files,
        responseTruncated: scan.responseTruncated,
      });
    }



    if (action === "save-manual-config") {
      const filtersPayload = normalizeFilters(body.filters ?? {});
      const promptId = body.promptId || null;
      const { error } = await supabase
        .from("remote_connections")
        .update({
          import_filters: filtersPayload,
          default_prompt_id: promptId,
        })
        .eq("id", connection.id);
      if (error) throw error;
      return json({ success: true, message: "Configuración de consulta guardada" });
    }

    if (action === "load-manual-config") {
      const { data: conn, error } = await supabase
        .from("remote_connections")
        .select("import_filters, default_prompt_id")
        .eq("id", connection.id)
        .single();
      if (error) throw error;
      return json({ success: true, filters: conn?.import_filters ?? {}, promptId: conn?.default_prompt_id ?? null });
    }

    if (action === "update-automation") {
      const interval = Math.max(1, Number(body.scheduleIntervalMinutes || connection.schedule_interval_minutes || 60));
      const enabled = Boolean(body.autoImportEnabled);
      const nextRunAt = enabled ? new Date(Date.now() + interval * 60000).toISOString() : null;
      const { error } = await supabase
        .from("remote_connections")
        .update({
          import_filters: normalizeFilters(body.filters ?? {}),
          default_prompt_id: body.promptId || null,
          auto_import_enabled: enabled,
          schedule_interval_minutes: interval,
          next_run_at: nextRunAt,
        })
        .eq("id", connection.id);
      if (error) throw error;
      return json({ success: true, nextRunAt });
    }

    return json({ error: "Acción no soportada" }, 400);
  } catch (err) {
    console.error("Critical edge function error:", err);
    return json({ error: errorMessage(err) }, 500);
  }
});
