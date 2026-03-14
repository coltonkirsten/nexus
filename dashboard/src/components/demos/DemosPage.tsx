import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Cpu, Sparkles, Calculator, Hash, Microscope, ArrowLeft, Play, Users } from 'lucide-react';

type DemoType = 'simulator' | 'revenue' | 'tokens' | 'prompt' | null;

interface DemoItem {
  id: DemoType;
  title: string;
  description: string;
  emoji: string;
  category: 'Interactive' | 'Tool' | 'Visualization';
  icon: typeof Sparkles;
}

const demos: DemoItem[] = [
  {
    id: 'simulator',
    title: 'Agent Team Simulator',
    description: 'Watch AI agents collaborate in real-time. See how a CEO agent delegates tasks to specialists and how they communicate through the mailbox system.',
    emoji: '🤖',
    category: 'Interactive',
    icon: Users,
  },
  {
    id: 'revenue',
    title: 'Revenue Calculator',
    description: 'Calculate potential revenue from agent-powered services. Input your client count and service mix to see projected monthly recurring revenue.',
    emoji: '💰',
    category: 'Tool',
    icon: Calculator,
  },
  {
    id: 'tokens',
    title: 'Token Counter',
    description: 'Estimate token usage and costs for different prompts. Compare costs across Claude models and optimize your prompts for efficiency.',
    emoji: '🔢',
    category: 'Tool',
    icon: Hash,
  },
  {
    id: 'prompt',
    title: 'Prompt Analyzer',
    description: 'Analyze prompt structure and get suggestions for improvement. See how prompt engineering techniques can improve your results.',
    emoji: '🔬',
    category: 'Visualization',
    icon: Microscope,
  },
];

const categoryColors = {
  Interactive: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/30',
  Tool: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
  Visualization: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
};

export function DemosPage() {
  const [activeDemo, setActiveDemo] = useState<DemoType>(null);

  return (
    <div className="min-h-screen bg-[#0a0a0f]">
      {/* Header */}
      <header className="border-b border-[#1e1e3a]">
        <div className="px-4 md:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Cpu className="w-6 h-6 text-indigo-400" />
            <div>
              <h1 className="text-base font-bold text-[#e0e0e8] tracking-tight">NEXUS</h1>
              <p className="text-[9px] text-[#4a4a5e] tracking-wide uppercase hidden sm:block">Agent Control System</p>
            </div>
          </div>
          <nav className="flex gap-4">
            <NavLink
              to="/"
              className="text-xs text-[#4a4a5e] hover:text-[#7a7a8e] transition-all duration-200"
            >
              Orchestrator
            </NavLink>
            <NavLink
              to="/teams"
              className="text-xs text-[#4a4a5e] hover:text-[#7a7a8e] transition-all duration-200"
            >
              Teams
            </NavLink>
            <NavLink
              to="/volumes"
              className="text-xs text-[#4a4a5e] hover:text-[#7a7a8e] transition-all duration-200"
            >
              Volumes
            </NavLink>
            <NavLink
              to="/demos"
              className="text-xs text-indigo-400 transition-all duration-200"
            >
              Demos
            </NavLink>
            <NavLink
              to="/settings"
              className="text-xs text-[#4a4a5e] hover:text-[#7a7a8e] transition-all duration-200"
            >
              Settings
            </NavLink>
          </nav>
        </div>
      </header>

      {/* Content */}
      <div className="p-6">
        {activeDemo ? (
          <div>
            <button
              onClick={() => setActiveDemo(null)}
              className="flex items-center gap-2 text-sm text-[#7a7a8e] hover:text-[#e0e0e8] mb-6 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Demos
            </button>
            {activeDemo === 'simulator' && <AgentTeamSimulator />}
            {activeDemo === 'revenue' && <RevenueCalculator />}
            {activeDemo === 'tokens' && <TokenCounter />}
            {activeDemo === 'prompt' && <PromptAnalyzer />}
          </div>
        ) : (
          <div>
            <div className="flex items-center gap-3 mb-6">
              <Sparkles className="w-6 h-6 text-amber-400" />
              <h2 className="text-xl font-bold text-[#e0e0e8]">Interactive Demos</h2>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {demos.map((demo) => (
                <button
                  key={demo.id}
                  onClick={() => setActiveDemo(demo.id)}
                  className="text-left p-6 bg-[#12121a] border border-[#1e1e3a] rounded-xl hover:border-indigo-500/50 transition-all duration-200 group"
                >
                  <div className="text-4xl mb-4">{demo.emoji}</div>
                  <h3 className="text-lg font-semibold text-[#e0e0e8] mb-2 group-hover:text-indigo-400 transition-colors">
                    {demo.title}
                  </h3>
                  <p className="text-sm text-[#7a7a8e] mb-4 line-clamp-2">
                    {demo.description}
                  </p>
                  <span className={`inline-block text-xs px-2 py-1 rounded-full border ${categoryColors[demo.category]}`}>
                    {demo.category}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============= AGENT TEAM SIMULATOR =============

interface SimulatedAgent {
  name: string;
  role: string;
  emoji: string;
  color: string;
}

interface SimulatedMessage {
  id: number;
  fromIndex: number;
  toIndex: number | null;
  content: string;
  timestamp: Date;
}

const agents: SimulatedAgent[] = [
  { name: 'Maxwell', role: 'CEO', emoji: '👔', color: 'text-purple-400' },
  { name: 'Atlas', role: 'Developer', emoji: '💻', color: 'text-blue-400' },
  { name: 'Quinn', role: 'QA', emoji: '🔍', color: 'text-green-400' },
  { name: 'Wren', role: 'Content', emoji: '✍️', color: 'text-orange-400' },
  { name: 'Pixel', role: 'Design', emoji: '🎨', color: 'text-pink-400' },
];

function AgentTeamSimulator() {
  const [isRunning, setIsRunning] = useState(false);
  const [messages, setMessages] = useState<SimulatedMessage[]>([]);
  const [taskDescription, setTaskDescription] = useState('Write a blog post about AI agents');

  const scenarios = [
    { from: 0, to: null, content: `Team, we have a new task: ${taskDescription}. Let me break this down and assign responsibilities.` },
    { from: 0, to: 3, content: "Wren, I need you to draft the main content. Focus on clarity and engagement." },
    { from: 3, to: 0, content: "Got it, Maxwell. I'll start with an outline and then flesh out the sections." },
    { from: 0, to: 1, content: "Atlas, can you prepare any code examples we might need to illustrate the concepts?" },
    { from: 1, to: 0, content: "On it. I'll create some clean, documented examples." },
    { from: 0, to: 4, content: "Pixel, please design some visual assets to accompany the post." },
    { from: 4, to: 0, content: "Will do! I'll create some diagrams and infographics." },
    { from: 3, to: 0, content: "Maxwell, I've completed the first draft. Ready for review." },
    { from: 0, to: 2, content: "Quinn, please review Wren's draft for accuracy and clarity." },
    { from: 2, to: 0, content: "Reviewing now. I'll check for technical accuracy and flow." },
    { from: 1, to: 0, content: "Code examples are ready. Tested and documented." },
    { from: 4, to: 0, content: "Visual assets complete. Created 3 diagrams and 2 infographics." },
    { from: 2, to: 0, content: "Review complete. Found a few minor issues, otherwise looks great." },
    { from: 0, to: null, content: "Excellent work, team! All pieces are coming together. Let me compile the final deliverable." },
    { from: 0, to: null, content: "✅ Task complete! Blog post is ready for publication." },
  ];

  const startSimulation = () => {
    setIsRunning(true);
    setMessages([]);
    simulateMessages(0);
  };

  const simulateMessages = (index: number) => {
    if (index >= scenarios.length) {
      setIsRunning(false);
      return;
    }

    const scenario = scenarios[index];
    const newMessage: SimulatedMessage = {
      id: Date.now(),
      fromIndex: scenario.from,
      toIndex: scenario.to,
      content: scenario.content,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, newMessage]);

    setTimeout(() => {
      simulateMessages(index + 1);
    }, 1500 + Math.random() * 1500);
  };

  const stopSimulation = () => {
    setIsRunning(false);
  };

  return (
    <div className="max-w-4xl">
      <h3 className="text-xl font-bold text-[#e0e0e8] mb-4">Agent Team Simulator</h3>

      {/* Task Input */}
      <div className="mb-4 p-4 bg-[#12121a] border border-[#1e1e3a] rounded-xl">
        <label className="block text-xs text-[#7a7a8e] mb-2 uppercase tracking-wide">Task</label>
        <input
          type="text"
          value={taskDescription}
          onChange={(e) => setTaskDescription(e.target.value)}
          disabled={isRunning}
          className="w-full bg-[#0a0a0f] border border-[#1e1e3a] rounded-lg px-4 py-2 text-[#e0e0e8] text-sm focus:outline-none focus:border-indigo-500/50 disabled:opacity-50"
          placeholder="Enter a task for the team..."
        />
      </div>

      {/* Messages */}
      <div className="mb-4 h-96 overflow-y-auto p-4 bg-[#0a0a0f] border border-[#1e1e3a] rounded-xl space-y-3">
        {messages.length === 0 && !isRunning && (
          <div className="flex items-center justify-center h-full text-[#4a4a5e] text-sm">
            Click Start to begin the simulation
          </div>
        )}
        {messages.map((msg) => {
          const fromAgent = agents[msg.fromIndex];
          const toAgent = msg.toIndex !== null ? agents[msg.toIndex] : null;
          return (
            <div key={msg.id} className="flex gap-3 animate-fadeIn">
              <div className="text-2xl">{fromAgent.emoji}</div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-sm font-medium ${fromAgent.color}`}>{fromAgent.name}</span>
                  {toAgent ? (
                    <>
                      <span className="text-[#4a4a5e]">→</span>
                      <span className={`text-sm ${toAgent.color}`}>{toAgent.name}</span>
                    </>
                  ) : (
                    <span className="text-xs text-[#4a4a5e]">(to team)</span>
                  )}
                </div>
                <p className="text-sm text-[#e0e0e8]">{msg.content}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3">
        <div className="flex -space-x-2">
          {agents.map((agent, i) => (
            <div
              key={i}
              className="w-8 h-8 rounded-full bg-[#1a1a2e] flex items-center justify-center border-2 border-[#0a0a0f]"
              title={`${agent.name} - ${agent.role}`}
            >
              {agent.emoji}
            </div>
          ))}
        </div>
        <div className="flex-1" />
        {messages.length > 0 && !isRunning && (
          <button
            onClick={() => setMessages([])}
            className="px-4 py-2 text-sm text-[#7a7a8e] hover:text-[#e0e0e8] transition-colors"
          >
            Clear
          </button>
        )}
        <button
          onClick={isRunning ? stopSimulation : startSimulation}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            isRunning
              ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
              : 'bg-indigo-600 text-white hover:bg-indigo-500'
          }`}
        >
          <Play className="w-4 h-4" />
          {isRunning ? 'Stop' : 'Start'}
        </button>
      </div>
    </div>
  );
}

// ============= REVENUE CALCULATOR =============

function RevenueCalculator() {
  const [clientCount, setClientCount] = useState(10);
  const [avgMonthlyFee, setAvgMonthlyFee] = useState(500);
  const [agentHourlyCost, setAgentHourlyCost] = useState(5);
  const [hoursPerClient, setHoursPerClient] = useState(10);
  const [overheadPercentage, setOverheadPercentage] = useState(20);

  const monthlyRevenue = clientCount * avgMonthlyFee;
  const agentCost = clientCount * hoursPerClient * agentHourlyCost;
  const overhead = monthlyRevenue * (overheadPercentage / 100);
  const monthlyCost = agentCost + overhead;
  const monthlyProfit = monthlyRevenue - monthlyCost;
  const profitMargin = monthlyRevenue > 0 ? (monthlyProfit / monthlyRevenue) * 100 : 0;
  const annualProfit = monthlyProfit * 12;

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);

  return (
    <div className="max-w-2xl">
      <h3 className="text-xl font-bold text-[#e0e0e8] mb-6">Revenue Calculator</h3>

      {/* Summary Card */}
      <div className="mb-6 p-6 bg-gradient-to-br from-[#12121a] to-[#1a1a2e] border border-[#1e1e3a] rounded-xl text-center">
        <div className="text-xs text-[#7a7a8e] uppercase tracking-wide mb-2">Monthly Profit</div>
        <div className={`text-4xl font-bold ${monthlyProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
          {formatCurrency(monthlyProfit)}
        </div>
        <div className="mt-4 flex justify-center gap-8">
          <div>
            <div className="text-xs text-[#7a7a8e]">Margin</div>
            <div className={`text-lg font-semibold ${profitMargin >= 50 ? 'text-emerald-400' : profitMargin >= 30 ? 'text-amber-400' : 'text-red-400'}`}>
              {profitMargin.toFixed(1)}%
            </div>
          </div>
          <div>
            <div className="text-xs text-[#7a7a8e]">Annual</div>
            <div className="text-lg font-semibold text-indigo-400">
              {formatCurrency(annualProfit)}
            </div>
          </div>
        </div>
      </div>

      {/* Inputs */}
      <div className="space-y-4 mb-6">
        <SliderInput label="Number of Clients" value={clientCount} onChange={setClientCount} min={1} max={100} format={(v) => `${v} clients`} />
        <SliderInput label="Average Monthly Fee" value={avgMonthlyFee} onChange={setAvgMonthlyFee} min={100} max={5000} step={50} format={(v) => `$${v}/mo`} />
        <SliderInput label="Agent Hourly Cost" value={agentHourlyCost} onChange={setAgentHourlyCost} min={1} max={50} format={(v) => `$${v}/hr`} />
        <SliderInput label="Hours per Client" value={hoursPerClient} onChange={setHoursPerClient} min={1} max={40} format={(v) => `${v} hrs/mo`} />
        <SliderInput label="Overhead" value={overheadPercentage} onChange={setOverheadPercentage} min={0} max={50} step={5} format={(v) => `${v}%`} />
      </div>

      {/* Breakdown */}
      <div className="bg-[#12121a] border border-[#1e1e3a] rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-[#1e1e3a] text-xs text-[#7a7a8e] uppercase tracking-wide">Breakdown</div>
        <div className="divide-y divide-[#1e1e3a]">
          <BreakdownRow label="Monthly Revenue" value={formatCurrency(monthlyRevenue)} positive />
          <BreakdownRow label="Agent Costs" value={formatCurrency(agentCost)} />
          <BreakdownRow label={`Overhead (${overheadPercentage}%)`} value={formatCurrency(overhead)} />
          <BreakdownRow label="Net Profit" value={formatCurrency(monthlyProfit)} total positive={monthlyProfit >= 0} />
        </div>
      </div>
    </div>
  );
}

function SliderInput({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  format
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  format: (v: number) => string;
}) {
  return (
    <div className="p-4 bg-[#12121a] border border-[#1e1e3a] rounded-xl">
      <div className="flex justify-between mb-2">
        <span className="text-sm text-[#e0e0e8]">{label}</span>
        <span className="text-sm font-semibold text-indigo-400">{format(value)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-indigo-500"
      />
    </div>
  );
}

function BreakdownRow({
  label,
  value,
  total = false,
  positive = false
}: {
  label: string;
  value: string;
  total?: boolean;
  positive?: boolean;
}) {
  return (
    <div className={`flex justify-between px-4 py-3 ${total ? 'bg-[#1a1a2e]' : ''}`}>
      <span className={`text-sm ${total ? 'font-semibold text-[#e0e0e8]' : 'text-[#7a7a8e]'}`}>{label}</span>
      <span className={`text-sm ${total ? 'font-bold' : ''} ${positive ? 'text-emerald-400' : total ? 'text-red-400' : 'text-[#e0e0e8]'}`}>
        {!total && (positive ? '+' : '-')} {value}
      </span>
    </div>
  );
}

// ============= TOKEN COUNTER =============

const models = [
  { id: 'haiku', name: 'Haiku', inputPrice: 0.25, outputPrice: 1.25, color: 'text-green-400', desc: 'Fast & efficient' },
  { id: 'sonnet', name: 'Sonnet', inputPrice: 3.00, outputPrice: 15.00, color: 'text-blue-400', desc: 'Balanced' },
  { id: 'opus', name: 'Opus', inputPrice: 15.00, outputPrice: 75.00, color: 'text-purple-400', desc: 'Most capable' },
];

function TokenCounter() {
  const [inputText, setInputText] = useState('');
  const [selectedModel, setSelectedModel] = useState('sonnet');

  const estimatedTokens = Math.max(1, Math.ceil(inputText.length / 4));
  const estimatedOutputTokens = estimatedTokens * 2;

  const model = models.find(m => m.id === selectedModel)!;
  const inputCost = (estimatedTokens / 1_000_000) * model.inputPrice;
  const outputCost = (estimatedOutputTokens / 1_000_000) * model.outputPrice;
  // totalCost is used implicitly in the cost comparison section
  void (inputCost + outputCost); // satisfy unused variable check

  const formatCost = (cost: number) => {
    if (cost < 0.01) return `$${cost.toFixed(4)}`;
    if (cost < 1) return `$${cost.toFixed(3)}`;
    return `$${cost.toFixed(2)}`;
  };

  return (
    <div className="max-w-2xl">
      <h3 className="text-xl font-bold text-[#e0e0e8] mb-6">Token Counter</h3>

      {/* Input */}
      <div className="mb-4">
        <label className="block text-xs text-[#7a7a8e] uppercase tracking-wide mb-2">Enter Your Prompt</label>
        <textarea
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          className="w-full h-32 bg-[#12121a] border border-[#1e1e3a] rounded-xl px-4 py-3 text-sm text-[#e0e0e8] focus:outline-none focus:border-indigo-500/50 resize-none"
          placeholder="Paste your prompt here..."
        />
        <div className="flex justify-between mt-2 text-xs text-[#7a7a8e]">
          <span>{inputText.length} characters</span>
          {inputText && (
            <button onClick={() => setInputText('')} className="text-indigo-400 hover:text-indigo-300">Clear</button>
          )}
        </div>
      </div>

      {/* Model Selector */}
      <div className="mb-4">
        <label className="block text-xs text-[#7a7a8e] uppercase tracking-wide mb-2">Select Model</label>
        <div className="flex gap-2">
          {models.map((m) => (
            <button
              key={m.id}
              onClick={() => setSelectedModel(m.id)}
              className={`flex-1 p-3 rounded-xl border text-center transition-all ${
                selectedModel === m.id
                  ? 'bg-indigo-600 border-indigo-500 text-white'
                  : 'bg-[#12121a] border-[#1e1e3a] text-[#7a7a8e] hover:border-[#2e2e4a]'
              }`}
            >
              <div className="text-sm font-medium">{m.name}</div>
              <div className="text-xs opacity-75">{m.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Token Display */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="p-4 bg-[#12121a] border border-[#1e1e3a] rounded-xl text-center">
          <div className="text-xs text-[#7a7a8e] uppercase mb-1">Input</div>
          <div className="text-2xl font-bold text-indigo-400">{estimatedTokens.toLocaleString()}</div>
          <div className="text-xs text-[#7a7a8e]">tokens</div>
          <div className="text-sm text-[#e0e0e8] mt-2">{formatCost(inputCost)}</div>
        </div>
        <div className="p-4 bg-[#12121a] border border-[#1e1e3a] rounded-xl text-center">
          <div className="text-xs text-[#7a7a8e] uppercase mb-1">Output (est.)</div>
          <div className="text-2xl font-bold text-emerald-400">{estimatedOutputTokens.toLocaleString()}</div>
          <div className="text-xs text-[#7a7a8e]">tokens</div>
          <div className="text-sm text-[#e0e0e8] mt-2">{formatCost(outputCost)}</div>
        </div>
      </div>

      {/* Cost Comparison */}
      <div className="bg-[#12121a] border border-[#1e1e3a] rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-[#1e1e3a] text-xs text-[#7a7a8e] uppercase tracking-wide">Cost Comparison</div>
        <div className="divide-y divide-[#1e1e3a]">
          {models.map((m) => {
            const mInputCost = (estimatedTokens / 1_000_000) * m.inputPrice;
            const mOutputCost = (estimatedOutputTokens / 1_000_000) * m.outputPrice;
            const mTotal = mInputCost + mOutputCost;
            const isSelected = m.id === selectedModel;
            return (
              <div key={m.id} className={`flex items-center justify-between px-4 py-3 ${isSelected ? 'bg-indigo-500/10' : ''}`}>
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${m.color.replace('text-', 'bg-')}`} />
                  <span className={`text-sm ${isSelected ? 'text-[#e0e0e8]' : 'text-[#7a7a8e]'}`}>{m.name}</span>
                </div>
                <span className={`text-sm font-medium ${isSelected ? m.color : 'text-[#7a7a8e]'}`}>{formatCost(mTotal)}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Tips */}
      <div className="mt-4 p-4 bg-[#12121a] border border-[#1e1e3a] rounded-xl">
        <div className="text-xs text-[#7a7a8e] uppercase tracking-wide mb-2">💡 Tips</div>
        <ul className="text-xs text-[#7a7a8e] space-y-1">
          <li>• 1 token ≈ 4 characters or ¾ of a word</li>
          <li>• System prompts count as input tokens</li>
          <li>• Use Haiku for simple tasks to save costs</li>
          <li>• Opus is best for complex reasoning tasks</li>
        </ul>
      </div>
    </div>
  );
}

// ============= PROMPT ANALYZER =============

interface PromptComponent {
  name: string;
  present: boolean;
  points: number;
}

function PromptAnalyzer() {
  const [promptText, setPromptText] = useState('');
  const [analysis, setAnalysis] = useState<{ score: number; components: PromptComponent[]; suggestions: string[] } | null>(null);

  const analyzePrompt = () => {
    const text = promptText.toLowerCase();
    const components: PromptComponent[] = [];
    let score = 20;

    // Role/Persona
    const hasRole = text.includes('you are') || text.includes('act as') || text.includes('as a');
    components.push({ name: 'Role/Persona', present: hasRole, points: 15 });
    if (hasRole) score += 15;

    // Clear Task
    const hasTask = text.includes('write') || text.includes('create') || text.includes('generate') || text.includes('explain');
    components.push({ name: 'Clear Task', present: hasTask, points: 15 });
    if (hasTask) score += 15;

    // Context/Requirements
    const hasContext = text.includes('requirement') || text.includes('context') || promptText.includes('-');
    components.push({ name: 'Context/Requirements', present: hasContext, points: 15 });
    if (hasContext) score += 15;

    // Format Specification
    const hasFormat = text.includes('format') || text.includes('structure') || text.includes('section');
    components.push({ name: 'Format Specification', present: hasFormat, points: 15 });
    if (hasFormat) score += 15;

    // Target Audience
    const hasAudience = text.includes('audience') || text.includes('reader') || text.includes('developer');
    components.push({ name: 'Target Audience', present: hasAudience, points: 10 });
    if (hasAudience) score += 10;

    // Examples
    const hasExamples = text.includes('example') || text.includes('such as');
    components.push({ name: 'Examples', present: hasExamples, points: 10 });
    if (hasExamples) score += 10;

    const suggestions: string[] = [];
    if (!hasRole) suggestions.push("Add a role or persona (e.g., 'You are a technical writer')");
    if (!hasTask) suggestions.push("Specify a clear task or action");
    if (!hasContext) suggestions.push("Add context or specific requirements");
    if (!hasFormat) suggestions.push("Specify the desired output format");
    if (!hasAudience) suggestions.push("Define your target audience");
    if (!hasExamples) suggestions.push("Consider adding examples for clarity");

    setAnalysis({ score: Math.min(100, score), components, suggestions });
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-emerald-400';
    if (score >= 60) return 'text-amber-400';
    return 'text-red-400';
  };

  const getScoreLabel = (score: number) => {
    if (score >= 80) return 'Excellent';
    if (score >= 60) return 'Good';
    if (score >= 40) return 'Fair';
    return 'Needs Improvement';
  };

  const examplePrompts = [
    { title: 'Basic', text: 'Write a blog post about AI', quality: 'Poor' },
    { title: 'Structured', text: 'You are a tech writer. Write a 500-word blog post about AI agents for a developer audience. Include code examples.', quality: 'Good' },
    { title: 'Expert', text: 'You are an experienced technical writer specializing in AI/ML content.\n\nTask: Write a 500-word blog post about AI agents.\n\nRequirements:\n- Target audience: Software developers\n- Include 2 code examples in Python\n- Focus on practical use cases\n\nFormat: Start with a hook, include 3 main sections, end with a call-to-action.', quality: 'Excellent' },
  ];

  return (
    <div className="max-w-2xl">
      <h3 className="text-xl font-bold text-[#e0e0e8] mb-6">Prompt Analyzer</h3>

      {/* Input */}
      <div className="mb-4">
        <label className="block text-xs text-[#7a7a8e] uppercase tracking-wide mb-2">Enter Your Prompt</label>
        <textarea
          value={promptText}
          onChange={(e) => { setPromptText(e.target.value); setAnalysis(null); }}
          className="w-full h-40 bg-[#12121a] border border-[#1e1e3a] rounded-xl px-4 py-3 text-sm text-[#e0e0e8] focus:outline-none focus:border-indigo-500/50 resize-none"
          placeholder="Paste your prompt here..."
        />
      </div>

      {/* Analyze Button */}
      <button
        onClick={analyzePrompt}
        disabled={!promptText}
        className="w-full mb-6 px-4 py-3 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Analyze Prompt
      </button>

      {/* Results */}
      {analysis && (
        <div className="space-y-4 animate-fadeIn">
          {/* Score */}
          <div className="p-6 bg-[#12121a] border border-[#1e1e3a] rounded-xl text-center">
            <div className="text-xs text-[#7a7a8e] uppercase tracking-wide mb-2">Prompt Score</div>
            <div className={`text-5xl font-bold ${getScoreColor(analysis.score)}`}>{analysis.score}</div>
            <div className="text-sm text-[#7a7a8e] mt-1">/ 100</div>
            <div className={`text-sm font-medium mt-2 ${getScoreColor(analysis.score)}`}>{getScoreLabel(analysis.score)}</div>
          </div>

          {/* Components */}
          <div className="bg-[#12121a] border border-[#1e1e3a] rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-[#1e1e3a] text-xs text-[#7a7a8e] uppercase tracking-wide">Components Detected</div>
            <div className="divide-y divide-[#1e1e3a]">
              {analysis.components.map((comp, i) => (
                <div key={i} className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className={`w-4 h-4 rounded-full flex items-center justify-center ${comp.present ? 'bg-emerald-500/20 text-emerald-400' : 'bg-[#1e1e3a] text-[#4a4a5e]'}`}>
                      {comp.present ? '✓' : '○'}
                    </div>
                    <span className={`text-sm ${comp.present ? 'text-[#e0e0e8]' : 'text-[#7a7a8e]'}`}>{comp.name}</span>
                  </div>
                  {comp.present && <span className="text-xs text-emerald-400">+{comp.points}</span>}
                </div>
              ))}
            </div>
          </div>

          {/* Suggestions */}
          {analysis.suggestions.length > 0 && (
            <div className="bg-[#12121a] border border-[#1e1e3a] rounded-xl p-4">
              <div className="text-xs text-[#7a7a8e] uppercase tracking-wide mb-3">Suggestions</div>
              <ul className="space-y-2">
                {analysis.suggestions.map((suggestion, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-amber-400">
                    <span>💡</span>
                    <span>{suggestion}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Example Prompts */}
      {!analysis && !promptText && (
        <div>
          <div className="text-xs text-[#7a7a8e] uppercase tracking-wide mb-3">Try an Example</div>
          <div className="space-y-2">
            {examplePrompts.map((ex, i) => (
              <button
                key={i}
                onClick={() => setPromptText(ex.text)}
                className="w-full p-4 bg-[#12121a] border border-[#1e1e3a] rounded-xl text-left hover:border-indigo-500/50 transition-all"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-[#e0e0e8]">{ex.title} Prompt</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    ex.quality === 'Poor' ? 'bg-red-500/20 text-red-400' :
                    ex.quality === 'Good' ? 'bg-amber-500/20 text-amber-400' :
                    'bg-emerald-500/20 text-emerald-400'
                  }`}>{ex.quality}</span>
                </div>
                <p className="text-xs text-[#7a7a8e] line-clamp-2">{ex.text}</p>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
