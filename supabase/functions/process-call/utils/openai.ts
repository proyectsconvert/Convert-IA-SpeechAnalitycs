const OPENAI_BASE_URL = "https://api.openai.com/v1";

function getOpenAIApiKey(): string {
  const apiKey = Deno.env.get("OPENAI_API_KEY");

  if (!apiKey) {
    throw new Error("OpenAI API key not configured");
  }

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
  const contentType = response.headers.get("content-type") || "";
  const rawBody = await response.text();

  if (!response.ok) {
    let message = rawBody;

    try {
      const parsed = rawBody ? JSON.parse(rawBody) : null;
      message = parsed?.error?.message || parsed?.message || rawBody;
    } catch {
      // Keep raw text if the payload is not JSON.
    }

    throw new Error(`OpenAI ${response.status}: ${message}`);
  }

  if (!rawBody) return {};

  if (contentType.includes("application/json")) {
    return JSON.parse(rawBody);
  }

  return { text: rawBody };
}

interface ChatCompletionParams {
  model: string;
  messages: Array<{ role: string; content: string }>;
  response_format?: Record<string, unknown>;
  temperature?: number;
  max_tokens?: number;
  timeoutMs?: number;
}

export async function createChatCompletion({
  model,
  messages,
  response_format,
  temperature,
  max_tokens,
  timeoutMs = 45000,
}: ChatCompletionParams) {
  const { signal, clear } = createTimeoutController(timeoutMs);

  try {
    const response = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${getOpenAIApiKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages,
        ...(typeof temperature === "number" ? { temperature } : {}),
        ...(typeof max_tokens === "number" ? { max_tokens } : {}),
        ...(response_format ? { response_format } : {}),
      }),
      signal,
    });

    return await parseOpenAIResponse(response);
  } finally {
    clear();
  }
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
  timeoutMs = 120000,
}: AudioTranscriptionParams) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("model", model);

  if (language) formData.append("language", language);
  if (response_format) formData.append("response_format", response_format);
  if (typeof temperature === "number") formData.append("temperature", String(temperature));
  if (prompt) formData.append("prompt", prompt);
  if (chunking_strategy) formData.append("chunking_strategy", chunking_strategy);
  timestamp_granularities?.forEach((granularity) => formData.append("timestamp_granularities[]", granularity));

  const { signal, clear } = createTimeoutController(timeoutMs);

  try {
    const response = await fetch(`${OPENAI_BASE_URL}/audio/transcriptions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${getOpenAIApiKey()}`,
      },
      body: formData,
      signal,
    });

    return await parseOpenAIResponse(response);
  } finally {
    clear();
  }
}