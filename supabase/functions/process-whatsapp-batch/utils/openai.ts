const OPENAI_BASE_URL = "https://api.openai.com/v1";

function getOpenAIApiKey(): string {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("OpenAI API key not configured");
  return apiKey;
}

function createTimeoutController(timeoutMs: number) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    clear: () => clearTimeout(timeoutId),
  };
}

async function parseOpenAIResponse(response: Response) {
  const rawBody = await response.text();

  if (!response.ok) {
    let message = rawBody;
    try {
      const parsed = rawBody ? JSON.parse(rawBody) : null;
      message = parsed?.error?.message || parsed?.message || rawBody;
    } catch {
      /* keep raw */
    }
    throw new Error(`OpenAI ${response.status}: ${message}`);
  }

  if (!rawBody) return {};

  try {
    return JSON.parse(rawBody);
  } catch {
    return { text: rawBody };
  }
}

function sanitizeContent(text: string): string {
  if (!text) return "";
  return text
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .replace(/\uFFFD/g, "")
    .replace(/\uFEFF/g, "");
}

interface ChatCompletionParams {
  model: string;
  messages: Array<{ role: string; content: string }>;
  response_format?: Record<string, unknown>;
  temperature?: number;
  max_tokens?: number;
  timeoutMs?: number;
  maxRetries?: number;
}

export async function createChatCompletion({
  model,
  messages,
  response_format,
  temperature,
  max_tokens,
  timeoutMs = 120_000,
  maxRetries = 2,
}: ChatCompletionParams) {
  const sanitizedMessages = messages.map((m) => ({
    role: m.role,
    content: sanitizeContent(m.content),
  }));

  const payload = {
    model,
    messages: sanitizedMessages,
    ...(typeof temperature === "number" ? { temperature } : {}),
    ...(typeof max_tokens === "number" ? { max_tokens } : {}),
    ...(response_format ? { response_format } : {}),
  };

  let bodyStr: string;
  try {
    bodyStr = JSON.stringify(payload);
    JSON.parse(bodyStr);
  } catch (e) {
    throw new Error(`Failed to serialize OpenAI payload: ${e}`);
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const { signal, clear } = createTimeoutController(timeoutMs);
    try {
      const response = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${getOpenAIApiKey()}`,
          "Content-Type": "application/json",
        },
        body: bodyStr,
        signal,
      });

      if ((response.status === 429 || response.status >= 500) && attempt < maxRetries) {
        const waitMs = Math.min(2000 * Math.pow(2, attempt), 10_000);
        console.warn(`OpenAI ${response.status}, retry ${attempt + 1}/${maxRetries} in ${waitMs}ms`);
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }

      return await parseOpenAIResponse(response);
    } catch (error: any) {
      lastError = error;
      if (attempt < maxRetries && (error.name === "AbortError" || error.message?.includes("connection"))) {
        const waitMs = Math.min(2000 * Math.pow(2, attempt), 10_000);
        console.warn(`OpenAI request error (attempt ${attempt + 1}): ${error.message}, retrying in ${waitMs}ms`);
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }
      throw error;
    } finally {
      clear();
    }
  }

  throw lastError || new Error("OpenAI request failed after retries");
}

interface AudioTranscriptionParams {
  file: File;
  model: string;
  language?: string;
  response_format?: string;
  timestamp_granularities?: string[];
  temperature?: number;
  prompt?: string;
  chunking_strategy?: string;
  timeoutMs?: number;
}

export async function createAudioTranscription({
  file,
  model,
  language,
  response_format,
  timestamp_granularities,
  temperature,
  prompt,
  chunking_strategy,
  timeoutMs = 120_000,
}: AudioTranscriptionParams) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("model", model);

  if (language) formData.append("language", language);
  if (response_format) formData.append("response_format", response_format);
  if (typeof temperature === "number") formData.append("temperature", String(temperature));
  if (prompt) formData.append("prompt", prompt);
  if (chunking_strategy) formData.append("chunking_strategy", chunking_strategy);
  timestamp_granularities?.forEach((g) => formData.append("timestamp_granularities[]", g));

  const { signal, clear } = createTimeoutController(timeoutMs);
  try {
    const response = await fetch(`${OPENAI_BASE_URL}/audio/transcriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${getOpenAIApiKey()}` },
      body: formData,
      signal,
    });
    return await parseOpenAIResponse(response);
  } finally {
    clear();
  }
}
