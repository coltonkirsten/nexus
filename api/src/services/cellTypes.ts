export interface CredentialField {
  key: string;           // env var name
  label: string;         // display name
  required: boolean;
  sensitive?: boolean;    // mask in UI, default true
  placeholder?: string;
}

export interface CellTypeDefinition {
  id: string;
  name: string;
  description: string;
  credentials: CredentialField[];
  engineMode: string;    // value for CELL_MODE env var
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
  },
];

export function getCellType(id: string): CellTypeDefinition | undefined {
  return CELL_TYPES.find(ct => ct.id === id);
}

export function listCellTypes(): CellTypeDefinition[] {
  return CELL_TYPES;
}
