/// <reference types="../../../../preload/sidebar.d.ts" />

import React, { useState, useEffect } from 'react';
import {
  Calendar,
  Clock,
  Play,
  Edit,
  Trash2,
  Plus,
  CheckCircle,
  XCircle,
  AlertCircle,
  Copy,
  Settings,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface Habit {
  id: string;
  alias: string;
  title: string;
  description?: string;
  actions: HabitAction[];
  schedule?: HabitSchedule;
  policy: HabitPolicy;
  createdAt: string;
  updatedAt: string;
  lastRunAt?: string;
  lastRunResult?: 'success' | 'failed' | 'skipped';
}

interface HabitAction {
  type: 'skill' | 'plan';
  title: string;
  recipeId?: string;
  parameters?: Record<string, any>;
  actions?: any[];
}

interface HabitSchedule {
  timezone: string;
  daysOfWeek: number[];
  hour: number;
  minute: number;
  windowMinutes: number;
  mode: 'suggest' | 'autorun';
}

interface HabitPolicy {
  requireApproval: boolean;
  dryRun: boolean;
  openTabsMax: number;
}

interface Recipe {
  id: string;
  name: string;
  description: string;
  actions: any[];
}

export const HabitsPanel: React.FC = () => {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [selectedHabit, setSelectedHabit] = useState<Habit | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [expandedHabitId, setExpandedHabitId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadHabits();
    loadRecipes();

    // Listen for habit suggestions
    window.sidebarAPI.onHabitSuggestion((data) => {
      // This will be handled by toast notifications
      console.log('Habit suggestion:', data.habit);
    });

    return () => {
      window.sidebarAPI.removeHabitSuggestionListener();
    };
  }, []);

  const loadHabits = async () => {
    try {
      const response = await window.sidebarAPI.habitList();
      if (response.success && response.habits) {
        setHabits(response.habits);
      }
    } catch (err) {
      console.error('Error loading habits:', err);
    }
  };

  const loadRecipes = async () => {
    try {
      const response = await window.sidebarAPI.listAgentRecipes();
      if (response.success && response.recipes) {
        setRecipes(response.recipes);
      }
    } catch (err) {
      console.error('Error loading recipes:', err);
    }
  };

  const handleDeleteHabit = async (habitId: string) => {
    if (!confirm('Are you sure you want to delete this habit?')) return;

    try {
      const response = await window.sidebarAPI.habitDelete(habitId);
      if (response.success) {
        setHabits(habits.filter((h) => h.id !== habitId));
      } else {
        setError(response.error || 'Failed to delete habit');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete habit');
    }
  };

  const handleDuplicateHabit = (habit: Habit) => {
    // TODO: Implement duplicate functionality
    console.log('Duplicate habit:', habit);
  };

  const getDayNames = (days: number[]): string => {
    const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    if (days.length === 7) return 'Every day';
    if (days.length === 5 && !days.includes(0) && !days.includes(6)) return 'Weekdays';
    if (days.length === 2 && days.includes(0) && days.includes(6)) return 'Weekends';
    return days.map((d) => names[d]).join(', ');
  };

  const formatTime = (hour: number, minute: number): string => {
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  };

  const getStatusBadge = (result?: 'success' | 'failed' | 'skipped') => {
    if (!result) return null;
    const config = {
      success: { icon: CheckCircle, color: 'text-green-600 dark:text-green-400', bg: 'bg-green-100 dark:bg-green-900/30' },
      failed: { icon: XCircle, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-100 dark:bg-red-900/30' },
      skipped: { icon: AlertCircle, color: 'text-yellow-600 dark:text-yellow-400', bg: 'bg-yellow-100 dark:bg-yellow-900/30' },
    };
    const { icon: Icon, color, bg } = config[result];
    return (
      <div className={`inline-flex items-center gap-1 px-2 py-1 rounded ${bg}`}>
        <Icon className={`w-3 h-3 ${color}`} />
        <span className={`text-xs ${color} capitalize`}>{result}</span>
      </div>
    );
  };

  const toggleExpand = (habitId: string) => {
    setExpandedHabitId(expandedHabitId === habitId ? null : habitId);
  };

  return (
    <div className="flex flex-col h-full bg-background text-foreground">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            Habits
          </h2>
          <button
            onClick={() => setShowCreateModal(true)}
            className="p-2 hover:bg-secondary rounded-lg transition-colors"
            title="Create new habit"
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          Automated routines that run on demand or on schedule
        </p>
      </div>

      {/* Habits List */}
      <div className="flex-1 overflow-y-auto">
        {error && (
          <div className="m-4 p-3 bg-red-100 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}

        {habits.length === 0 ? (
          <div className="p-8 text-center">
            <Calendar className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <p className="text-sm text-muted-foreground mb-2">No habits yet</p>
            <p className="text-xs text-muted-foreground mb-4">
              Create habits to automate your browser workflows
            </p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm transition-colors inline-flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Create First Habit
            </button>
          </div>
        ) : (
          <div className="p-4 space-y-3">
            {habits.map((habit) => (
              <div
                key={habit.id}
                className="border border-border rounded-lg overflow-hidden hover:shadow-md transition-shadow"
              >
                {/* Habit Header */}
                <div className="p-4 bg-secondary/50">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-sm truncate">{habit.title}</h3>
                        <span className="text-xs text-muted-foreground font-mono">{habit.alias}</span>
                      </div>
                      {habit.description && (
                        <p className="text-xs text-muted-foreground line-clamp-2">{habit.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => toggleExpand(habit.id)}
                        className="p-1.5 hover:bg-background rounded transition-colors"
                        title="Toggle details"
                      >
                        {expandedHabitId === habit.id ? (
                          <ChevronUp className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Metadata */}
                  <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                    {habit.schedule && (
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {getDayNames(habit.schedule.daysOfWeek)} at{' '}
                        {formatTime(habit.schedule.hour, habit.schedule.minute)}
                      </div>
                    )}
                    <div className="flex items-center gap-1">
                      {habit.actions.length} action{habit.actions.length !== 1 ? 's' : ''}
                    </div>
                    {habit.lastRunResult && getStatusBadge(habit.lastRunResult)}
                  </div>

                  {/* Policy Badges */}
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    {habit.policy.requireApproval && (
                      <span className="text-xs px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded">
                        Approval
                      </span>
                    )}
                    {habit.policy.dryRun && (
                      <span className="text-xs px-2 py-0.5 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400 rounded">
                        Dry-run
                      </span>
                    )}
                    <span className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded">
                      Tabs ≤ {habit.policy.openTabsMax}
                    </span>
                    {habit.schedule && (
                      <span className="text-xs px-2 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded capitalize">
                        {habit.schedule.mode}
                      </span>
                    )}
                  </div>
                </div>

                {/* Expanded Details */}
                {expandedHabitId === habit.id && (
                  <div className="p-4 border-t border-border bg-background">
                    <div className="space-y-3">
                      <div>
                        <h4 className="text-xs font-medium mb-2">Actions:</h4>
                        <div className="space-y-1">
                          {habit.actions.map((action, idx) => (
                            <div
                              key={idx}
                              className="text-xs px-2 py-1.5 bg-secondary rounded flex items-center justify-between"
                            >
                              <span>
                                {idx + 1}. {action.title}
                              </span>
                              <span className="text-muted-foreground capitalize">{action.type}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {habit.schedule && (
                        <div>
                          <h4 className="text-xs font-medium mb-1">Schedule:</h4>
                          <p className="text-xs text-muted-foreground">
                            {getDayNames(habit.schedule.daysOfWeek)} at{' '}
                            {formatTime(habit.schedule.hour, habit.schedule.minute)} (±{habit.schedule.windowMinutes}min)
                            <br />
                            Timezone: {habit.schedule.timezone}
                          </p>
                        </div>
                      )}

                      <div className="flex gap-2 pt-2">
                        <button
                          onClick={async () => {
                            try {
                              await window.sidebarAPI.habitExecute(habit.id, false);
                            } catch (err) {
                              setError(err instanceof Error ? err.message : 'Failed to run habit');
                            }
                          }}
                          className="flex-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm transition-colors flex items-center justify-center gap-2"
                        >
                          <Play className="w-3 h-3" />
                          Run Now
                        </button>
                        <button
                          onClick={() => handleDuplicateHabit(habit)}
                          className="px-3 py-2 bg-secondary hover:bg-secondary/80 rounded-lg text-sm transition-colors"
                          title="Duplicate"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            // TODO: Open edit modal
                            console.log('Edit habit:', habit);
                          }}
                          className="px-3 py-2 bg-secondary hover:bg-secondary/80 rounded-lg text-sm transition-colors"
                          title="Edit"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteHabit(habit.id)}
                          className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Modal - Placeholder */}
      {showCreateModal && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background border border-border rounded-lg p-4 m-4 max-w-2xl w-full max-h-[80vh] overflow-y-auto">
            <h3 className="text-lg font-semibold mb-4">Create New Habit</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Creating habits from the UI will be available soon. For now, you can run habits using the @alias in the Agent panel.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowCreateModal(false)}
                className="flex-1 px-4 py-2 bg-secondary hover:bg-secondary/80 text-foreground rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
