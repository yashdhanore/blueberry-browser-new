/// <reference types="../../../../preload/sidebar.d.ts" />

import React, { useState } from 'react';
import { X, Calendar, Clock, Shield, Settings, AlertCircle } from 'lucide-react';

interface HabitCreationModalProps {
  recording: {
    title: string;
    steps: any[];
  };
  onSave: (habitData: HabitFormData) => Promise<void>;
  onCancel: () => void;
}

export interface HabitFormData {
  alias: string;
  title: string;
  description: string;
  schedule?: {
    timezone: string;
    daysOfWeek: number[];
    hour: number;
    minute: number;
    windowMinutes: number;
    mode: 'suggest' | 'autorun';
  };
  policy: {
    requireApproval: boolean;
    dryRun: boolean;
    openTabsMax: number;
  };
}

export const HabitCreationModal: React.FC<HabitCreationModalProps> = ({
  recording,
  onSave,
  onCancel,
}) => {
  const [alias, setAlias] = useState('');
  const [title, setTitle] = useState(recording.title || '');
  const [description, setDescription] = useState('');
  const [enableSchedule, setEnableSchedule] = useState(false);
  const [timezone] = useState('Europe/Stockholm');
  const [selectedDays, setSelectedDays] = useState<number[]>([1, 2, 3, 4, 5]); // Weekdays
  const [hour, setHour] = useState(9);
  const [minute, setMinute] = useState(0);
  const [windowMinutes, setWindowMinutes] = useState(30);
  const [scheduleMode, setScheduleMode] = useState<'suggest' | 'autorun'>('suggest');
  const [requireApproval, setRequireApproval] = useState(true);
  const [dryRun, setDryRun] = useState(false);
  const [openTabsMax, setOpenTabsMax] = useState(10);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const toggleDay = (day: number) => {
    if (selectedDays.includes(day)) {
      setSelectedDays(selectedDays.filter((d) => d !== day));
    } else {
      setSelectedDays([...selectedDays, day].sort((a, b) => a - b));
    }
  };

  const validateAlias = (value: string): string | null => {
    if (!value) {
      return 'Alias is required';
    }
    if (!value.startsWith('@')) {
      return 'Alias must start with @';
    }
    if (value.length < 2 || value.length > 30) {
      return 'Alias must be 2-30 characters';
    }
    if (!/^@[a-z0-9\-_]+$/.test(value)) {
      return 'Alias can only contain lowercase letters, numbers, hyphens, and underscores';
    }
    return null;
  };

  const handleSave = async () => {
    setError(null);

    // Validate alias
    const aliasError = validateAlias(alias);
    if (aliasError) {
      setError(aliasError);
      return;
    }

    if (!title.trim()) {
      setError('Title is required');
      return;
    }

    if (enableSchedule && selectedDays.length === 0) {
      setError('Please select at least one day for the schedule');
      return;
    }

    setIsSaving(true);

    try {
      const habitData: HabitFormData = {
        alias,
        title,
        description,
        schedule: enableSchedule
          ? {
              timezone,
              daysOfWeek: selectedDays,
              hour,
              minute,
              windowMinutes,
              mode: scheduleMode,
            }
          : undefined,
        policy: {
          requireApproval,
          dryRun,
          openTabsMax,
        },
      };

      await onSave(habitData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save habit');
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-background border border-border rounded-lg w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">Create Habit from Recording</h3>
            <p className="text-xs text-muted-foreground mt-1">
              {recording.steps.length} steps recorded
            </p>
          </div>
          <button
            onClick={onCancel}
            className="p-2 hover:bg-secondary rounded-lg transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* Basic Info */}
          <div className="space-y-4">
            <h4 className="font-medium text-sm flex items-center gap-2">
              <Settings className="w-4 h-4" />
              Basic Information
            </h4>

            <div>
              <label className="block text-sm font-medium mb-1">
                Alias * <span className="text-muted-foreground font-normal">(must start with @)</span>
              </label>
              <input
                type="text"
                value={alias}
                onChange={(e) => {
                  let value = e.target.value.toLowerCase();
                  if (value && !value.startsWith('@')) {
                    value = '@' + value;
                  }
                  setAlias(value);
                }}
                placeholder="@morning"
                className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Use this to run the habit: type the alias in the Agent panel
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Title *</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Morning Routine"
                className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Description (optional)</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Opens my productivity apps every morning"
                rows={2}
                className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Schedule */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-medium text-sm flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                Schedule (optional)
              </h4>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={enableSchedule}
                  onChange={(e) => setEnableSchedule(e.target.checked)}
                  className="rounded"
                />
                <span className="text-sm">Enable scheduling</span>
              </label>
            </div>

            {enableSchedule && (
              <div className="space-y-4 p-4 bg-secondary/50 rounded-lg">
                <div>
                  <label className="block text-sm font-medium mb-2">Days of Week</label>
                  <div className="flex gap-2 flex-wrap">
                    {dayNames.map((day, index) => (
                      <button
                        key={index}
                        onClick={() => toggleDay(index)}
                        className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                          selectedDays.includes(index)
                            ? 'bg-blue-600 text-white'
                            : 'bg-background border border-border text-foreground hover:bg-secondary'
                        }`}
                      >
                        {day}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      Time
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        min="0"
                        max="23"
                        value={hour}
                        onChange={(e) => setHour(parseInt(e.target.value) || 0)}
                        className="w-20 px-3 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <span className="self-center">:</span>
                      <input
                        type="number"
                        min="0"
                        max="59"
                        value={minute}
                        onChange={(e) => setMinute(parseInt(e.target.value) || 0)}
                        className="w-20 px-3 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">Window (minutes)</label>
                    <input
                      type="number"
                      min="5"
                      max="120"
                      value={windowMinutes}
                      onChange={(e) => setWindowMinutes(parseInt(e.target.value) || 30)}
                      className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      ±{windowMinutes}min window
                    </p>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Mode</label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setScheduleMode('suggest')}
                      className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        scheduleMode === 'suggest'
                          ? 'bg-blue-600 text-white'
                          : 'bg-background border border-border text-foreground hover:bg-secondary'
                      }`}
                    >
                      Suggest
                      <p className="text-xs opacity-80 mt-1 font-normal">Show notification</p>
                    </button>
                    <button
                      onClick={() => setScheduleMode('autorun')}
                      className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        scheduleMode === 'autorun'
                          ? 'bg-blue-600 text-white'
                          : 'bg-background border border-border text-foreground hover:bg-secondary'
                      }`}
                    >
                      Autorun
                      <p className="text-xs opacity-80 mt-1 font-normal">Run automatically</p>
                    </button>
                  </div>
                </div>

                <div className="text-xs text-muted-foreground p-2 bg-background rounded border border-border">
                  Timezone: {timezone}
                </div>
              </div>
            )}
          </div>

          {/* Policy */}
          <div className="space-y-4">
            <h4 className="font-medium text-sm flex items-center gap-2">
              <Shield className="w-4 h-4" />
              Safety Policy
            </h4>

            <div className="space-y-3">
              <label className="flex items-center justify-between p-3 bg-secondary/50 rounded-lg cursor-pointer hover:bg-secondary transition-colors">
                <div>
                  <div className="font-medium text-sm">Require Approval</div>
                  <div className="text-xs text-muted-foreground">Ask before running the habit</div>
                </div>
                <input
                  type="checkbox"
                  checked={requireApproval}
                  onChange={(e) => setRequireApproval(e.target.checked)}
                  className="rounded"
                />
              </label>

              <label className="flex items-center justify-between p-3 bg-secondary/50 rounded-lg cursor-pointer hover:bg-secondary transition-colors">
                <div>
                  <div className="font-medium text-sm">Dry Run</div>
                  <div className="text-xs text-muted-foreground">Test mode without actual execution</div>
                </div>
                <input
                  type="checkbox"
                  checked={dryRun}
                  onChange={(e) => setDryRun(e.target.checked)}
                  className="rounded"
                />
              </label>

              <div className="p-3 bg-secondary/50 rounded-lg">
                <label className="block font-medium text-sm mb-2">Maximum Tabs to Open</label>
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={openTabsMax}
                  onChange={(e) => setOpenTabsMax(parseInt(e.target.value) || 10)}
                  className="w-32 px-3 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Prevents opening too many tabs
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border space-y-3">
          {error && (
            <div className="p-3 bg-red-100 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
            >
              {isSaving ? 'Creating Habit...' : 'Create Habit'}
            </button>
            <button
              onClick={onCancel}
              disabled={isSaving}
              className="flex-1 px-4 py-2 bg-secondary hover:bg-secondary/80 text-foreground rounded-lg transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
