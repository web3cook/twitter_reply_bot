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
    throw new Error(err?.error?.message || `OpenAI error ${resp.status}`);
  }
  const data = await resp.json();
  return data.output[0].content[0].text.replace(/\n{2,}/g, '\n').trim();
}
