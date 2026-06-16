export const PROVIDERS = {
  openai: {
    name: 'OpenAI',
    keyLabel: 'OpenAI API Key',
    keyPlaceholder: 'sk-...',
    storageKey: 'openaiApiKey',
    defaultModel: 'gpt-5.4',
    models: [
      { id: 'gpt-5.4',        label: 'GPT-5.4 (default)' },
      { id: 'gpt-4o',         label: 'GPT-4o' },
      { id: 'gpt-4o-mini',    label: 'GPT-4o mini' },
      { id: 'gpt-4-turbo',    label: 'GPT-4 Turbo' },
      { id: 'gpt-3.5-turbo',  label: 'GPT-3.5 Turbo' },
    ],
  },
  deepseek: {
    name: 'DeepSeek',
    keyLabel: 'DeepSeek API Key',
    keyPlaceholder: 'sk-...',
    storageKey: 'deepseekApiKey',
    defaultModel: 'deepseek-chat',
    models: [
      { id: 'deepseek-chat',     label: 'DeepSeek Chat' },
      { id: 'deepseek-reasoner', label: 'DeepSeek Reasoner' },
    ],
  },
  anthropic: {
    name: 'Claude (Anthropic)',
    keyLabel: 'Anthropic API Key',
    keyPlaceholder: 'sk-ant-...',
    storageKey: 'anthropicApiKey',
    defaultModel: 'claude-sonnet-4-6',
    models: [
      { id: 'claude-opus-4-8',           label: 'Claude Opus 4.8' },
      { id: 'claude-sonnet-4-6',         label: 'Claude Sonnet 4.6' },
      { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' },
    ],
  },
  xai: {
    name: 'xAI (Grok)',
    keyLabel: 'xAI API Key',
    keyPlaceholder: 'xai-...',
    storageKey: 'xaiApiKey',
    defaultModel: 'grok-3',
    models: [
      { id: 'grok-3',      label: 'Grok 3' },
      { id: 'grok-3-mini', label: 'Grok 3 Mini' },
      { id: 'grok-2',      label: 'Grok 2' },
    ],
  },
};

// Reasoning-style models that reject the temperature parameter
export const NO_TEMPERATURE_MODELS = [
  'gpt-5', 'gpt-5-mini', 'gpt-5-nano', 'gpt-5.5',
  'deepseek-reasoner',
];

export function supportsTemperature(model) {
  return !NO_TEMPERATURE_MODELS.some(m => model === m || model.startsWith(m + '-'));
}

function isBillingError(status, errData) {
  if (status === 402) return true;
  const code = errData?.error?.code || '';
  const msg  = (errData?.error?.message || errData?.message || '').toLowerCase();
  return code === 'insufficient_quota' ||
    msg.includes('insufficient') ||
    msg.includes('quota') ||
    msg.includes('billing') ||
    msg.includes('credit') ||
    msg.includes('balance') ||
    msg.includes('payment');
}

export async function callLLM(tweetText, apiKey, prompt, model, provider) {
  const resolvedModel = model || PROVIDERS[provider]?.defaultModel || 'gpt-5.4';

  if (provider === 'anthropic') {
    const body = {
      model: resolvedModel,
      max_tokens: 150,
      system: prompt,
      messages: [{ role: 'user', content: tweetText + ' Reply in character.' }],
      temperature: 0.7,
    };
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      if (isBillingError(resp.status, err)) throw new Error('RECHARGE_REQUIRED');
      throw new Error(err?.error?.message || `Anthropic error ${resp.status}`);
    }
    const data = await resp.json();
    return data.content[0].text.replace(/\n{2,}/g, '\n').trim();
  }

  if (provider === 'deepseek' || provider === 'xai') {
    const url = provider === 'deepseek'
      ? 'https://api.deepseek.com/chat/completions'
      : 'https://api.x.ai/v1/chat/completions';
    const body = {
      model: resolvedModel,
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: tweetText + ' Reply in character.' },
      ],
      max_tokens: 150,
    };
    if (supportsTemperature(resolvedModel)) body.temperature = 0.7;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      if (isBillingError(resp.status, err)) throw new Error('RECHARGE_REQUIRED');
      throw new Error(err?.error?.message || `${PROVIDERS[provider].name} error ${resp.status}`);
    }
    const data = await resp.json();
    return data.choices[0].message.content.replace(/\n{2,}/g, '\n').trim();
  }

  // Default: OpenAI Responses API
  const body = {
    model: resolvedModel,
    max_output_tokens: 150,
    instructions: prompt,
    input: tweetText + ' Reply in character.',
  };
  if (supportsTemperature(resolvedModel)) body.temperature = 0.7;
  const resp = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    if (isBillingError(resp.status, err)) throw new Error('RECHARGE_REQUIRED');
    throw new Error(err?.error?.message || `OpenAI error ${resp.status}`);
  }
  const data = await resp.json();
  return data.output[0].content[0].text.replace(/\n{2,}/g, '\n').trim();
}

// ── Persona / tone generation ──────────────────────────────────────────────────
// Analyzes a sample of someone's tweets and produces a reusable voice prompt in a
// fixed format. Separate from callLLM because it needs many more output tokens and
// must NOT append the "Reply in character" suffix.

const PERSONA_MAX_TOKENS = 1000;

const PERSONA_INSTRUCTIONS = `You are an expert at analyzing how people write on X (Twitter) and turning their style into a reusable persona prompt that another AI will use to write replies in their voice.

You will receive a person's name, @handle, and a sample of their recent posts and replies. Study their tone, core vibe, sentiment, perspective, humor, capitalization, sentence length, slang, punctuation, and recurring themes.

Then output a persona prompt in EXACTLY the format below. Rules:
- Fill in every <...> placeholder with specifics drawn from the samples. Never leave a placeholder unfilled and never output the angle brackets.
- Keep the first two fixed style rules, then add 3 to 5 more style rules that capture how THIS person specifically writes (e.g. always lowercase, very short, dry, uses certain words).
- In the examples section, list 6 to 8 of the most characteristic SHORT lines taken from their real posts or replies (verbatim or lightly trimmed, one per line, each prefixed with "- ").
- Output ONLY the persona prompt. No preamble, no explanation, no markdown code fences.

FORMAT:
You are replying on X exactly like <Person Name>. <occupation / short identity>
Core Vibe: <...>
Sentiment: <...>
Perspective: <...>
STRICT STYLE RULES (never break these):
- Never use emoji or emdash
- Never be mean-spirited or punch down on someone's feelings
- Sound human and not AI
- <style rule derived from their writing>
- <style rule derived from their writing>
- <style rule derived from their writing>
EXACT VOICE EXAMPLES TO MATCH PERFECTLY(These are just examples don't use as it is):
- <real short line>
- <real short line>
- <real short line>
- <real short line>
- <real short line>
- <real short line>
Your replies should feel like <how this person sounds, one short phrase>. Always reply in 1 line`;

export async function generatePersona(samplesText, apiKey, model, provider) {
  const resolvedModel = model || PROVIDERS[provider]?.defaultModel || 'gpt-5.4';

  if (provider === 'anthropic') {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: resolvedModel,
        max_tokens: PERSONA_MAX_TOKENS,
        system: PERSONA_INSTRUCTIONS,
        messages: [{ role: 'user', content: samplesText }],
        temperature: 0.5,
      }),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      if (isBillingError(resp.status, err)) throw new Error('RECHARGE_REQUIRED');
      throw new Error(err?.error?.message || `Anthropic error ${resp.status}`);
    }
    const data = await resp.json();
    return data.content[0].text.trim();
  }

  if (provider === 'deepseek' || provider === 'xai') {
    const url = provider === 'deepseek'
      ? 'https://api.deepseek.com/chat/completions'
      : 'https://api.x.ai/v1/chat/completions';
    const body = {
      model: resolvedModel,
      messages: [
        { role: 'system', content: PERSONA_INSTRUCTIONS },
        { role: 'user', content: samplesText },
      ],
      max_tokens: PERSONA_MAX_TOKENS,
    };
    if (supportsTemperature(resolvedModel)) body.temperature = 0.5;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      if (isBillingError(resp.status, err)) throw new Error('RECHARGE_REQUIRED');
      throw new Error(err?.error?.message || `${PROVIDERS[provider].name} error ${resp.status}`);
    }
    const data = await resp.json();
    return data.choices[0].message.content.trim();
  }

  // Default: OpenAI Responses API
  const body = {
    model: resolvedModel,
    max_output_tokens: PERSONA_MAX_TOKENS,
    instructions: PERSONA_INSTRUCTIONS,
    input: samplesText,
  };
  if (supportsTemperature(resolvedModel)) body.temperature = 0.5;
  const resp = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    if (isBillingError(resp.status, err)) throw new Error('RECHARGE_REQUIRED');
    throw new Error(err?.error?.message || `OpenAI error ${resp.status}`);
  }
  const data = await resp.json();
  return data.output[0].content[0].text.trim();
}
