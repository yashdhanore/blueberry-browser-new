/**
 * Habits Manager
 *
 * Manages persistent storage of habits.
 * Saves habits to disk and provides CRUD operations.
 */

import * as fs from "fs";
import * as path from "path";
import { app } from "electron";
import type { Habit, HabitExecutionTrace, DEFAULT_HABIT_POLICY } from "./types";

export class HabitsManager {
  private habitsDir: string;
  private tracesDir: string;
  private habits: Map<string, Habit> = new Map();
  private traces: Map<string, HabitExecutionTrace[]> = new Map(); // habitId -> traces

  constructor() {
    // Store habits in user data directory
    const userDataPath = app.getPath("userData");
    this.habitsDir = path.join(userDataPath, "habits");
    this.tracesDir = path.join(userDataPath, "habit-traces");

    // Ensure directories exist
    this.ensureDirectories();

    // Load existing habits
    this.loadAllHabits();
  }

  /**
   * Save a habit to disk
   */
  saveHabit(habit: Omit<Habit, "id" | "createdAt" | "updatedAt">): string {
    const id = this.generateHabitId(habit.alias);

    const fullHabit: Habit = {
      ...habit,
      id,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Validate habit
    this.validateHabit(fullHabit);

    // Save to disk
    const filePath = this.getHabitFilePath(id);
    fs.writeFileSync(
      filePath,
      JSON.stringify(fullHabit, null, 2),
      "utf-8"
    );

    // Add to memory cache
    this.habits.set(id, fullHabit);

    return id;
  }

  /**
   * Update an existing habit
   */
  updateHabit(
    habitId: string,
    updates: Partial<Omit<Habit, "id" | "createdAt">>
  ): boolean {
    const habit = this.habits.get(habitId);
    if (!habit) {
      return false;
    }

    const updatedHabit: Habit = {
      ...habit,
      ...updates,
      id: habitId,
      createdAt: habit.createdAt,
      updatedAt: new Date(),
    };

    // Validate updated habit
    this.validateHabit(updatedHabit);

    // Save to disk
    const filePath = this.getHabitFilePath(habitId);
    fs.writeFileSync(
      filePath,
      JSON.stringify(updatedHabit, null, 2),
      "utf-8"
    );

    // Update memory cache
    this.habits.set(habitId, updatedHabit);

    return true;
  }

  /**
   * Load a habit by ID
   */
  getHabit(habitId: string): Habit | null {
    // Try memory cache first
    let habit = this.habits.get(habitId);
    if (habit) {
      return habit;
    }

    // Try loading from disk
    const filePath = this.getHabitFilePath(habitId);
    if (fs.existsSync(filePath)) {
      try {
        const content = fs.readFileSync(filePath, "utf-8");
        habit = JSON.parse(content) as Habit;
        this.habits.set(habitId, habit);
        return habit;
      } catch (error) {
        console.error(`Error loading habit ${habitId}:`, error);
        return null;
      }
    }

    return null;
  }

  /**
   * Get habit by alias
   */
  getHabitByAlias(alias: string): Habit | null {
    // Normalize alias (ensure @ prefix)
    const normalizedAlias = alias.startsWith("@") ? alias : `@${alias}`;

    for (const habit of this.habits.values()) {
      if (habit.alias === normalizedAlias) {
        return habit;
      }
    }

    // Search in disk if not in cache
    const files = fs.readdirSync(this.habitsDir);
    for (const file of files) {
      if (!file.endsWith(".json")) continue;

      try {
        const filePath = path.join(this.habitsDir, file);
        const content = fs.readFileSync(filePath, "utf-8");
        const habit = JSON.parse(content) as Habit;

        if (habit.alias === normalizedAlias) {
          this.habits.set(habit.id, habit);
          return habit;
        }
      } catch (error) {
        console.error(`Error reading habit file ${file}:`, error);
      }
    }

    return null;
  }

  /**
   * Delete a habit
   */
  deleteHabit(habitId: string): boolean {
    const filePath = this.getHabitFilePath(habitId);

    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
        this.habits.delete(habitId);

        // Also delete traces
        const tracesPath = this.getTracesFilePath(habitId);
        if (fs.existsSync(tracesPath)) {
          fs.unlinkSync(tracesPath);
          this.traces.delete(habitId);
        }

        return true;
      } catch (error) {
        console.error(`Error deleting habit ${habitId}:`, error);
        return false;
      }
    }

    return false;
  }

  /**
   * List all habits
   */
  listHabits(): Habit[] {
    return Array.from(this.habits.values()).sort(
      (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()
    );
  }

  /**
   * Get habits with schedules
   */
  getScheduledHabits(): Habit[] {
    return this.listHabits().filter((habit) => habit.schedule);
  }

  /**
   * Save execution trace
   */
  saveTrace(trace: HabitExecutionTrace): void {
    const habitId = trace.habitId;
    let traces = this.traces.get(habitId) || [];

    // Add new trace
    traces.unshift(trace);

    // Keep only last 10 traces per habit
    traces = traces.slice(0, 10);

    this.traces.set(habitId, traces);

    // Save to disk
    const tracesPath = this.getTracesFilePath(habitId);
    fs.writeFileSync(tracesPath, JSON.stringify(traces, null, 2), "utf-8");
  }

  /**
   * Get traces for a habit
   */
  getTraces(habitId: string): HabitExecutionTrace[] {
    // Try memory cache first
    let traces = this.traces.get(habitId);
    if (traces) {
      return traces;
    }

    // Load from disk
    const tracesPath = this.getTracesFilePath(habitId);
    if (fs.existsSync(tracesPath)) {
      try {
        const content = fs.readFileSync(tracesPath, "utf-8");
        traces = JSON.parse(content) as HabitExecutionTrace[];
        this.traces.set(habitId, traces);
        return traces;
      } catch (error) {
        console.error(`Error loading traces for habit ${habitId}:`, error);
      }
    }

    return [];
  }

  /**
   * Update habit's last run info
   */
  updateLastRun(
    habitId: string,
    result: "success" | "failed" | "skipped"
  ): void {
    const habit = this.getHabit(habitId);
    if (!habit) return;

    habit.lastRunAt = new Date();
    habit.lastRunResult = result;
    habit.updatedAt = new Date();

    const filePath = this.getHabitFilePath(habitId);
    fs.writeFileSync(filePath, JSON.stringify(habit, null, 2), "utf-8");

    this.habits.set(habitId, habit);
  }

  /**
   * Update last suggestion date (to prevent duplicate suggestions)
   */
  updateLastSuggestion(habitId: string, date: string): void {
    const habit = this.getHabit(habitId);
    if (!habit) return;

    habit.lastSuggestionDate = date;
    habit.updatedAt = new Date();

    const filePath = this.getHabitFilePath(habitId);
    fs.writeFileSync(filePath, JSON.stringify(habit, null, 2), "utf-8");

    this.habits.set(habitId, habit);
  }

  /**
   * Validate habit structure
   */
  private validateHabit(habit: Habit): void {
    // Validate alias
    if (!habit.alias.match(/^@[a-z0-9\-_]{1,29}$/)) {
      throw new Error(
        "Alias must start with @ and contain only lowercase letters, numbers, hyphens, and underscores (2-30 chars total)"
      );
    }

    // Check uniqueness (except for updates)
    const existing = this.getHabitByAlias(habit.alias);
    if (existing && existing.id !== habit.id) {
      throw new Error(`Alias ${habit.alias} is already in use`);
    }

    // Validate actions
    if (!habit.actions || habit.actions.length === 0) {
      throw new Error("Habit must have at least one action");
    }

    // Validate schedule if present
    if (habit.schedule) {
      if (habit.schedule.daysOfWeek.length === 0) {
        throw new Error("Schedule must have at least one day selected");
      }

      if (
        habit.schedule.hour < 0 ||
        habit.schedule.hour > 23 ||
        habit.schedule.minute < 0 ||
        habit.schedule.minute > 59
      ) {
        throw new Error("Invalid time in schedule");
      }
    }
  }

  private ensureDirectories(): void {
    if (!fs.existsSync(this.habitsDir)) {
      fs.mkdirSync(this.habitsDir, { recursive: true });
    }
    if (!fs.existsSync(this.tracesDir)) {
      fs.mkdirSync(this.tracesDir, { recursive: true });
    }
  }

  private loadAllHabits(): void {
    try {
      const files = fs.readdirSync(this.habitsDir);

      for (const file of files) {
        if (!file.endsWith(".json")) continue;

        try {
          const filePath = path.join(this.habitsDir, file);
          const content = fs.readFileSync(filePath, "utf-8");
          const habit = JSON.parse(content) as Habit;

          // Convert date strings back to Date objects
          habit.createdAt = new Date(habit.createdAt);
          habit.updatedAt = new Date(habit.updatedAt);
          if (habit.lastRunAt) {
            habit.lastRunAt = new Date(habit.lastRunAt);
          }

          this.habits.set(habit.id, habit);
        } catch (error) {
          console.error(`Error loading habit file ${file}:`, error);
        }
      }
    } catch (error) {
      console.error("Error loading habits:", error);
    }
  }

  private getHabitFilePath(habitId: string): string {
    return path.join(this.habitsDir, `${habitId}.json`);
  }

  private getTracesFilePath(habitId: string): string {
    return path.join(this.tracesDir, `${habitId}.json`);
  }

  private generateHabitId(alias: string): string {
    const sanitizedAlias = alias
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .substring(0, 30);

    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 6);

    return `${sanitizedAlias}-${timestamp}-${random}`;
  }

  /**
   * Cleanup
   */
  cleanup(): void {
    this.habits.clear();
    this.traces.clear();
  }
}
