import { NavLink } from 'react-router-dom';
import { CredentialsManager } from './CredentialsManager';

export function SettingsPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0f]">
      {/* Top bar */}
      <div className="border-b border-[#1e1e3a]">
        <div className="max-w-4xl mx-auto px-8 flex items-center justify-between h-14">
          <h1 className="text-sm font-semibold text-[#e0e0e8]">Settings</h1>
          <nav className="flex items-center gap-4">
            <NavLink
              to="/"
              className="text-xs text-[#7a7a8e] hover:text-[#e0e0e8] transition-colors"
            >
              Orchestrator
            </NavLink>
            <NavLink
              to="/teams"
              className="text-xs text-[#7a7a8e] hover:text-[#e0e0e8] transition-colors"
            >
              Teams
            </NavLink>
            <NavLink
              to="/volumes"
              className="text-xs text-[#7a7a8e] hover:text-[#e0e0e8] transition-colors"
            >
              Volumes
            </NavLink>
            <NavLink
              to="/settings"
              className={({ isActive }) =>
                `text-xs transition-colors ${isActive ? 'text-indigo-400' : 'text-[#7a7a8e] hover:text-[#e0e0e8]'}`
              }
            >
              Settings
            </NavLink>
          </nav>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto p-8">
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-[#e0e0e8]">Credentials</h2>
          <p className="text-xs text-[#4a4a5e] mt-1">
            Configure API keys and tokens for each cell type. Credentials are stored securely and injected into agent containers at runtime.
          </p>
        </div>
        <CredentialsManager />
      </div>
    </div>
  );
}
