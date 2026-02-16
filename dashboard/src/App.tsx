import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AgentOverview } from './components/AgentOverview';
import { AgentDetailPage } from './components/AgentDetailPage';

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
          <Route path="/agent/:agentId" element={<AgentDetailPage />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
