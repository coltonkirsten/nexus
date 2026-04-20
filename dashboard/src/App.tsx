import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { OrchestratorPage } from './components/orchestrator/OrchestratorPage';
import { AgentDetailPage } from './components/AgentDetailPage';
import { VolumesPage } from './components/VolumesPage';
import { TeamsPage } from './components/TeamsPage';
import { TeamDetailPage } from './components/TeamDetailPage';
import { SettingsPage } from './components/SettingsPage';
import { ShortcutCheatsheet } from './components/ShortcutCheatsheet';
import { useGlobalKeyboardShortcuts, focusSearchInput } from './hooks/useKeyboardShortcuts';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60,
      retry: 2,
      // Pause polling when the tab is hidden — saves network + CPU and
      // avoids stacking requests while the user is elsewhere. Queries
      // refetch immediately when the tab becomes visible again.
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
          <Route path="/teams" element={<TeamsPage />} />
          <Route path="/volumes" element={<VolumesPage />} />
          <Route path="/agent/:agentId/:tab?" element={<AgentDetailPage />} />
          <Route path="/team/:teamId/:tab?" element={<TeamDetailPage />} />
          <Route path="/settings" element={<SettingsPage />} />
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
