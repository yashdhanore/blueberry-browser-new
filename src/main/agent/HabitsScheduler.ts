/**
 * Habits Scheduler
 *
 * Handles time-based execution of habits:
 * - Runs every minute to check for scheduled habits
 * - Supports timezone-aware scheduling
 * - Prevents duplicate suggestions within the same window
 * - Emits events for suggestions and autoruns
 */

import { EventEmitter } from "events";
import type { Habit } from "./types";
import type { HabitsManager } from "./HabitsManager";

interface SchedulerEvents {
  suggestion: (habit: Habit) => void;
  autorun: (habit: Habit) => void;
}

export declare interface HabitsScheduler {
  on<U extends keyof SchedulerEvents>(
    event: U,
    listener: SchedulerEvents[U]
  ): this;
  emit<U extends keyof SchedulerEvents>(
    event: U,
    ...args: Parameters<SchedulerEvents[U]>
  ): boolean;
}

export class HabitsScheduler extends EventEmitter {
  private habitsManager: HabitsManager;
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;

  constructor(habitsManager: HabitsManager) {
    super();
    this.habitsManager = habitsManager;
  }

  /**
   * Start the scheduler
   */
  start(): void {
    if (this.isRunning) {
      console.log("Scheduler already running");
      return;
    }

    console.log("Starting Habits Scheduler...");
    this.isRunning = true;

    // Check immediately
    this.checkScheduledHabits();

    // Then check every minute
    this.intervalId = setInterval(() => {
      this.checkScheduledHabits();
    }, 60 * 1000); // 60 seconds
  }

  /**
   * Stop the scheduler
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    console.log("Stopped Habits Scheduler");
  }

  /**
   * Check all scheduled habits
   */
  private checkScheduledHabits(): void {
    const scheduledHabits = this.habitsManager.getScheduledHabits();

    for (const habit of scheduledHabits) {
      if (this.shouldTriggerHabit(habit)) {
        this.triggerHabit(habit);
      }
    }
  }

  /**
   * Check if a habit should be triggered now
   */
  private shouldTriggerHabit(habit: Habit): boolean {
    if (!habit.schedule) return false;

    const now = new Date();
    const schedule = habit.schedule;

    // Get current time in the habit's timezone
    const currentTime = this.getTimeInTimezone(now, schedule.timezone);

    // Check if today is a scheduled day
    const currentDay = currentTime.getDay(); // 0=Sunday, 1=Monday, etc.
    if (!schedule.daysOfWeek.includes(currentDay)) {
      return false;
    }

    // Get current hour and minute
    const currentHour = currentTime.getHours();
    const currentMinute = currentTime.getMinutes();

    // Calculate minutes since midnight
    const currentMinutesSinceMidnight = currentHour * 60 + currentMinute;
    const scheduledMinutesSinceMidnight =
      schedule.hour * 60 + schedule.minute;

    // Calculate window
    const windowStart = scheduledMinutesSinceMidnight - schedule.windowMinutes;
    const windowEnd = scheduledMinutesSinceMidnight + schedule.windowMinutes;

    // Check if we're within the window
    const inWindow =
      currentMinutesSinceMidnight >= windowStart &&
      currentMinutesSinceMidnight <= windowEnd;

    if (!inWindow) {
      return false;
    }

    // Check if we already suggested today (prevent duplicate suggestions)
    const todayStr = this.getTodayString(schedule.timezone);
    if (habit.lastSuggestionDate === todayStr) {
      return false;
    }

    return true;
  }

  /**
   * Trigger a habit (suggestion or autorun)
   */
  private triggerHabit(habit: Habit): void {
    if (!habit.schedule) return;

    // Mark as suggested today
    const todayStr = this.getTodayString(habit.schedule.timezone);
    this.habitsManager.updateLastSuggestion(habit.id, todayStr);

    // Emit appropriate event
    if (habit.schedule.mode === "autorun") {
      console.log(`Autorun habit: ${habit.alias}`);
      this.emit("autorun", habit);
    } else {
      console.log(`Suggest habit: ${habit.alias}`);
      this.emit("suggestion", habit);
    }
  }

  /**
   * Get current time in a specific timezone
   */
  private getTimeInTimezone(date: Date, timezone: string): Date {
    try {
      // Use Intl API to get time in specific timezone
      const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      });

      const parts = formatter.formatToParts(date);
      const getValue = (type: string) =>
        parts.find((p) => p.type === type)?.value || "0";

      const year = parseInt(getValue("year"));
      const month = parseInt(getValue("month")) - 1; // JS months are 0-indexed
      const day = parseInt(getValue("day"));
      const hour = parseInt(getValue("hour"));
      const minute = parseInt(getValue("minute"));
      const second = parseInt(getValue("second"));

      return new Date(year, month, day, hour, minute, second);
    } catch (error) {
      console.error(`Error converting to timezone ${timezone}:`, error);
      return date; // Fallback to original date
    }
  }

  /**
   * Get today's date string in format YYYY-MM-DD in a specific timezone
   */
  private getTodayString(timezone: string): string {
    const now = new Date();
    const timeInZone = this.getTimeInTimezone(now, timezone);

    const year = timeInZone.getFullYear();
    const month = String(timeInZone.getMonth() + 1).padStart(2, "0");
    const day = String(timeInZone.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
  }

  /**
   * Get next scheduled run time for a habit
   */
  getNextRunTime(habit: Habit): Date | null {
    if (!habit.schedule) return null;

    const now = new Date();
    const schedule = habit.schedule;
    const currentTime = this.getTimeInTimezone(now, schedule.timezone);

    // Find next occurrence
    for (let daysAhead = 0; daysAhead < 7; daysAhead++) {
      const checkDate = new Date(currentTime);
      checkDate.setDate(checkDate.getDate() + daysAhead);

      const checkDay = checkDate.getDay();
      if (!schedule.daysOfWeek.includes(checkDay)) {
        continue;
      }

      // Set to scheduled time
      checkDate.setHours(schedule.hour, schedule.minute, 0, 0);

      // If it's today, make sure we haven't passed the window end
      if (daysAhead === 0) {
        const scheduledMinutes = schedule.hour * 60 + schedule.minute;
        const currentMinutes =
          currentTime.getHours() * 60 + currentTime.getMinutes();

        if (currentMinutes > scheduledMinutes + schedule.windowMinutes) {
          continue; // Passed window today, skip to next occurrence
        }
      }

      return checkDate;
    }

    return null;
  }

  /**
   * Cleanup
   */
  cleanup(): void {
    this.stop();
    this.removeAllListeners();
  }
}
