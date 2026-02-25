import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Save, Loader2, Check, AlertTriangle, Eye, EyeOff, Key, Settings } from 'lucide-react';
import { listCellTypes, getCredentials, setCredentials } from '../api/agents';
import type { CellTypeDefinition } from '../types/agent';

export function CredentialsManager() {
  const queryClient = useQueryClient();
  const [editValues, setEditValues] = useState<Record<string, Record<string, string>>>({});
  const [showValues, setShowValues] = useState<Record<string, Record<string, boolean>>>({});
  const [savedTypes, setSavedTypes] = useState<Set<string>>(new Set());

  const { data: cellTypes } = useQuery({
    queryKey: ['cell-types'],
    queryFn: listCellTypes,
  });

  const { data: credentials } = useQuery({
    queryKey: ['credentials'],
    queryFn: getCredentials,
  });

  const saveMutation = useMutation({
    mutationFn: ({ cellType, values }: { cellType: string; values: Record<string, string> }) =>
      setCredentials(cellType, values),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['credentials'] });
      setSavedTypes(prev => new Set([...prev, variables.cellType]));
      setTimeout(() => {
        setSavedTypes(prev => {
          const next = new Set(prev);
          next.delete(variables.cellType);
          return next;
        });
      }, 3000);
      // Clear edit values for this cell type
      setEditValues(prev => {
        const next = { ...prev };
        delete next[variables.cellType];
        return next;
      });
    },
  });

  const handleInputChange = (cellType: string, key: string, value: string) => {
    setEditValues(prev => ({
      ...prev,
      [cellType]: {
        ...(prev[cellType] || {}),
        [key]: value,
      },
    }));
  };

  const toggleVisibility = (cellType: string, key: string) => {
    setShowValues(prev => ({
      ...prev,
      [cellType]: {
        ...(prev[cellType] || {}),
        [key]: !(prev[cellType]?.[key] ?? false),
      },
    }));
  };

  const handleSave = (cellType: string, fields: CellTypeDefinition['credentials']) => {
    const values: Record<string, string> = {};
    for (const field of fields) {
      const editVal = editValues[cellType]?.[field.key];
      if (editVal !== undefined) {
        values[field.key] = editVal;
      }
    }
    if (Object.keys(values).length > 0) {
      saveMutation.mutate({ cellType, values });
    }
  };

  const hasChanges = (cellType: string) => {
    const edits = editValues[cellType];
    return edits && Object.values(edits).some(v => v !== undefined && v !== '');
  };

  const isConfigured = (cellType: string, fields: CellTypeDefinition['credentials']) => {
    const creds = credentials?.[cellType];
    if (!creds) return false;
    return fields.some(f => creds[f.key] && creds[f.key].length > 0);
  };

  if (!cellTypes) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-5 h-5 animate-spin text-indigo-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {cellTypes.map((ct) => (
        <div
          key={ct.id}
          className="border border-[#1e1e3a] rounded-2xl overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center gap-3 px-6 py-4 bg-[#12121a]">
            <Key className="w-4 h-4 text-indigo-400" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-[#e0e0e8]">{ct.name}</span>
                {isConfigured(ct.id, ct.credentials) ? (
                  <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 bg-emerald-500/10 text-emerald-400 rounded-full">
                    <Check className="w-3 h-3" />
                    Configured
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 bg-amber-500/10 text-amber-400 rounded-full">
                    <AlertTriangle className="w-3 h-3" />
                    Not configured
                  </span>
                )}
              </div>
              <p className="text-xs text-[#4a4a5e] mt-0.5">{ct.description}</p>
            </div>
          </div>

          {/* Credential Fields */}
          <div className="p-6 bg-[#0a0a0f] space-y-4">
            {ct.credentials.map((field) => {
              const maskedValue = credentials?.[ct.id]?.[field.key] || '';
              const isEditing = editValues[ct.id]?.[field.key] !== undefined;
              const isVisible = showValues[ct.id]?.[field.key] ?? false;

              return (
                <div key={field.key}>
                  <label className="flex items-center gap-2 text-xs text-[#7a7a8e] mb-1.5">
                    {field.label}
                    {field.required && <span className="text-red-400">*</span>}
                  </label>
                  <div className="relative">
                    <input
                      type={isVisible ? 'text' : 'password'}
                      value={isEditing ? editValues[ct.id][field.key] : ''}
                      onChange={(e) => handleInputChange(ct.id, field.key, e.target.value)}
                      placeholder={maskedValue || field.placeholder || ''}
                      className="w-full px-4 py-2.5 pr-10 bg-[#0f0f18] border border-[#1e1e3a] rounded-xl text-[#e0e0e8] placeholder-[#4a4a5e] text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 transition-all duration-200"
                    />
                    <button
                      type="button"
                      onClick={() => toggleVisibility(ct.id, field.key)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#4a4a5e] hover:text-[#7a7a8e] transition-colors"
                    >
                      {isVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              );
            })}

            {/* Settings (feature toggles) */}
            {ct.settings && ct.settings.length > 0 && (
              <div className="pt-4 border-t border-[#1e1e3a]">
                <div className="flex items-center gap-2 mb-3">
                  <Settings className="w-3.5 h-3.5 text-[#7a7a8e]" />
                  <span className="text-xs font-medium text-[#7a7a8e] uppercase tracking-wide">Feature Flags</span>
                </div>
                {ct.settings.map((setting) => {
                  const currentValue = credentials?.[ct.id]?.[setting.key] === '1';
                  const editValue = editValues[ct.id]?.[setting.key];
                  const isChecked = editValue !== undefined ? editValue === '1' : currentValue;

                  return (
                    <label
                      key={setting.key}
                      className="flex items-start gap-3 p-3 bg-[#0f0f18] border border-[#1e1e3a] rounded-xl cursor-pointer hover:border-indigo-500/50 transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) => handleInputChange(ct.id, setting.key, e.target.checked ? '1' : '')}
                        className="mt-0.5 w-4 h-4 rounded border-[#3a3a5e] bg-[#0a0a0f] text-indigo-600 focus:ring-indigo-500 focus:ring-offset-0"
                      />
                      <div className="flex-1">
                        <div className="text-sm font-medium text-[#e0e0e8]">{setting.label}</div>
                        <div className="text-xs text-[#7a7a8e] mt-0.5">{setting.description}</div>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}

            {/* Save button */}
            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={() => handleSave(ct.id, ct.credentials)}
                disabled={!hasChanges(ct.id) || saveMutation.isPending}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm rounded-xl hover:bg-indigo-500 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saveMutation.isPending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                Save
              </button>
              {savedTypes.has(ct.id) && (
                <span className="text-xs text-emerald-400">Saved</span>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
