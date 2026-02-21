export interface CredentialField {
  key: string;           // env var name
  label: string;         // display name
  required: boolean;
  sensitive?: boolean;    // mask in UI, default true
  placeholder?: string;
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
      { value: 'claude-sonnet-4-6-20250514', label: 'Sonnet 4.6' },
      { value: 'claude-opus-4-6', label: 'Opus 4.6' },
    ],
  },
  {
    id: 'cli',
    name: 'CLI (Claude Code)',
    description: 'Uses the claude CLI binary. Supports OAuth tokens from claude setup-token.',
    engineMode: 'cli',
    credentials: [
      { key: 'CLAUDE_CODE_OAUTH_TOKEN', label: 'Claude OAuth Token', required: false, placeholder: 'From: claude setup-token' },
      { key: 'ANTHROPIC_API_KEY', label: 'Anthropic API Key (fallback)', required: false, placeholder: 'sk-ant-...' },
    ],
    models: [
      { value: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5' },
      { value: 'claude-sonnet-4-6-20250514', label: 'Sonnet 4.6' },
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
      { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
      { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
      { value: 'gemini-2.5-flash-lite-preview-06-17', label: 'Gemini 2.5 Flash Lite' },
    ],
  },
];

export function getCellType(id: string): CellTypeDefinition | undefined {
  return CELL_TYPES.find(ct => ct.id === id);
}

export function listCellTypes(): CellTypeDefinition[] {
  return CELL_TYPES;
}
