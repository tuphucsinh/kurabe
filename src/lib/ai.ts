/**
 * Khung gọi LLM (OpenAI-compatible) — sẵn sàng khi Manager cấp API key.
 * Env server-side: AI_API_KEY (bắt buộc), AI_BASE_URL (mặc định OpenAI), AI_MODEL (mặc định gpt-4o-mini).
 * Fail-soft: thiếu key / lỗi / timeout → trả null (KHÔNG bao giờ làm vỡ app).
 * KHÔNG BAO GIỜ import vào client component (key là bí mật).
 */

const DEFAULT_MODEL = 'gpt-4o-mini';

export function isAIConfigured(): boolean {
  return Boolean(process.env.AI_API_KEY);
}

export async function callAI(
  prompt: string,
  opts: { system?: string; maxTokens?: number; temperature?: number } = {}
): Promise<string | null> {
  const apiKey = process.env.AI_API_KEY;
  if (!apiKey) return null;

  const baseUrl = (process.env.AI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
  const model = process.env.AI_MODEL || DEFAULT_MODEL;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);

    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: opts.system || 'Bạn là trợ lý phân tích dữ liệu đánh giá QAQC, trả lời ngắn gọn bằng tiếng Việt. TRẢ LỜI TRỰC TIẾP NỘI DUNG, KHÔNG suy luận dài dòng.' },
          { role: 'user', content: prompt },
        ],
        max_tokens: opts.maxTokens ?? 800,
        temperature: opts.temperature ?? 0.3,
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      console.error('callAI HTTP error:', res.status);
      return null;
    }

    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content;
    return typeof text === 'string' && text.trim() ? text.trim() : null;
  } catch (err) {
    console.error('callAI error:', err);
    return null;
  }
}
