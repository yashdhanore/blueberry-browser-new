/// <reference types="../../../../preload/sidebar.d.ts" />

import React, { useState, useEffect } from 'react';
import { 
  Play, 
  Pause, 
  Square, 
  Loader2, 
  CheckCircle2, 
  XCircle, 
  Brain,
  Zap,
  Clock,
  List,
  Save,
  Upload,
  AlertCircle
} from 'lucide-react';

interface AgentState {
  goal: {
    id: string;
    goal: string;
    tabId: string;
    createdAt: string;
  };
  status: "created" | "planning" | "executing" | "paused" | "completed" | "failed" | "stopped";
  currentContext: any;
  actionHistory: ExecutionResult[];
  currentAction: any;
  iteration: number;
  maxIterations: number;
  error?: string;
  startedAt?: string;
  completedAt?: string;
  result?: any;
}

interface ExecutionResult {
  success: boolean;
  action: any;
  error?: string;
  data?: any;
  duration: number;
  timestamp: string;
}

export const AgentPanel: React.FC = () => {
  const [goal, setGoal] = useState('');
  const [currentAgent, setCurrentAgent] = useState<AgentState | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showRecipes, setShowRecipes] = useState(false);

  useEffect(() => {
    window.sidebarAPI.onAgentStatusUpdate((data) => {
      if (currentAgent && data.agentId === currentAgent.goal.id) {
        setCurrentAgent(data.state);
      }
    });

    window.sidebarAPI.onAgentCompleted((data) => {
      if (currentAgent && data.agentId === currentAgent.goal.id) {
        console.log('Agent completed!', data.result);
      }
    });

    window.sidebarAPI.onAgentError((data) => {
      if (currentAgent && data.agentId === currentAgent.goal.id) {
        setError(data.error);
      }
    });

    return () => {
      window.sidebarAPI.removeAllAgentListeners();
    };
  }, [currentAgent]);

  const handleCreateAgent = async () => {
    if (!goal.trim()) {
      setError('Please enter a goal for the agent');
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      const createResponse = await window.sidebarAPI.createAgent(goal);
      
      if (!createResponse.success) {
        throw new Error(createResponse.error || 'Failed to create agent');
      }

      const agentId = createResponse.agentId!;

      const statusResponse = await window.sidebarAPI.getAgentStatus(agentId);
      
      if (statusResponse.success && statusResponse.state) {
        setCurrentAgent(statusResponse.state);
      }

      const startResponse = await window.sidebarAPI.startAgent(agentId);
      
      if (!startResponse.success) {
        throw new Error(startResponse.error || 'Failed to start agent');
      }

      setGoal('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create agent');
    } finally {
      setIsCreating(false);
    }
  };

  const handlePauseAgent = async () => {
    if (!currentAgent) return;

    try {
      const response = await window.sidebarAPI.pauseAgent(currentAgent.goal.id);
      if (!response.success) {
        throw new Error(response.error || 'Failed to pause agent');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to pause agent');
    }
  };

  const handleResumeAgent = async () => {
    if (!currentAgent) return;

    try {
      const response = await window.sidebarAPI.resumeAgent(currentAgent.goal.id);
      if (!response.success) {
        throw new Error(response.error || 'Failed to resume agent');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resume agent');
    }
  };

  const handleStopAgent = async () => {
    if (!currentAgent) return;

    try {
      const response = await window.sidebarAPI.stopAgent(currentAgent.goal.id);
      if (!response.success) {
        throw new Error(response.error || 'Failed to stop agent');
      }
      
      setTimeout(() => setCurrentAgent(null), 500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to stop agent');
    }
  };

  const handleSaveRecipe = async () => {
    if (!currentAgent) return;

    const name = prompt('Enter a name for this recipe:');
    if (!name) return;

    try {
      const response = await window.sidebarAPI.saveAgentRecipe(
        currentAgent.goal.id,
        name,
        currentAgent.goal.goal
      );
      
      if (!response.success) {
        throw new Error(response.error || 'Failed to save recipe');
      }

      alert(`Recipe "${name}" saved successfully!`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save recipe');
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'planning':
        return <Brain className="w-4 h-4 animate-pulse text-blue-500" />;
      case 'executing':
        return <Zap className="w-4 h-4 animate-pulse text-yellow-500" />;
      case 'paused':
        return <Pause className="w-4 h-4 text-gray-500" />;
      case 'completed':
        return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-500" />;
      case 'stopped':
        return <Square className="w-4 h-4 text-gray-500" />;
      default:
        return <Clock className="w-4 h-4 text-gray-400" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'planning':
        return 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300';
      case 'executing':
        return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300';
      case 'paused':
        return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
      case 'completed':
        return 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300';
      case 'failed':
        return 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300';
      case 'stopped':
        return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
      default:
        return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
    }
  };

  const formatActionType = (type: string) => {
    return type
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const getSuccessRate = () => {
    if (!currentAgent || currentAgent.actionHistory.length === 0) return 0;
    const successful = currentAgent.actionHistory.filter(r => r.success).length;
    return Math.round((successful / currentAgent.actionHistory.length) * 100);
  };

  return (
    <div className="flex flex-col h-full bg-background text-foreground">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Brain className="w-5 h-5" />
          Autonomous Agent
        </h2>
        <p className="text-xs text-muted-foreground mt-1">
          Create agents to automate web tasks
        </p>
      </div>

      <div className="flex-1 overflow-y-auto">
        {!currentAgent ? (
          <div className="p-4 space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                What should the agent do?
              </label>
              <textarea
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder="Example: Extract all product names and prices from this page"
                className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={4}
                disabled={isCreating}
              />
            </div>

            <div>
              <p className="text-xs text-muted-foreground mb-2">Quick templates:</p>
              <div className="space-y-2">
                <button
                  onClick={() => setGoal('Extract all product names and prices from this page')}
                  className="w-full text-left px-3 py-2 text-sm bg-secondary hover:bg-secondary/80 rounded-lg transition-colors"
                  disabled={isCreating}
                >
                  Extract product data
                </button>
                <button
                  onClick={() => setGoal('Fill out the form on this page with test data')}
                  className="w-full text-left px-3 py-2 text-sm bg-secondary hover:bg-secondary/80 rounded-lg transition-colors"
                  disabled={isCreating}
                >
                  Fill form with test data
                </button>
                <button
                  onClick={() => setGoal('Scroll through the page and take screenshots of all sections')}
                  className="w-full text-left px-3 py-2 text-sm bg-secondary hover:bg-secondary/80 rounded-lg transition-colors"
                  disabled={isCreating}
                >
                  Capture all page sections
                </button>
              </div>
            </div>

            {error && (
              <div className="p-3 bg-red-100 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              </div>
            )}

            <button
              onClick={handleCreateAgent}
              disabled={isCreating || !goal.trim()}
              className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              {isCreating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Creating Agent...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  Create & Start Agent
                </>
              )}
            </button>

            <button
              onClick={() => setShowRecipes(!showRecipes)}
              className="w-full px-4 py-2 bg-secondary hover:bg-secondary/80 text-foreground rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <Upload className="w-4 h-4" />
              Load Recipe
            </button>
          </div>
        ) : (
          <div className="p-4 space-y-4">
            <div className="p-3 bg-secondary rounded-lg">
              <p className="text-xs text-muted-foreground mb-1">Goal:</p>
              <p className="text-sm font-medium">{currentAgent.goal.goal}</p>
            </div>

            <div className="flex items-center justify-between">
              <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${getStatusColor(currentAgent.status)}`}>
                {getStatusIcon(currentAgent.status)}
                <span className="capitalize">{currentAgent.status}</span>
              </div>
              <span className="text-xs text-muted-foreground">
                Iteration {currentAgent.iteration}/{currentAgent.maxIterations}
              </span>
            </div>

            {currentAgent.currentAction && (
              <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                <p className="text-xs text-muted-foreground mb-1">Current Action:</p>
                <p className="text-sm font-medium flex items-center gap-2">
                  <Zap className="w-3 h-3 animate-pulse" />
                  {formatActionType(currentAgent.currentAction.type)}
                </p>
                {currentAgent.currentAction.reasoning && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {currentAgent.currentAction.reasoning}
                  </p>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <div className="p-3 bg-secondary rounded-lg">
                <p className="text-xs text-muted-foreground">Actions</p>
                <p className="text-xl font-bold">{currentAgent.actionHistory.length}</p>
              </div>
              <div className="p-3 bg-secondary rounded-lg">
                <p className="text-xs text-muted-foreground">Success Rate</p>
                <p className="text-xl font-bold">{getSuccessRate()}%</p>
              </div>
            </div>

            {(error || currentAgent.error) && (
              <div className="p-3 bg-red-100 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg">
                <p className="text-sm text-red-600 dark:text-red-400 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>{error || currentAgent.error}</span>
                </p>
              </div>
            )}

            <div className="flex gap-2">
              {currentAgent.status === 'planning' || currentAgent.status === 'executing' ? (
                <button
                  onClick={handlePauseAgent}
                  className="flex-1 px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  <Pause className="w-4 h-4" />
                  Pause
                </button>
              ) : currentAgent.status === 'paused' ? (
                <button
                  onClick={handleResumeAgent}
                  className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  <Play className="w-4 h-4" />
                  Resume
                </button>
              ) : null}

              {(currentAgent.status === 'planning' || 
                currentAgent.status === 'executing' || 
                currentAgent.status === 'paused') && (
                <button
                  onClick={handleStopAgent}
                  className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  <Square className="w-4 h-4" />
                  Stop
                </button>
              )}

              {(currentAgent.status === 'completed' || 
                currentAgent.status === 'stopped') && (
                <button
                  onClick={() => setCurrentAgent(null)}
                  className="flex-1 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white font-medium rounded-lg transition-colors"
                >
                  New Agent
                </button>
              )}
            </div>

            {currentAgent.status === 'completed' && currentAgent.actionHistory.length > 0 && (
              <button
                onClick={handleSaveRecipe}
                className="w-full px-4 py-2 bg-secondary hover:bg-secondary/80 text-foreground rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <Save className="w-4 h-4" />
                Save as Recipe
              </button>
            )}

            <div className="border border-border rounded-lg overflow-hidden">
              <div className="p-3 bg-secondary border-b border-border flex items-center justify-between">
                <h3 className="text-sm font-medium flex items-center gap-2">
                  <List className="w-4 h-4" />
                  Action History
                </h3>
                <span className="text-xs text-muted-foreground">
                  {currentAgent.actionHistory.length} actions
                </span>
              </div>
              <div className="max-h-64 overflow-y-auto">
                {currentAgent.actionHistory.length === 0 ? (
                  <div className="p-4 text-center text-sm text-muted-foreground">
                    No actions yet
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {currentAgent.actionHistory.slice().reverse().map((result, idx) => (
                      <div
                        key={idx}
                        className={`p-3 hover:bg-secondary/50 transition-colors ${
                          result.success ? '' : 'bg-red-50 dark:bg-red-900/10'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">
                              {result.success ? '✓' : '✗'} {formatActionType(result.action.type)}
                            </p>
                            {result.action.reasoning && (
                              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                {result.action.reasoning}
                              </p>
                            )}
                            {!result.success && result.error && (
                              <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                                {result.error}
                              </p>
                            )}
                          </div>
                          <span className="text-xs text-muted-foreground whitespace-nowrap">
                            {result.duration}ms
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {currentAgent.status === 'completed' && currentAgent.result && (
              <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                <p className="text-xs text-muted-foreground mb-2">Result:</p>
                <pre className="text-xs bg-background p-2 rounded overflow-x-auto">
                  {JSON.stringify(currentAgent.result, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};