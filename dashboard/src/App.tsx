import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Cpu } from 'lucide-react';
import type { Agent } from './types/agent';
import { AgentList } from './components/AgentList';
import { AgentDetail } from './components/AgentDetail';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60, // 1 minute
      retry: 2,
    },
  },
});

function Dashboard() {
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);

  return (
    <div className="flex h-screen bg-gray-900 text-white">
      {/* Sidebar */}
      <aside className="w-72 flex flex-col border-r border-gray-700 bg-gray-900">
        {/* Logo/Title */}
        <div className="flex items-center gap-3 px-4 py-4 border-b border-gray-700">
          <Cpu className="w-8 h-8 text-blue-500" />
          <div>
            <h1 className="text-xl font-bold tracking-tight">NEXUS</h1>
            <p className="text-xs text-gray-500">Agent Control System</p>
          </div>
        </div>

        {/* Agent list */}
        <div className="flex-1 overflow-hidden">
          <AgentList
            selectedAgentId={selectedAgent?.id ?? null}
            onSelectAgent={setSelectedAgent}
          />
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {selectedAgent ? (
          <AgentDetail agent={selectedAgent} />
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center text-gray-500">
              <Cpu className="w-16 h-16 mx-auto mb-4 opacity-30" />
              <h2 className="text-xl font-medium">No Agent Selected</h2>
              <p className="mt-2 text-sm">
                Select an agent from the sidebar or create a new one
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Dashboard />
    </QueryClientProvider>
  );
}

export default App;
