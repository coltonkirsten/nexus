import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AgentOverview } from './components/AgentOverview';
import { AgentDetailPage } from './components/AgentDetailPage';
import { VolumesPage } from './components/VolumesPage';
import { TeamsPage } from './components/TeamsPage';
import { TeamDetailPage } from './components/TeamDetailPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60,
      retry: 2,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<AgentOverview />} />
          <Route path="/teams" element={<TeamsPage />} />
          <Route path="/volumes" element={<VolumesPage />} />
          <Route path="/agent/:agentId/:tab?" element={<AgentDetailPage />} />
          <Route path="/team/:teamId/:tab?" element={<TeamDetailPage />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
