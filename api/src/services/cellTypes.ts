export interface CredentialField {
  key: string;           // env var name
  label: string;         // display name
  required: boolean;
  sensitive?: boolean;    // mask in UI, default true
  placeholder?: string;
}

export interface SettingField {
  key: string;           // env var name when enabled
  label: string;         // display name
  description: string;   // explanatory text
  type: 'boolean';       // only boolean for now, can extend later
  default: boolean;
}

export interface ModelOption {
  value: string;   // model ID passed to engine
  label: string;   // display name
}

export interface CellTypeDefinition {
  id: string;
  name: string;
  description: string;
  credentials: CredentialField[];
  settings?: SettingField[];  // optional feature toggles
  engineMode: string;    // value for CELL_MODE env var
  models: ModelOption[];
}

export const CELL_TYPES: CellTypeDefinition[] = [
  {
    id: 'sdk',
    name: 'SDK (API Key)',
    description: 'Uses the Anthropic Agent SDK. Requires an API key from console.anthropic.com.',
    engineMode: 'sdk',
    credentials: [
      { key: 'ANTHROPIC_API_KEY', label: 'Anthropic API Key', required: true, placeholder: 'sk-ant-...' },
    ],
    models: [
      { value: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5' },
      { value: 'claude-sonnet-4-6-20250514', label: 'Sonnet 4.6 (dated)' },
      { value: 'claude-sonnet-4-6', label: 'Sonnet 4.6' },
      { value: 'claude-opus-4-6', label: 'Opus 4.6' },
    ],
  },
  {
    id: 'cli',
    name: 'CLI (Claude Code)',
    description: 'Uses the claude CLI binary with OAuth authentication. Supports long-lived setup tokens.',
    engineMode: 'cli',
    credentials: [
      { key: 'CLAUDE_CODE_OAUTH_TOKEN', label: 'Claude OAuth Token', required: true, placeholder: 'Use `claude setup-token` to generate' },
    ],
    settings: [
      {
        key: 'CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS',
        label: 'Enable Agent Teams',
        description: 'Allows agents to spawn and coordinate with teammate agents in parallel',
        type: 'boolean',
        default: false,
      },
    ],
    models: [
      { value: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5' },
      { value: 'claude-sonnet-4-6-20250514', label: 'Sonnet 4.6 (dated)' },
      { value: 'claude-sonnet-4-6', label: 'Sonnet 4.6' },
      { value: 'claude-opus-4-6', label: 'Opus 4.6' },
    ],
  },
  {
    id: 'gemini',
    name: 'Gemini (Google AI)',
    description: 'Uses the Gemini CLI agent. Requires an API key from aistudio.google.com.',
    engineMode: 'gemini',
    credentials: [
      { key: 'GEMINI_API_KEY', label: 'Google Gemini API Key', required: true, placeholder: 'AIza...' },
    ],
    models: [
      // Gemini 3 Series (newest)
      { value: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro (Preview)' },
      { value: 'gemini-3-pro-preview', label: 'Gemini 3 Pro (Preview)' },
      { value: 'gemini-3-flash-preview', label: 'Gemini 3 Flash (Preview)' },
      // Gemini 2.5 Series (stable)
      { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
      { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
      { value: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite' },
    ],
  },
  {
    id: 'codex',
    name: 'Codex (OpenAI API Key)',
    description: 'Uses the OpenAI Codex CLI with API key authentication. Get your key from platform.openai.com.',
    engineMode: 'codex',
    credentials: [
      { key: 'OPENAI_API_KEY', label: 'OpenAI API Key', required: true, placeholder: 'sk-...' },
    ],
    models: [
      // GPT-5 Series (Flagship)
      { value: 'gpt-5.3-codex', label: 'GPT-5.3 Codex (Recommended)' },
      { value: 'gpt-5.2', label: 'GPT-5.2' },
      { value: 'gpt-5-mini', label: 'GPT-5 Mini' },
      // o-Series Reasoning Models
      { value: 'o3-pro', label: 'o3-pro (Most Powerful)' },
      { value: 'o3', label: 'o3' },
      { value: 'o4-mini', label: 'o4-mini (Fast & Efficient)' },
      // Deep Research
      { value: 'o3-deep-research', label: 'o3 Deep Research' },
      { value: 'o4-mini-deep-research', label: 'o4-mini Deep Research' },
    ],
  },
  {
    id: 'codex-oauth',
    name: 'Codex (ChatGPT Account)',
    description: 'Uses the OpenAI Codex CLI with ChatGPT OAuth. Uses your ChatGPT Plus/Pro subscription.',
    engineMode: 'codex-oauth',
    credentials: [
      { key: 'OPENAI_OAUTH_TOKEN', label: 'ChatGPT OAuth Token', required: true, placeholder: 'Run `codex login` and copy token from ~/.codex/auth.json' },
    ],
    models: [
      // GPT-5 Series (Flagship)
      { value: 'gpt-5.3-codex', label: 'GPT-5.3 Codex (Recommended)' },
      { value: 'gpt-5.2', label: 'GPT-5.2' },
      { value: 'gpt-5-mini', label: 'GPT-5 Mini' },
      // o-Series Reasoning Models
      { value: 'o3-pro', label: 'o3-pro (Most Powerful)' },
      { value: 'o3', label: 'o3' },
      { value: 'o4-mini', label: 'o4-mini (Fast & Efficient)' },
      // Deep Research
      { value: 'o3-deep-research', label: 'o3 Deep Research' },
      { value: 'o4-mini-deep-research', label: 'o4-mini Deep Research' },
    ],
  },
];

export function getCellType(id: string): CellTypeDefinition | undefined {
  return CELL_TYPES.find(ct => ct.id === id);
}

export function listCellTypes(): CellTypeDefinition[] {
  return CELL_TYPES;
}
