import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { OrchestratorPage } from './components/orchestrator/OrchestratorPage';
import { VolumesPage } from './components/VolumesPage';
import { SettingsPage } from './components/SettingsPage';
import { ShortcutCheatsheet } from './components/ShortcutCheatsheet';
import { useGlobalKeyboardShortcuts, focusSearchInput } from './hooks/useKeyboardShortcuts';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60,
      retry: 2,
      refetchIntervalInBackground: false,
    },
  },
});

function AppShell() {
  const [cheatsheetOpen, setCheatsheetOpen] = useState(false);

  useGlobalKeyboardShortcuts({
    onSlash: focusSearchInput,
    onQuestionMark: () => setCheatsheetOpen(true),
  });

  return (
    <>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<OrchestratorPage />} />
          <Route path="/volumes" element={<VolumesPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          {/* Deprecated routes — fold back into the orchestrator */}
          <Route path="/teams" element={<Navigate to="/" replace />} />
          <Route path="/agent/:agentId/*" element={<Navigate to="/" replace />} />
          <Route path="/team/:teamId/*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
      <ShortcutCheatsheet isOpen={cheatsheetOpen} onClose={() => setCheatsheetOpen(false)} />
    </>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppShell />
    </QueryClientProvider>
  );
}

export default App;
