/// <reference types="../../../../preload/sidebar.d.ts" />

import React, { useState, useEffect } from 'react';
import {
  Circle,
  Square,
  Play,
  Pause,
  Save,
  Download,
  Upload,
  Trash2,
  Video,
  AlertCircle,
  Clock,
  Hash,
  Calendar,
} from 'lucide-react';
import { HabitsPanel } from './HabitsPanel';
import { HabitCreationModal, HabitFormData } from './HabitCreationModal';

interface TabInfo {
  id: string;
  title: string;
  url: string;
  isActive: boolean;
}

interface PuppeteerRecording {
  title: string;
  steps: any[];
  timeout?: number;
}

interface RecordingSession {
  id: string;
  tabId: string;
  startTime: number;
  isRecording: boolean;
  isPaused: boolean;
  recording: PuppeteerRecording;
}

export const RecorderPanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'recorder' | 'habits'>('recorder');
  const [tabs, setTabs] = useState<TabInfo[]>([]);
  const [selectedTabId, setSelectedTabId] = useState<string | null>(null);
  const [currentSession, setCurrentSession] = useState<RecordingSession | null>(null);
  const [recording, setRecording] = useState<PuppeteerRecording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [recipeName, setRecipeName] = useState('');
  const [recipeDescription, setRecipeDescription] = useState('');
  const [showHabitModal, setShowHabitModal] = useState(false);

  // Load tabs on mount
  useEffect(() => {
    loadTabs();
  }, []);

  // Update elapsed time
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;

    if (isRecording && !isPaused && currentSession) {
      interval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - currentSession.startTime) / 1000);
        setElapsedTime(elapsed);
      }, 1000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isRecording, isPaused, currentSession]);

  const loadTabs = async () => {
    try {
      const tabsList = await window.sidebarAPI.getTabs();
      setTabs(tabsList);

      // Auto-select active tab
      const activeTab = tabsList.find((t) => t.isActive);
      if (activeTab) {
        setSelectedTabId(activeTab.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tabs');
    }
  };

  const handleStartRecording = async () => {
    if (!selectedTabId) {
      setError('Please select a tab to record');
      return;
    }

    setError(null);

    try {
      const response = await window.sidebarAPI.chromeRecordingStart(selectedTabId);

      if (!response.success || !response.sessionId) {
        throw new Error(response.error || 'Failed to start recording');
      }

      // Fetch session info
      const sessions = await window.sidebarAPI.chromeRecordingListSessions();
      const session = sessions.sessions?.find((s) => s.id === response.sessionId);

      if (session) {
        setCurrentSession(session);
        setIsRecording(true);
        setIsPaused(false);
        setElapsedTime(0);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start recording');
    }
  };

  const handleStopRecording = async () => {
    if (!currentSession) return;

    try {
      console.log('Stopping recording session:', currentSession.id);
      const response = await window.sidebarAPI.chromeRecordingStop(currentSession.id);

      console.log('Stop recording response:', response);

      if (!response.success || !response.recording) {
        throw new Error(response.error || 'Failed to stop recording');
      }

      console.log('Recording stopped successfully, steps:', response.recording.steps.length);
      setRecording(response.recording);
      setIsRecording(false);
      setIsPaused(false);
      setCurrentSession(null);
    } catch (err) {
      console.error('Error stopping recording:', err);
      setError(err instanceof Error ? err.message : 'Failed to stop recording');
    }
  };

  const handlePauseRecording = async () => {
    if (!currentSession) return;

    try {
      const response = await window.sidebarAPI.chromeRecordingPause(currentSession.id);

      if (!response.success) {
        throw new Error(response.error || 'Failed to pause recording');
      }

      setIsPaused(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to pause recording');
    }
  };

  const handleResumeRecording = async () => {
    if (!currentSession) return;

    try {
      const response = await window.sidebarAPI.chromeRecordingResume(currentSession.id);

      if (!response.success) {
        throw new Error(response.error || 'Failed to resume recording');
      }

      setIsPaused(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resume recording');
    }
  };

  const handleSaveAsRecipe = () => {
    console.log('handleSaveAsRecipe called, opening dialog');
    setShowSaveDialog(true);
  };

  const handleConfirmSave = async () => {
    console.log('handleConfirmSave called, recording:', recording);

    if (!recording) {
      console.error('No recording available');
      setError('No recording available');
      return;
    }

    if (!recipeName.trim()) {
      setError('Please enter a recipe name');
      return;
    }

    console.log('Recording has', recording.steps.length, 'steps');
    console.log('User entered name:', recipeName);
    console.log('User entered description:', recipeDescription);

    try {
      console.log('Calling chromeRecordingSaveAsRecipe...');
      const response = await window.sidebarAPI.chromeRecordingSaveAsRecipe(
        recording,
        recipeName,
        recipeDescription || undefined
      );

      console.log('Save recipe response:', response);

      if (!response.success) {
        throw new Error(response.error || 'Failed to save recipe');
      }

      console.log('Recipe saved successfully with ID:', response.recipeId);
      setShowSaveDialog(false);
      setRecipeName('');
      setRecipeDescription('');
      handleDiscard();
    } catch (err) {
      console.error('Error saving recipe:', err);
      setError(err instanceof Error ? err.message : 'Failed to save recipe');
    }
  };

  const handleCancelSave = () => {
    setShowSaveDialog(false);
    setRecipeName('');
    setRecipeDescription('');
  };

  const handleSaveAsHabit = () => {
    console.log('handleSaveAsHabit called, opening modal');
    setShowHabitModal(true);
  };

  const handleHabitSave = async (habitData: HabitFormData) => {
    if (!recording) {
      setError('No recording available');
      return;
    }

    try {
      console.log('Creating habit from recording:', habitData);

      // First save the recording as a recipe to get the recipe ID
      const recipeResponse = await window.sidebarAPI.chromeRecordingSaveAsRecipe(
        recording,
        `${habitData.alias}_recipe`,
        `Recipe for habit: ${habitData.title}`
      );

      if (!recipeResponse.success || !recipeResponse.recipeId) {
        throw new Error(recipeResponse.error || 'Failed to save recipe');
      }

      const recipeId = recipeResponse.recipeId;

      // Create habit action that references this recipe
      const habitActions = [
        {
          type: 'skill' as const,
          title: habitData.title,
          recipeId: recipeId,
        },
      ];

      // Create the habit
      const habitResponse = await window.sidebarAPI.habitCreate(
        habitData.alias,
        habitData.title,
        habitData.description,
        habitActions,
        habitData.schedule,
        habitData.policy
      );

      if (!habitResponse.success) {
        throw new Error(habitResponse.error || 'Failed to create habit');
      }

      console.log('Habit created successfully with ID:', habitResponse.habitId);

      // Close modal and switch to habits tab
      setShowHabitModal(false);
      handleDiscard();
      setActiveTab('habits');
    } catch (err) {
      console.error('Error creating habit:', err);
      setError(err instanceof Error ? err.message : 'Failed to create habit');
      throw err; // Re-throw so modal can handle it
    }
  };

  const handleDiscard = () => {
    setRecording(null);
    setIsRecording(false);
    setIsPaused(false);
    setCurrentSession(null);
    setElapsedTime(0);
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getStepTypeLabel = (type: string): string => {
    const labels: Record<string, string> = {
      setViewport: 'Set Viewport',
      navigate: 'Navigate',
      click: 'Click',
      change: 'Type',
      keyDown: 'Key Down',
      keyUp: 'Key Up',
      scroll: 'Scroll',
      hover: 'Hover',
      waitForElement: 'Wait',
    };
    return labels[type] || type;
  };

  return (
    <div className="flex flex-col h-full bg-background text-foreground">
      {/* Tab Switcher */}
      <div className="flex border-b border-border">
        <button
          onClick={() => setActiveTab('recorder')}
          className={`flex-1 px-4 py-3 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
            activeTab === 'recorder'
              ? 'bg-secondary border-b-2 border-blue-600 text-foreground'
              : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
          }`}
        >
          <Video className="w-4 h-4" />
          Recorder
        </button>
        <button
          onClick={() => setActiveTab('habits')}
          className={`flex-1 px-4 py-3 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
            activeTab === 'habits'
              ? 'bg-secondary border-b-2 border-blue-600 text-foreground'
              : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
          }`}
        >
          <Calendar className="w-4 h-4" />
          Habits
        </button>
      </div>

      {/* Conditionally render based on active tab */}
      {activeTab === 'habits' ? (
        <HabitsPanel />
      ) : (
        <>
          {/* Save Recipe Dialog */}
          {showSaveDialog && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background border border-border rounded-lg p-4 m-4 max-w-md w-full">
            <h3 className="text-lg font-semibold mb-4">Save Recording as Recipe</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">
                  Recipe Name *
                </label>
                <input
                  type="text"
                  value={recipeName}
                  onChange={(e) => setRecipeName(e.target.value)}
                  placeholder="My Recording"
                  className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">
                  Description (optional)
                </label>
                <textarea
                  value={recipeDescription}
                  onChange={(e) => setRecipeDescription(e.target.value)}
                  placeholder="What does this recipe do?"
                  rows={3}
                  className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {error && (
                <div className="p-2 bg-red-100 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded text-sm text-red-600 dark:text-red-400">
                  {error}
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={handleConfirmSave}
                  className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
                >
                  Save Recipe
                </button>
                <button
                  onClick={handleCancelSave}
                  className="flex-1 px-4 py-2 bg-secondary hover:bg-secondary/80 text-foreground rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Habit Creation Modal */}
      {showHabitModal && recording && (
        <HabitCreationModal
          recording={recording}
          onSave={handleHabitSave}
          onCancel={() => setShowHabitModal(false)}
        />
      )}

      {/* Header */}
      <div className="p-4 border-b border-border">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Video className="w-5 h-5" />
          Chrome Recorder
        </h2>
        <p className="text-xs text-muted-foreground mt-1">
          Record browser interactions and convert to recipes
        </p>
      </div>

      <div className="flex-1 overflow-y-auto">
        {!isRecording && !recording ? (
          /* Initial State - Select Tab and Start Recording */
          <div className="p-4 space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Select Tab to Record</label>
              <select
                value={selectedTabId || ''}
                onChange={(e) => setSelectedTabId(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Choose a tab...</option>
                {tabs.map((tab) => (
                  <option key={tab.id} value={tab.id}>
                    {tab.title} {tab.isActive ? '(Active)' : ''}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground mt-1">
                Choose the tab where you want to record interactions
              </p>
            </div>

            {error && (
              <div className="p-3 bg-red-100 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              </div>
            )}

            <button
              onClick={handleStartRecording}
              disabled={!selectedTabId}
              className="w-full px-4 py-3 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <Circle className="w-4 h-4 fill-current" />
              Start Recording
            </button>

            <div className="border-t border-border pt-4 mt-4">
              <h3 className="text-sm font-medium mb-2">How it works</h3>
              <ul className="text-xs text-muted-foreground space-y-1">
                <li>1. Select a tab to record</li>
                <li>2. Click "Start Recording" and perform actions in the tab</li>
                <li>3. Actions like clicks, typing, and navigation are recorded</li>
                <li>4. Stop recording and save as a recipe or export</li>
                <li>5. Recordings use multiple selector strategies for reliability</li>
              </ul>
            </div>
          </div>
        ) : isRecording ? (
          /* Recording State */
          <div className="p-4 space-y-4">
            <div className="p-4 bg-red-50 dark:bg-red-900/20 border-2 border-red-500 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Circle className="w-3 h-3 fill-red-600 text-red-600 animate-pulse" />
                  <span className="text-sm font-medium text-red-600 dark:text-red-400">
                    {isPaused ? 'Paused' : 'Recording in progress'}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="w-3 h-3" />
                  {formatTime(elapsedTime)}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                {isPaused
                  ? 'Recording is paused. Click Resume to continue.'
                  : 'Perform actions in the selected tab. They will be automatically captured.'}
              </p>
            </div>

            {currentSession && (
              <div className="p-3 bg-secondary rounded-lg">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Steps captured:</span>
                  <div className="flex items-center gap-1 font-medium">
                    <Hash className="w-3 h-3" />
                    {currentSession.recording.steps.length}
                  </div>
                </div>
              </div>
            )}

            {error && (
              <div className="p-3 bg-red-100 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              </div>
            )}

            <div className="flex gap-2">
              {!isPaused ? (
                <button
                  onClick={handlePauseRecording}
                  className="flex-1 px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  <Pause className="w-4 h-4" />
                  Pause
                </button>
              ) : (
                <button
                  onClick={handleResumeRecording}
                  className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  <Play className="w-4 h-4" />
                  Resume
                </button>
              )}

              <button
                onClick={handleStopRecording}
                className="flex-1 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <Square className="w-4 h-4" />
                Stop
              </button>
            </div>
          </div>
        ) : recording ? (
          /* Recording Complete - Preview and Save */
          <div className="p-4 space-y-4">
            <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
              <p className="text-sm text-green-600 dark:text-green-400 font-medium">
                Recording complete!
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Captured {recording.steps.length} steps
              </p>
            </div>

            {error && (
              <div className="p-3 bg-red-100 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              </div>
            )}

            <div className="border border-border rounded-lg overflow-hidden">
              <div className="p-3 bg-secondary border-b border-border">
                <h3 className="text-sm font-medium">Recorded Steps</h3>
              </div>
              <div className="max-h-64 overflow-y-auto">
                {recording.steps.length === 0 ? (
                  <div className="p-4 text-center text-sm text-muted-foreground">
                    No steps recorded
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {recording.steps.map((step, idx) => (
                      <div key={idx} className="p-3 hover:bg-secondary/50 transition-colors">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium">
                              {idx + 1}. {getStepTypeLabel(step.type)}
                            </p>
                            {step.url && (
                              <p className="text-xs text-muted-foreground truncate mt-1">
                                {step.url}
                              </p>
                            )}
                            {step.selectors && step.selectors.length > 0 && (
                              <p className="text-xs text-muted-foreground mt-1">
                                {step.selectors.length} selector(s)
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <button
                onClick={handleSaveAsHabit}
                className="w-full px-4 py-3 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <Calendar className="w-4 h-4" />
                Save as Habit
              </button>

              <button
                onClick={handleSaveAsRecipe}
                className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <Save className="w-4 h-4" />
                Save as Recipe
              </button>

              <button
                onClick={handleDiscard}
                className="w-full px-4 py-2 bg-secondary hover:bg-secondary/80 text-foreground rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                Discard & Start New
              </button>
            </div>
          </div>
        ) : null}
      </div>
        </>
      )}
    </div>
  );
};
