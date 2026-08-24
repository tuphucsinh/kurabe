import 'server-only';
import {
  boundAIText,
  validateAIProvider,
  MAX_AI_PROMPT_CHARS,
  MAX_AI_SYSTEM_CHARS,
  MAX_AI_IMAGE_BASE64_CHARS,
} from '@/lib/ai-governance';

/**
 * Khung gọi LLM (OpenAI-compatible) — sẵn sàng khi Manager cấp API key.
 * Env server-side: AI_API_KEY (bắt buộc), AI_BASE_URL (mặc định OpenAI), AI_MODEL (mặc định gpt-4o-mini),
 * AI_ALLOWED_HOSTS (tùy chọn host allowlist).
 * Fail-soft: thiếu key / lỗi / timeout / host rejected → trả null (KHÔNG bao giờ làm vỡ app).
 * KHÔNG BAO GIỜ import vào client component (key là bí mật).
 */

// gpt-5.6-luna: trả content ổn định qua opencode.ai/zen/go/v1 — theo OpenCode Go docs model này
// chỉ nhận Responses API (${base}/responses); /chat/completions trả HTTP 500 (deepseek-v4-flash reasoning
// ngốn hết max_tokens → content rỗng với prompt dài).
const DEFAULT_MODEL = 'gpt-5.6-luna';

/**
 * Parse phản hồi chat/completions (OpenAI-compatible): choices[0].message.content.
 */
function parseChatCompletionsOutput(data: unknown): { content: string | null; finishReason: string | null } {
  const d = data as {
    choices?: Array<{ message?: { content?: unknown }; finish_reason?: unknown }>;
  } | null;
  const choice = d?.choices?.[0];
  const text = choice?.message?.content;
  const finishReason = typeof choice?.finish_reason === 'string' ? choice.finish_reason : null;
  const content = typeof text === 'string' && text.trim() ? text.trim() : null;
  return { content, finishReason };
}

/**
 * Parse phản hồi Responses API (gpt-5.6-luna qua ${base}/responses):
 * ưu tiên data.output_text; nếu thiếu/rỗng, dò output[].content[].{output_text|text}.
 * Content thiếu/blank → null. status "incomplete" do max_output_tokens → finishReason "length"
 * để tái sử dụng hành vi retry chung (không vỡ parsing chat/completions).
 */
function parseResponsesOutput(data: unknown): { content: string | null; finishReason: string | null } {
  const d = data as {
    output_text?: unknown;
    output?: unknown;
    status?: unknown;
    incomplete_details?: { reason?: unknown };
  } | null;
  if (!d || typeof d !== 'object') {
    return { content: null, finishReason: null };
  }

  let content: string | null = null;
  const topLevelText = d.output_text;
  if (typeof topLevelText === 'string' && topLevelText.trim()) {
    content = topLevelText.trim();
  } else {
    const outputs = Array.isArray(d.output) ? (d.output as Array<{ type?: unknown; content?: unknown }>) : [];
    for (const item of outputs) {
      if (!item || typeof item !== 'object') continue;
      if (item.type !== 'message') continue;
      const parts = Array.isArray(item.content) ? (item.content as Array<{ type?: unknown; text?: unknown }>) : [];
      for (const part of parts) {
        if (!part || typeof part !== 'object') continue;
        if (part.type !== 'output_text' && part.type !== 'text') continue;
        const text = part.text;
        if (typeof text === 'string' && text.trim()) {
          content = text.trim();
          break;
        }
      }
      if (content !== null) break;
    }
  }

  let finishReason: string | null = null;
  if (typeof d.status === 'string') {
    if (d.status === 'incomplete') {
      finishReason = d.incomplete_details?.reason === 'max_output_tokens' ? 'length' : 'incomplete';
    } else {
      finishReason = d.status;
    }
  }
  return { content, finishReason };
}

export function isAIConfigured(): boolean {
  return Boolean(process.env.AI_API_KEY);
}

export async function callAI(
  prompt: string,
  opts: { system?: string; maxTokens?: number; temperature?: number } = {}
): Promise<string | null> {
  const apiKey = process.env.AI_API_KEY;
  if (!apiKey) return null;

  const rawBaseUrl = process.env.AI_BASE_URL || 'https://api.openai.com/v1';
  const providerCheck = validateAIProvider(rawBaseUrl, process.env.AI_ALLOWED_HOSTS);
  if (!providerCheck.allowed) {
    console.error('callAI provider rejected:', {
      hostname: providerCheck.hostname,
      reason: providerCheck.reason,
    });
    return null;
  }

  const baseUrl = rawBaseUrl.replace(/\/$/, '');
  const model = process.env.AI_MODEL || DEFAULT_MODEL;
  // gpt-5.6-luna (OpenCode Go) chỉ nhận Responses API — chat/completions trả HTTP 500.
  // Các model chat-completions khác và callAIVision giữ nguyên endpoint cũ.
  const useResponses = model === 'gpt-5.6-luna';
  const boundedPrompt = boundAIText(prompt, MAX_AI_PROMPT_CHARS);
  const baseSystem =
    opts.system ||
    'Bạn là trợ lý phân tích dữ liệu đánh giá QAQC, trả lời ngắn gọn bằng tiếng Việt. TRẢ LỜI TRỰC TIẾP NỘI DUNG, KHÔNG suy luận dài dòng.';
  const boundedSystem = boundAIText(baseSystem, MAX_AI_SYSTEM_CHARS);

  const attempt = async (
    maxTokens: number,
    extraSystem: string
  ): Promise<{ content: string | null; finishReason: string | null } | null> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45000);
    try {
      const systemContent = boundAIText(boundedSystem + extraSystem, MAX_AI_SYSTEM_CHARS);

      const endpoint = useResponses ? `${baseUrl}/responses` : `${baseUrl}/chat/completions`;
      const rawBody = useResponses
        ? {
            model,
            input: [
              { role: 'system', content: [{ type: 'input_text', text: systemContent }] },
              { role: 'user', content: [{ type: 'input_text', text: boundedPrompt }] },
            ],
            max_output_tokens: maxTokens,
          }
        : {
            model,
            messages: [
              { role: 'system', content: systemContent },
              { role: 'user', content: boundedPrompt },
            ],
            max_tokens: maxTokens,
            temperature: opts.temperature ?? 0.3,
          };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(rawBody),
        signal: controller.signal,
      });

      if (!res.ok) {
        console.error('callAI HTTP error:', {
          status: res.status,
          hostname: providerCheck.hostname,
          model,
        });
        return null;
      }

      const data = await res.json();
      return useResponses ? parseResponsesOutput(data) : parseChatCompletionsOutput(data);
    } catch {
      console.error('callAI request error:', {
        hostname: providerCheck.hostname,
        model,
      });
      return null;
    } finally {
      clearTimeout(timer);
    }
  };

  const maxTokens = opts.maxTokens ?? 1500;

  // Lần 1: token đủ lớn
  const first = await attempt(maxTokens, '');
  if (first?.content && first.finishReason !== 'length') {
    return first.content;
  }

  // Lần 2 (retry): model reasoning có thể ngốn hết token hoặc bị cắt giữa chừng (finish_reason = "length").
  // Tăng token + nhấn mạnh trả lời ngắn trực tiếp.
  const second = await attempt(Math.max(2500, maxTokens * 2), ' TRẢ LỜI NGẮN GỌN TỐI ĐA 8 CÂU, KHÔNG PHÂN TÍCH.');
  if (second?.content && second.finishReason !== 'length') {
    return second.content;
  }
  return null;
}

// Vision: gửi ảnh (base64 dataURL) + text — model vision riêng (gpt-5.6-luna KHÔNG nhận ảnh — đã test 400; qwen3.7-plus hoạt động).
const DEFAULT_VISION_MODEL = 'qwen3.7-plus';

export async function callAIVision(
  prompt: string,
  imageBase64: string, // data URL hoặc base64 thuần của ảnh (jpg/png)
  opts: { maxTokens?: number; system?: string } = {}
): Promise<string | null> {
  const apiKey = process.env.AI_API_KEY;
  if (!apiKey) return null;

  if (!imageBase64 || imageBase64.length > MAX_AI_IMAGE_BASE64_CHARS) {
    return null;
  }

  const rawBaseUrl = process.env.AI_BASE_URL || 'https://api.openai.com/v1';
  const providerCheck = validateAIProvider(rawBaseUrl, process.env.AI_ALLOWED_HOSTS);
  if (!providerCheck.allowed) {
    console.error('callAIVision provider rejected:', {
      hostname: providerCheck.hostname,
      reason: providerCheck.reason,
    });
    return null;
  }

  const baseUrl = rawBaseUrl.replace(/\/$/, '');
  const model = process.env.AI_VISION_MODEL || DEFAULT_VISION_MODEL;
  const dataUrl = imageBase64.startsWith('data:') ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`;
  const boundedPrompt = boundAIText(prompt, MAX_AI_PROMPT_CHARS);
  const boundedSystem = opts.system ? boundAIText(opts.system, MAX_AI_SYSTEM_CHARS) : '';

  const attempt = async (
    maxTokens: number,
    extraSystem: string
  ): Promise<{ content: string | null; finishReason: string | null } | null> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60000);
    try {
      // Vision endpoint chỉ nhận message 'user' — retry extraSystem và system rules ghép vào đầu text content
      const textContent = [extraSystem, boundedSystem, boundedPrompt].filter(Boolean).join('\n\n');
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: boundAIText(textContent, MAX_AI_PROMPT_CHARS) },
                { type: 'image_url', image_url: { url: dataUrl } },
              ],
            },
          ],
          max_tokens: maxTokens,
          temperature: 0.3,
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        console.error('callAIVision HTTP error:', {
          status: res.status,
          hostname: providerCheck.hostname,
          model,
        });
        return null;
      }
      const data = await res.json();
      const choice = data?.choices?.[0];
      const text = choice?.message?.content;
      const finishReason = typeof choice?.finish_reason === 'string' ? choice.finish_reason : null;
      const content = typeof text === 'string' && text.trim() ? text.trim() : null;
      return { content, finishReason };
    } catch {
      console.error('callAIVision request error:', {
        hostname: providerCheck.hostname,
        model,
      });
      return null;
    } finally {
      clearTimeout(timer);
    }
  };

  const baseTokens = opts.maxTokens ?? 500;

  // Lần 1
  const first = await attempt(baseTokens, '');
  if (first?.content && first.finishReason !== 'length') {
    return first.content;
  }

  // Lần 2 (retry): tăng maxTokens (×1.5) + nhấn mạnh trả lời ngắn gọn
  const second = await attempt(Math.round(baseTokens * 1.5), 'TRẢ LỜI NGẮN GỌN, KHÔNG PHÂN TÍCH DÀI.');
  if (second?.content && second.finishReason !== 'length') {
    return second.content;
  }
  return null;
}