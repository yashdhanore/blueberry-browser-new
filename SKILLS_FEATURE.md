# Skills Recording & Playback Feature

## Overview

The Skills feature allows you to record browser automation workflows and replay them using simple slash commands. This feature is perfect for automating repetitive tasks, creating reusable workflows, and sharing automation sequences.

## How It Works

### 1. Recording a Skill

**From an Agent Task:**
1. Go to the **Agent** tab in the sidebar
2. Create and run an agent with a specific goal (e.g., "Extract all product names from this page")
3. Wait for the agent to complete successfully
4. Click **"Save as Skill"** button
5. Enter:
   - **Name**: A descriptive name (e.g., "Extract Products")
   - **Description**: What the skill does (optional)
   - **Tags**: Comma-separated tags for categorization (optional)

The skill is automatically saved to your skills directory in YAML format.

### 2. Managing Skills

Navigate to the **Skills** tab in the sidebar to:
- **View all skills**: Browse your saved skills with metadata
- **Search skills**: Filter by name, description, or tags
- **Execute skills**: Run a skill with one click
- **Export skills**: Copy skill JSON to clipboard for sharing
- **Delete skills**: Remove skills you no longer need

### 3. Using Slash Commands

Execute skills directly using slash commands:

```
/skill-name
```

For example, if you saved a skill named "Extract Products", you can run it with:

```
/extract-products
```

**In the Skills Panel:**
1. Enter the slash command in the input field
2. Click "Run" or press Enter
3. Watch as the skill executes all recorded actions

## Skill Structure

Skills are stored as YAML files in the `skills/` directory within your app data folder. Each skill contains:

### Metadata
- **id**: Unique identifier
- **name**: Display name
- **description**: What the skill does
- **version**: Skill version (default: 1.0.0)
- **tags**: Categorization tags
- **createdAt**: Creation timestamp
- **lastUsedAt**: Last execution timestamp
- **useCount**: Number of times executed

### Actions
A sequence of browser actions that will be executed in order:
- Navigate to URLs
- Click elements
- Type into inputs
- Scroll pages
- Extract data
- And more...

### Context (Optional)
- **startUrl**: The URL where the skill should start
- **requiredElements**: Elements that must exist on the page
- **expectedDomain**: The domain where the skill works
- **notes**: Additional information

## Example Skill (YAML)

```yaml
id: extract-products-abc123
name: Extract Products
description: Extracts product names and prices from e-commerce pages
actions:
  - type: scroll
    parameters:
      direction: down
      amount: 300
  - type: extract
    parameters:
      schema:
        products:
          selector: .product-item
          type: array
          multiple: true
metadata:
  tags:
    - ecommerce
    - data-extraction
  createdAt: '2025-11-08T12:00:00.000Z'
  useCount: 5
  version: 1.0.0
context:
  startUrl: https://example.com/products
  notes: Works best on product listing pages
```

## Features

### Skill Recording
- ✅ Automatically capture successful agent workflows
- ✅ Include all successful actions
- ✅ Store metadata and context information
- ✅ Support for tagging and categorization

### Skill Storage
- ✅ YAML format for human readability
- ✅ JSON export/import for sharing
- ✅ Persistent storage in app data directory
- ✅ Automatic skill versioning

### Skill Execution
- ✅ Execute by ID or name
- ✅ Slash command support (`/skill-name`)
- ✅ Continue on error option
- ✅ Execution result tracking
- ✅ Automatic use count tracking

### UI Integration
- ✅ Dedicated Skills tab in sidebar
- ✅ Search and filter skills
- ✅ Execute skills with one click
- ✅ Export/import functionality
- ✅ "Save as Skill" button in Agent panel

## Use Cases

1. **Data Extraction**
   - Extract product information from e-commerce sites
   - Scrape contact information from business directories
   - Collect article metadata from news sites

2. **Form Filling**
   - Auto-fill registration forms with test data
   - Submit feedback forms quickly
   - Populate multi-step forms

3. **Testing Workflows**
   - Test user registration flows
   - Verify checkout processes
   - Validate form submissions

4. **Content Management**
   - Automate content posting
   - Bulk update product information
   - Manage multiple accounts

## Technical Architecture

### Backend Components

**SkillsManager** (`src/main/agent/SkillsManager.ts`)
- Manages skill lifecycle (create, save, load, execute, delete)
- Handles YAML serialization/deserialization
- Executes skill actions using AgentExecutor
- Tracks skill usage and metadata

**Type Definitions** (`src/main/agent/types.ts`)
- `Skill`: Main skill interface
- `SkillMetadata`: Metadata information
- `SkillContext`: Execution context
- `SkillExecutionResult`: Execution outcome

**IPC Handlers** (`src/main/EventManager.ts`)
- `skill-create-from-agent`: Create skill from agent
- `skill-create`: Create custom skill
- `skill-save`: Save skill to disk
- `skill-load`: Load skill from disk
- `skill-list-all`: Get all skills
- `skill-execute`: Execute skill by ID
- `skill-execute-by-name`: Execute skill by name
- `skill-delete`: Delete skill
- `skill-search-by-tags`: Search skills by tags
- `skill-export-json`: Export skill as JSON
- `skill-import-json`: Import skill from JSON

### Frontend Components

**SkillsPanel** (`src/renderer/sidebar/src/components/SkillsPanel.tsx`)
- Main UI for skills management
- Slash command input and execution
- Skills list with search/filter
- Skill detail view with actions
- Export/delete functionality

**AgentPanel Integration** (`src/renderer/sidebar/src/components/Agentpanel.tsx`)
- "Save as Skill" button for completed agents
- Prompts for skill name, description, and tags
- Success notification with slash command

**Preload API** (`src/preload/sidebar.ts`)
- Exposes all skill-related IPC methods to renderer
- Type-safe API for frontend components

## Installation & Setup

1. **Install Dependencies**
   ```bash
   npm install
   ```
   The `yaml` package is required for YAML serialization.

2. **Run the Application**
   ```bash
   npm run dev
   ```

3. **Skills Directory**
   Skills are stored in:
   - **Windows**: `%APPDATA%/blueberry-browser/skills/`
   - **macOS**: `~/Library/Application Support/blueberry-browser/skills/`
   - **Linux**: `~/.config/blueberry-browser/skills/`

## API Reference

### Frontend API (via `window.sidebarAPI`)

```typescript
// Create skill from agent
createSkillFromAgent(agentId: string, name: string, description?: string, tags?: string[])

// Create custom skill
createSkill(name: string, description: string, actions: any[], tags?: string[])

// Execute skill
executeSkill(skillId: string, options?: { tabId?: string; continueOnError?: boolean })
executeSkillByName(name: string, options?: any)

// Manage skills
listAllSkills()
getSkill(skillId: string)
deleteSkill(skillId: string)
searchSkillsByTags(tags: string[])

// Import/Export
exportSkillToJSON(skillId: string)
importSkillFromJSON(jsonContent: string)
```

### Backend API (SkillsManager)

```typescript
class SkillsManager {
  // Create skills
  createSkillFromAgent(agentState, name, description?, tags?, context?): Skill
  createSkill(name, description, actions, tags?, context?): Skill

  // Persistence
  saveSkill(skill): Promise<void>
  loadSkill(skillId): Promise<Skill | null>
  loadAllSkills(): Promise<void>
  deleteSkill(skillId): Promise<void>

  // Execution
  executeSkill(skillId, options?): Promise<SkillExecutionResult>
  executeSkillByName(name, options?): Promise<SkillExecutionResult>

  // Queries
  getAllSkills(): Skill[]
  getSkill(skillId): Skill | null
  findSkillByName(name): Skill | null
  searchSkillsByTags(tags): Skill[]
  searchSkillsByCategory(category): Skill[]

  // Utilities
  exportSkillToJSON(skillId): Promise<string>
  importSkillFromJSON(jsonContent): Promise<Skill>
  getSkillsDirectory(): string
}
```

## Future Enhancements

- [ ] Skill marketplace for sharing
- [ ] Skill parameters for dynamic inputs
- [ ] Conditional logic in skills
- [ ] Loop support for repeated actions
- [ ] Skill composition (combine multiple skills)
- [ ] Visual skill editor
- [ ] Skill templates library
- [ ] Automatic skill suggestions based on browsing patterns
- [ ] Skill analytics and performance tracking

## Troubleshooting

### Skills not appearing
- Check that skills are saved in the correct directory
- Verify YAML syntax is valid
- Reload the Skills tab

### Skill execution failing
- Ensure the target website structure hasn't changed
- Check if the skill's `startUrl` is still valid
- Review the skill's `requiredElements` in context
- Try executing with `continueOnError: true`

### Slash command not working
- Make sure the skill name matches (case-insensitive)
- Skill names with spaces are converted to hyphens (e.g., "My Skill" → `/my-skill`)
- Check the Skills tab to see the exact skill name

## Contributing

To add new skill-related features:

1. **Backend**: Update `SkillsManager.ts` and add IPC handlers in `EventManager.ts`
2. **Frontend**: Update `SkillsPanel.tsx` and add API methods in `sidebar.ts`
3. **Types**: Add new types in `src/main/agent/types.ts`
4. **Documentation**: Update this README

## License

This feature is part of the Blueberry Browser project.
