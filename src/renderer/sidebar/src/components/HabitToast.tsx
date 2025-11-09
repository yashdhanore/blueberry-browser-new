/// <reference types="../../../../preload/sidebar.d.ts" />

import React, { useState, useEffect } from 'react';
import { Calendar, Play, X, Clock } from 'lucide-react';

interface Habit {
  id: string;
  alias: string;
  title: string;
  description?: string;
  schedule?: {
    mode: 'suggest' | 'autorun';
  };
}

interface HabitToastProps {
  habit: Habit | null;
  onRun: () => void;
  onSkip: () => void;
  onAlwaysRun: () => void;
  onClose: () => void;
}

export const HabitToast: React.FC<HabitToastProps> = ({
  habit,
  onRun,
  onSkip,
  onAlwaysRun,
  onClose,
}) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (habit) {
      setIsVisible(true);
    } else {
      setIsVisible(false);
    }
  }, [habit]);

  if (!habit || !isVisible) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 animate-slide-up">
      <div className="bg-background border-2 border-blue-600 rounded-lg shadow-2xl p-4 min-w-[320px] max-w-md">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <Calendar className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h3 className="font-semibold text-sm">Scheduled Habit</h3>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="w-3 h-3" />
                It's time to run this habit
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-secondary rounded transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Habit Info */}
        <div className="mb-4 p-3 bg-secondary/50 rounded-lg">
          <p className="font-medium text-sm mb-1">{habit.title}</p>
          <p className="text-xs text-muted-foreground font-mono">{habit.alias}</p>
          {habit.description && (
            <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
              {habit.description}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="space-y-2">
          <button
            onClick={onRun}
            className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            <Play className="w-4 h-4" />
            Run Now
          </button>

          <div className="flex gap-2">
            <button
              onClick={onSkip}
              className="flex-1 px-3 py-2 bg-secondary hover:bg-secondary/80 text-foreground text-sm rounded-lg transition-colors"
            >
              Skip Today
            </button>
            <button
              onClick={onAlwaysRun}
              className="flex-1 px-3 py-2 bg-secondary hover:bg-secondary/80 text-foreground text-sm rounded-lg transition-colors"
            >
              Always Run
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// Container component to manage toast state
export const HabitToastContainer: React.FC = () => {
  const [currentHabit, setCurrentHabit] = useState<Habit | null>(null);

  useEffect(() => {
    // Listen for habit suggestions
    window.sidebarAPI.onHabitSuggestion((data) => {
      console.log('Received habit suggestion:', data.habit);
      setCurrentHabit(data.habit);
    });

    return () => {
      window.sidebarAPI.removeHabitSuggestionListener();
    };
  }, []);

  const handleRun = async () => {
    if (!currentHabit) return;

    try {
      await window.sidebarAPI.habitExecute(currentHabit.id, false);
      setCurrentHabit(null);
    } catch (error) {
      console.error('Error running habit:', error);
    }
  };

  const handleSkip = () => {
    // Just close the toast - the habit already marked suggestion for today
    setCurrentHabit(null);
  };

  const handleAlwaysRun = async () => {
    if (!currentHabit) return;

    try {
      // Update habit to autorun mode
      await window.sidebarAPI.habitUpdate(currentHabit.id, {
        schedule: {
          ...currentHabit.schedule,
          mode: 'autorun',
        },
      });

      // Also run it now
      await window.sidebarAPI.habitExecute(currentHabit.id, false);
      setCurrentHabit(null);
    } catch (error) {
      console.error('Error updating habit to autorun:', error);
    }
  };

  const handleClose = () => {
    setCurrentHabit(null);
  };

  return (
    <HabitToast
      habit={currentHabit}
      onRun={handleRun}
      onSkip={handleSkip}
      onAlwaysRun={handleAlwaysRun}
      onClose={handleClose}
    />
  );
};
