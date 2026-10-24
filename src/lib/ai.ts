import 'server-only';
import {
  boundAIText,
  validateAIProvider,
  MAX_AI_PROMPT_CHARS,
  MAX_AI_SYSTEM_CHARS,
  MAX_AI_IMAGE_BASE64_CHARS,
  DEFAULT_AI_ALLOWED_HOSTS,
} from '@/lib/ai-governance';

/**
 * Shared server-side OpenAI Responses API client for chat and administrative AI.
 * The endpoint and model are fixed; only OPENAI_API_KEY is read from server env.
 * Fail-soft: thiếu key / lỗi / timeout / host rejected → trả null (KHÔNG bao giờ làm vỡ app).
 * KHÔNG BAO GIỜ import vào client component (key là bí mật).
 */

const OPENAI_MODEL = 'gpt-6-luna';
const OPENAI_BASE_URL = 'https://api.openai.com/v1';

/**
 * Parse a Responses API refusal/empty/tool-call-safe text result.
 */
function parseResponsesOutput(data: unknown): { content: string | null; finishReason: string | null } {
  const d = data as {
    output_text?: unknown;
    output?: Array<{ type?: unknown; content?: Array<{ type?: unknown; text?: unknown }> }>;
    status?: unknown;
    incomplete_details?: { reason?: unknown };
  } | null;
  if (!d) return { content: null, finishReason: null };
  const hasRefusal = Array.isArray(d.output) && d.output.some((item) =>
    item?.type === 'message' &&
    Array.isArray(item.content) &&
    item.content.some((part) => part?.type === 'refusal')
  );
  if (hasRefusal) return { content: null, finishReason: 'refused' };

  let content = typeof d.output_text === 'string' && d.output_text.trim() ? d.output_text.trim() : null;
  if (!content && Array.isArray(d.output)) {
    for (const item of d.output) {
      if (item?.type !== 'message' || !Array.isArray(item.content)) continue;
      for (const part of item.content) {
        if ((part?.type === 'output_text' || part?.type === 'text') && typeof part.text === 'string' && part.text.trim()) {
          content = part.text.trim();
          break;
        }
      }
      if (content) break;
    }
  }
  const finishReason = d.status === 'incomplete'
    ? d.incomplete_details?.reason === 'max_output_tokens' ? 'length' : 'incomplete'
    : typeof d.status === 'string' ? d.status : null;
  return { content, finishReason };
}

/**
 * Only terminal, supported provider results may reach callers. Unsupported,
 * incomplete, refused, filtered, tool-call, or failed results are fail-soft.
 */
function isUsableAIOutput(
  result: { content: string | null; finishReason: string | null } | null
): result is { content: string; finishReason: string | null } {
  if (!result?.content) return false;
  return result.finishReason === null || result.finishReason === 'stop' || result.finishReason === 'completed';
}

export function isAIConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim()) &&
    validateAIProvider(OPENAI_BASE_URL, DEFAULT_AI_ALLOWED_HOSTS.join(',')).allowed;
}

async function callOpenAIResponses(
  prompt: string,
  opts: { system?: string; maxTokens?: number; temperature?: number } = {}
): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey?.trim()) return null;

  const rawBaseUrl = OPENAI_BASE_URL;
  const providerCheck = validateAIProvider(rawBaseUrl, DEFAULT_AI_ALLOWED_HOSTS.join(','));
  if (!providerCheck.allowed) {
    console.error('callAI provider rejected:', {
      hostname: providerCheck.hostname,
      reason: providerCheck.reason,
    });
    return null;
  }

  const baseUrl = rawBaseUrl.replace(/\/$/, '');
  const model = OPENAI_MODEL;
  const boundedPrompt = boundAIText(prompt, MAX_AI_PROMPT_CHARS);
  const baseSystem =
    opts.system ||
    'Bạn là trợ lý phân tích dữ liệu đánh giá QAQC, trả lời ngắn gọn bằng tiếng Việt. TRẢ LỜI TRỰC TIẾP NỘI DUNG, KHÔNG suy luận dài dòng.';
  const boundedSystem = boundAIText(baseSystem, MAX_AI_SYSTEM_CHARS);

  const attempt = async (
    maxTokens: number,
    extraSystem: string
  ): Promise<{ content: string | null; finishReason: string | null; retryable: boolean }> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45000);
    try {
      const systemContent = boundAIText(boundedSystem + extraSystem, MAX_AI_SYSTEM_CHARS);

      const res = await fetch(`${baseUrl}/responses`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          input: [
            { role: 'system', content: [{ type: 'input_text', text: systemContent }] },
            { role: 'user', content: [{ type: 'input_text', text: boundedPrompt }] },
          ],
          max_output_tokens: maxTokens,
        }),
        signal: controller.signal,
        redirect: 'error',
      });

      if (!res.ok) {
        console.error('callAI HTTP error:', {
          status: res.status,
          hostname: providerCheck.hostname,
          model,
        });
        return {
          content: null,
          finishReason: null,
          retryable: res.status >= 500,
        };
      }

      const data = await res.json();
      const parsed = parseResponsesOutput(data);
      const usable = isUsableAIOutput(parsed);
      return {
        content: parsed.content,
        finishReason: parsed.finishReason,
        retryable: !usable,
      };
    } catch {
      console.error('callAI request error:', {
        hostname: providerCheck.hostname,
        model,
      });
      return {
        content: null,
        finishReason: null,
        retryable: false,
      };
    } finally {
      clearTimeout(timer);
    }
  };

  const maxTokens = opts.maxTokens ?? 1500;

  // Lần 1: token đủ lớn
  const first = await attempt(maxTokens, '');
  if (first?.content && first.finishReason !== 'length') {
    if (isUsableAIOutput(first)) return first.content;
  }
  if (!first?.retryable) return null;

  // Lần 2 (retry): model reasoning có thể ngốn hết token hoặc bị cắt giữa chừng (finish_reason = "length").
  // Tăng token + nhấn mạnh trả lời ngắn trực tiếp.
  const second = await attempt(Math.max(2500, maxTokens * 2), ' TRẢ LỜI NGẮN GỌN TỐI ĐA 8 CÂU, KHÔNG PHÂN TÍCH.');
  if (second?.content && second.finishReason !== 'length') {
    if (isUsableAIOutput(second)) return second.content;
  }
  return null;
}

export async function callAI(
  prompt: string,
  opts: { system?: string; maxTokens?: number; temperature?: number } = {}
): Promise<string | null> {
  return callOpenAIResponses(prompt, opts);
}

// Vision and text use the same Responses API model and server-side key.
export async function callAIVision(
  prompt: string,
  imageBase64: string, // data URL hoặc base64 thuần của ảnh (jpg/png)
  opts: { maxTokens?: number; system?: string } = {}
): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey?.trim()) return null;

  if (!imageBase64 || imageBase64.length > MAX_AI_IMAGE_BASE64_CHARS) {
    return null;
  }

  const rawBaseUrl = OPENAI_BASE_URL;
  const providerCheck = validateAIProvider(rawBaseUrl, DEFAULT_AI_ALLOWED_HOSTS.join(','));
  if (!providerCheck.allowed) {
    console.error('callAIVision provider rejected:', { hostname: providerCheck.hostname, reason: providerCheck.reason });
    return null;
  }

  const baseUrl = rawBaseUrl.replace(/\/$/, '');
  const model = OPENAI_MODEL;
  const inferredMime = imageBase64.startsWith('iVBORw0KGgo') ? 'image/png' : 'image/jpeg';
  const dataUrl = imageBase64.startsWith('data:') ? imageBase64 : `data:${inferredMime};base64,${imageBase64}`;
  const boundedPrompt = boundAIText(prompt, MAX_AI_PROMPT_CHARS);
  const boundedSystem = opts.system ? boundAIText(opts.system, MAX_AI_SYSTEM_CHARS) : '';

  const attempt = async (
    maxTokens: number,
    extraSystem: string
  ): Promise<{ content: string | null; finishReason: string | null; retryable: boolean }> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60000);
    try {
      const textContent = [extraSystem, boundedPrompt].filter(Boolean).join('\n\n');
      const res = await fetch(`${baseUrl}/responses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          input: [
            { role: 'system', content: [{ type: 'input_text', text: boundAIText(boundedSystem, MAX_AI_SYSTEM_CHARS) }] },
            { role: 'user', content: [
              { type: 'input_text', text: boundAIText(textContent, MAX_AI_PROMPT_CHARS) },
              { type: 'input_image', image_url: dataUrl },
            ] },
          ],
          max_output_tokens: maxTokens,
        }),
        signal: controller.signal,
        redirect: 'error',
      });
      if (!res.ok) {
        console.error('callAIVision HTTP error:', {
          status: res.status,
          hostname: providerCheck.hostname,
          model,
        });
        return {
          content: null,
          finishReason: null,
          retryable: res.status >= 500,
        };
      }
      const data = await res.json();
      const parsed = parseResponsesOutput(data);
      const usable = isUsableAIOutput(parsed);
      return {
        content: parsed.content,
        finishReason: parsed.finishReason,
        retryable: !usable,
      };
    } catch {
      console.error('callAIVision request error:', {
        hostname: providerCheck.hostname,
        model,
      });
      return {
        content: null,
        finishReason: null,
        retryable: false,
      };
    } finally {
      clearTimeout(timer);
    }
  };

  const baseTokens = opts.maxTokens ?? 500;

  // Lần 1
  const first = await attempt(baseTokens, '');
  if (first?.content && first.finishReason !== 'length') {
    if (isUsableAIOutput(first)) return first.content;
  }
  if (!first?.retryable) return null;

  // Retry once with a bounded token increase and shorter-answer instruction.
  const second = await attempt(Math.round(baseTokens * 1.5), 'TRẢ LỜI NGẮN GỌN, KHÔNG PHÂN TÍCH DÀI.');
  if (second?.content && second.finishReason !== 'length') {
    if (isUsableAIOutput(second)) return second.content;
  }
  return null;
}