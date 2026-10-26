// OpenAI-compatible chat client for the script, motion and upload-copy writers.
// Configured from .env, or from the panel's model manager (its "LLM" provider overrides these env
// vars, model-config.mjs), so the provider can be swapped without touching code:
//   LLM_BASE_URL (e.g. https://api.openai.com/v1) · LLM_API_KEY · LLM_MODEL
//   LLM_USER_AGENT — optional; some routers only serve requests from known client user agents.
// Every call asks for one JSON object back. A reply wrapped in a markdown fence or a sentence is
// still parsed, since not every OpenAI-compatible server honours response_format.

// A whole-video story from a reasoning model can take several minutes to come back.
const REQUEST_TIMEOUT_MS = 8 * 60_000;
// Rate limits, gateway errors, and the Cloudflare 52x codes routers answer with when the model
// behind them stalls or drops the connection.
const RETRY_STATUSES = [408, 429, 500, 502, 503, 504, 520, 521, 522, 523, 524];
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 2000;

export const llmConfig = () => {
  const config = {
    baseUrl: process.env.LLM_BASE_URL?.trim().replace(/\/+$/, ''),
    apiKey: process.env.LLM_API_KEY?.trim(),
    model: process.env.LLM_MODEL?.trim(),
    userAgent: process.env.LLM_USER_AGENT?.trim() || null,
  };
  const missing = ['baseUrl', 'apiKey', 'model'].filter((key) => !config[key]);
  if (missing.length) {
    const names = { baseUrl: 'LLM_BASE_URL', apiKey: 'LLM_API_KEY', model: 'LLM_MODEL' };
    throw new Error(`Thiếu ${missing.map((key) => names[key]).join(', ')} trong .env hoặc Model › LLM`);
  }
  return config;
};

// Pull the JSON object out of a reply: bare JSON, a ```json fence, or JSON inside prose.
export const parseJsonReply = (text) => {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text)?.[1];
  const body = fenced ?? text;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('LLM không trả về JSON.');
  try {
    return JSON.parse(body.slice(start, end + 1));
  } catch (error) {
    throw new Error(`LLM trả về JSON hỏng: ${error.message}`);
  }
};

// AgentRouter answers any Vietnamese-language input with `content-blocked` (English input with
// Vietnamese names passes, and Vietnamese output is fine), so that code gets an actionable hint.
const describeFailure = (label, status, body) => {
  let code = '';
  let message = body.slice(0, 300);
  try {
    const parsed = JSON.parse(body);
    code = parsed.error?.code ?? '';
    message = parsed.error?.message ?? message;
  } catch {
    // not JSON — keep the raw body excerpt
  }
  const hint = code === 'content-blocked'
    ? ' — provider từ chối nội dung input (AgentRouter chặn input tiếng Việt): viết yêu cầu bằng tiếng Anh, hoặc đổi LLM_BASE_URL/LLM_MODEL trong .env'
    : '';
  return `${label} ${status}: ${message}${hint}`;
};

const pause = (ms, signal) => new Promise((resolve, reject) => {
  const onAbort = () => { clearTimeout(timer); reject(signal.reason); };
  const timer = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve(); }, ms);
  signal?.addEventListener('abort', onAbort, { once: true });
});

// An Error that says whether asking again can help.
const failure = (message, retryable) => Object.assign(new Error(message), { retryable });

// A failed fetch or body read: a cancel passes through untouched, a timeout is final, anything
// else (refused, reset, cut mid-body) is worth another try. Node hides the socket error in `cause`.
const networkFailure = (error, label, signal) => {
  if (signal?.aborted) return error;
  if (error.name === 'TimeoutError') return failure(`${label}: quá ${REQUEST_TIMEOUT_MS / 60_000} phút không trả lời`, false);
  return failure(`${label}: lỗi kết nối (${error.cause?.code ?? error.cause?.message ?? error.message})`, true);
};

const postChat = async (config, body, signal) => fetch(`${config.baseUrl}/chat/completions`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${config.apiKey}`,
    'Content-Type': 'application/json',
    ...(config.userAgent ? { 'User-Agent': config.userAgent } : {}),
  },
  body,
  signal: AbortSignal.any([AbortSignal.timeout(REQUEST_TIMEOUT_MS), ...(signal ? [signal] : [])]),
});

// One request → the parsed JSON object, or an Error tagged `retryable`. Reasoning models behind a
// router now and then return content "" or break the JSON with a stray quote; those are retryable.
const attemptChat = async (config, body, signal, label) => {
  let text;
  let status;
  try {
    const res = await postChat(config, body, signal);
    status = res.status;
    text = await res.text(); // inside the try: a connection cut mid-body is a network failure
  } catch (error) {
    throw networkFailure(error, label, signal);
  }
  if (status < 200 || status >= 300) throw failure(describeFailure(label, status, text), RETRY_STATUSES.includes(status));
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw failure(`${label}: provider trả về không phải JSON (${text.slice(0, 120)})`, true);
  }
  const choice = data.choices?.[0];
  if (choice?.finish_reason === 'length') throw failure(`${label}: trả lời bị cắt vì vượt giới hạn token của model`, false);
  const content = choice?.message?.content ?? '';
  if (!content.trim()) throw failure(`${label}: model trả về rỗng`, true);
  try {
    return parseJsonReply(content);
  } catch (error) {
    throw failure(`${label}: ${error.message}`, true);
  }
};

// One system + user turn → the parsed JSON object. Up to MAX_ATTEMPTS requests, each retry
// announced through onLog (every attempt is a paid call); a cancel (`signal`) or a timeout is
// never retried.
export const chatJson = async ({ system, user, signal, label = 'LLM', onLog = () => {} }) => {
  const config = llmConfig();
  const body = JSON.stringify({
    model: config.model,
    response_format: { type: 'json_object' },
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
  });
  for (let attempt = 1; ; attempt++) {
    try {
      return await attemptChat(config, body, signal, label);
    } catch (error) {
      if (signal?.aborted || !error.retryable || attempt === MAX_ATTEMPTS) throw error;
      onLog(`⚠ ${error.message} — thử lại (lần ${attempt + 1}/${MAX_ATTEMPTS})`);
      await pause(RETRY_DELAY_MS * attempt, signal);
    }
  }
};
