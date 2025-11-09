/**
 * Recipes Manager
 *
 * Manages persistent storage of agent recipes.
 * Saves recipes to disk and provides CRUD operations.
 */

import * as fs from "fs";
import * as path from "path";
import { app } from "electron";
import type { AgentRecipe, PuppeteerRecording } from "./types";

export interface RecipeWithMetadata extends AgentRecipe {
  id: string;
  puppeteerRecording?: PuppeteerRecording; // Optional original recording
}

export class RecipesManager {
  private recipesDir: string;
  private recipes: Map<string, RecipeWithMetadata> = new Map();

  constructor() {
    // Store recipes in user data directory
    const userDataPath = app.getPath("userData");
    this.recipesDir = path.join(userDataPath, "recipes");

    // Ensure directory exists
    this.ensureRecipesDirectory();

    // Load existing recipes
    this.loadAllRecipes();
  }

  /**
   * Save a recipe to disk
   */
  saveRecipe(
    recipe: AgentRecipe,
    puppeteerRecording?: PuppeteerRecording
  ): string {
    const id = this.generateRecipeId(recipe.name);

    const recipeWithMetadata: RecipeWithMetadata = {
      ...recipe,
      id,
      puppeteerRecording,
      createdAt: new Date(),
      useCount: 0,
    };

    // Save to disk
    const filePath = this.getRecipeFilePath(id);
    fs.writeFileSync(
      filePath,
      JSON.stringify(recipeWithMetadata, null, 2),
      "utf-8"
    );

    // Add to memory cache
    this.recipes.set(id, recipeWithMetadata);

    return id;
  }

  /**
   * Load a recipe by ID
   */
  loadRecipe(recipeId: string): RecipeWithMetadata | null {
    // Try memory cache first
    let recipe = this.recipes.get(recipeId);
    if (recipe) {
      return recipe;
    }

    const filePath = this.getRecipeFilePath(recipeId);
    if (fs.existsSync(filePath)) {
      try {
        const content = fs.readFileSync(filePath, "utf-8");
        recipe = JSON.parse(content) as RecipeWithMetadata;
        this.recipes.set(recipeId, recipe);
        return recipe;
      } catch (error) {
        console.error(`Error loading recipe ${recipeId}:`, error);
        return null;
      }
    }

    return null;
  }

  /**
   * Load recipe by name
   */
  loadRecipeByName(name: string): RecipeWithMetadata | null {
    // Search in memory cache
    for (const recipe of this.recipes.values()) {
      if (recipe.name === name) {
        return recipe;
      }
    }

    // Search in disk
    const files = fs.readdirSync(this.recipesDir);
    for (const file of files) {
      if (!file.endsWith(".json")) continue;

      try {
        const filePath = path.join(this.recipesDir, file);
        const content = fs.readFileSync(filePath, "utf-8");
        const recipe = JSON.parse(content) as RecipeWithMetadata;

        if (recipe.name === name) {
          this.recipes.set(recipe.id, recipe);
          return recipe;
        }
      } catch (error) {
        console.error(`Error reading recipe file ${file}:`, error);
      }
    }

    return null;
  }

  /**
   * Update recipe (increment use count, update last used date)
   */
  updateRecipeUsage(recipeId: string): void {
    const recipe = this.loadRecipe(recipeId);
    if (!recipe) return;

    recipe.useCount++;
    recipe.lastUsedAt = new Date();

    const filePath = this.getRecipeFilePath(recipeId);
    fs.writeFileSync(filePath, JSON.stringify(recipe, null, 2), "utf-8");

    this.recipes.set(recipeId, recipe);
  }

  /**
   * Delete a recipe
   */
  deleteRecipe(recipeId: string): boolean {
    const filePath = this.getRecipeFilePath(recipeId);

    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
        this.recipes.delete(recipeId);
        return true;
      } catch (error) {
        console.error(`Error deleting recipe ${recipeId}:`, error);
        return false;
      }
    }

    return false;
  }

  /**
   * List all recipes
   */
  listRecipes(): RecipeWithMetadata[] {
    return Array.from(this.recipes.values()).sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
    );
  }

  /**
   * Search recipes by tags
   */
  searchByTags(tags: string[]): RecipeWithMetadata[] {
    return this.listRecipes().filter((recipe) =>
      tags.some((tag) => recipe.tags.includes(tag))
    );
  }

  /**
   * Get most used recipes
   */
  getMostUsedRecipes(limit: number = 10): RecipeWithMetadata[] {
    return this.listRecipes()
      .sort((a, b) => b.useCount - a.useCount)
      .slice(0, limit);
  }

  /**
   * Export recipe to JSON file
   */
  exportRecipe(recipeId: string, exportPath: string): boolean {
    const recipe = this.loadRecipe(recipeId);
    if (!recipe) return false;

    try {
      fs.writeFileSync(exportPath, JSON.stringify(recipe, null, 2), "utf-8");
      return true;
    } catch (error) {
      console.error(`Error exporting recipe:`, error);
      return false;
    }
  }

  /**
   * Import recipe from JSON file
   */
  importRecipe(importPath: string): string | null {
    try {
      const content = fs.readFileSync(importPath, "utf-8");
      const recipe = JSON.parse(content) as RecipeWithMetadata;

      // Generate new ID to avoid conflicts
      const newId = this.generateRecipeId(recipe.name);
      recipe.id = newId;
      recipe.createdAt = new Date();

      const filePath = this.getRecipeFilePath(newId);
      fs.writeFileSync(filePath, JSON.stringify(recipe, null, 2), "utf-8");

      this.recipes.set(newId, recipe);

      return newId;
    } catch (error) {
      console.error(`Error importing recipe:`, error);
      return null;
    }
  }

  /**
   * Get recipe stats
   */
  getStats(): {
    totalRecipes: number;
    totalUses: number;
    averageActionsPerRecipe: number;
    mostUsedTags: { tag: string; count: number }[];
  } {
    const recipes = this.listRecipes();

    const totalRecipes = recipes.length;
    const totalUses = recipes.reduce((sum, r) => sum + r.useCount, 0);

    const totalActions = recipes.reduce((sum, r) => sum + r.actions.length, 0);
    const averageActionsPerRecipe =
      totalRecipes > 0 ? Math.round(totalActions / totalRecipes) : 0;

    // Count tag occurrences
    const tagCounts = new Map<string, number>();
    for (const recipe of recipes) {
      for (const tag of recipe.tags) {
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
      }
    }

    const mostUsedTags = Array.from(tagCounts.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      totalRecipes,
      totalUses,
      averageActionsPerRecipe,
      mostUsedTags,
    };
  }

  private ensureRecipesDirectory(): void {
    if (!fs.existsSync(this.recipesDir)) {
      fs.mkdirSync(this.recipesDir, { recursive: true });
    }
  }

  private loadAllRecipes(): void {
    try {
      const files = fs.readdirSync(this.recipesDir);

      for (const file of files) {
        if (!file.endsWith(".json")) continue;

        try {
          const filePath = path.join(this.recipesDir, file);
          const content = fs.readFileSync(filePath, "utf-8");
          const recipe = JSON.parse(content) as RecipeWithMetadata;

          // Convert date strings back to Date objects
          recipe.createdAt = new Date(recipe.createdAt);
          if (recipe.lastUsedAt) {
            recipe.lastUsedAt = new Date(recipe.lastUsedAt);
          }

          this.recipes.set(recipe.id, recipe);
        } catch (error) {
          console.error(`Error loading recipe file ${file}:`, error);
        }
      }
    } catch (error) {
      console.error("Error loading recipes:", error);
    }
  }

  private getRecipeFilePath(recipeId: string): string {
    return path.join(this.recipesDir, `${recipeId}.json`);
  }

  private generateRecipeId(name: string): string {
    const sanitizedName = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .substring(0, 30);

    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 6);

    return `${sanitizedName}-${timestamp}-${random}`;
  }

  /**
   * Cleanup
   */
  cleanup(): void {
    this.recipes.clear();
  }
}
