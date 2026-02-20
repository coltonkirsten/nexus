import { createContext, useContext, useReducer, type ReactNode, type Dispatch } from 'react';

export type TabType = 'agent' | 'team';

export interface Tab {
  id: string;
  type: TabType;
  entityId: string;
  label: string;
}

export interface OrchestratorState {
  tabs: Tab[];
  activeTabId: string | null;
  inspectorCollapsed: boolean;
  selectedEntityId: string | null;
  selectedEntityType: TabType | null;
}

type Action =
  | { type: 'OPEN_TAB'; payload: { tabType: TabType; entityId: string; label: string } }
  | { type: 'CLOSE_TAB'; payload: { tabId: string } }
  | { type: 'SET_ACTIVE_TAB'; payload: { tabId: string | null } }
  | { type: 'TOGGLE_INSPECTOR' }
  | { type: 'SELECT_ENTITY'; payload: { entityId: string; entityType: TabType } }
  | { type: 'UPDATE_TAB_LABEL'; payload: { tabId: string; label: string } }
  | { type: 'CLOSE_TAB_BY_ENTITY'; payload: { entityId: string } };

function makeTabId(tabType: TabType, entityId: string): string {
  return `${tabType}-${entityId}`;
}

function reducer(state: OrchestratorState, action: Action): OrchestratorState {
  switch (action.type) {
    case 'OPEN_TAB': {
      const { tabType, entityId, label } = action.payload;
      const tabId = makeTabId(tabType, entityId);
      const existing = state.tabs.find((t) => t.id === tabId);
      if (existing) {
        return {
          ...state,
          activeTabId: tabId,
          selectedEntityId: entityId,
          selectedEntityType: tabType,
        };
      }
      return {
        ...state,
        tabs: [...state.tabs, { id: tabId, type: tabType, entityId, label }],
        activeTabId: tabId,
        selectedEntityId: entityId,
        selectedEntityType: tabType,
      };
    }
    case 'CLOSE_TAB': {
      const { tabId } = action.payload;
      const idx = state.tabs.findIndex((t) => t.id === tabId);
      const newTabs = state.tabs.filter((t) => t.id !== tabId);
      let newActiveTabId = state.activeTabId;
      if (state.activeTabId === tabId) {
        if (newTabs.length === 0) {
          newActiveTabId = null;
        } else if (idx >= newTabs.length) {
          newActiveTabId = newTabs[newTabs.length - 1].id;
        } else {
          newActiveTabId = newTabs[idx].id;
        }
      }
      const activeTab = newTabs.find((t) => t.id === newActiveTabId);
      return {
        ...state,
        tabs: newTabs,
        activeTabId: newActiveTabId,
        selectedEntityId: activeTab?.entityId ?? null,
        selectedEntityType: activeTab?.type ?? null,
      };
    }
    case 'SET_ACTIVE_TAB': {
      const tab = state.tabs.find((t) => t.id === action.payload.tabId);
      return {
        ...state,
        activeTabId: action.payload.tabId,
        selectedEntityId: tab?.entityId ?? state.selectedEntityId,
        selectedEntityType: tab?.type ?? state.selectedEntityType,
      };
    }
    case 'TOGGLE_INSPECTOR':
      return { ...state, inspectorCollapsed: !state.inspectorCollapsed };
    case 'SELECT_ENTITY':
      return {
        ...state,
        selectedEntityId: action.payload.entityId,
        selectedEntityType: action.payload.entityType,
      };
    case 'UPDATE_TAB_LABEL': {
      return {
        ...state,
        tabs: state.tabs.map((t) =>
          t.id === action.payload.tabId ? { ...t, label: action.payload.label } : t
        ),
      };
    }
    case 'CLOSE_TAB_BY_ENTITY': {
      const tab = state.tabs.find((t) => t.entityId === action.payload.entityId);
      if (!tab) return state;
      return reducer(state, { type: 'CLOSE_TAB', payload: { tabId: tab.id } });
    }
    default:
      return state;
  }
}

const initialState: OrchestratorState = {
  tabs: [],
  activeTabId: null,
  inspectorCollapsed: false,
  selectedEntityId: null,
  selectedEntityType: null,
};

const OrchestratorContext = createContext<OrchestratorState>(initialState);
const OrchestratorDispatchContext = createContext<Dispatch<Action>>(() => {});

export function OrchestratorProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  return (
    <OrchestratorContext.Provider value={state}>
      <OrchestratorDispatchContext.Provider value={dispatch}>
        {children}
      </OrchestratorDispatchContext.Provider>
    </OrchestratorContext.Provider>
  );
}

export function useOrchestrator() {
  return useContext(OrchestratorContext);
}

export function useOrchestratorDispatch() {
  return useContext(OrchestratorDispatchContext);
}
