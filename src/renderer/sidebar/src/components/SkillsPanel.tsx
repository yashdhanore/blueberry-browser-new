/// <reference types="../../../../preload/sidebar.d.ts" />

import React, { useState, useEffect } from 'react';
import {
  Play,
  Save,
  Trash2,
  FileJson,
  Download,
  Upload,
  Search,
  Tag,
  Clock,
  Zap,
  AlertCircle,
  CheckCircle2,
  Loader2
} from 'lucide-react';

interface Skill {
  id: string;
  name: string;
  description: string;
  actions: any[];
  metadata: {
    tags: string[];
    createdAt: string;
    lastUsedAt?: string;
    useCount: number;
    author?: string;
    version: string;
    category?: string;
  };
  context?: {
    startUrl?: string;
    requiredElements?: string[];
    expectedDomain?: string;
    notes?: string;
  };
}

export const SkillsPanel: React.FC = () => {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionResult, setExecutionResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [slashCommand, setSlashCommand] = useState('');

  // Load skills on mount
  useEffect(() => {
    loadSkills();
  }, []);

  const loadSkills = async () => {
    try {
      const response = await window.sidebarAPI.listAllSkills();
      if (response.success && response.skills) {
        setSkills(response.skills);
      }
    } catch (err) {
      console.error('Error loading skills:', err);
      setError('Failed to load skills');
    }
  };

  const handleExecuteSkill = async (skill: Skill) => {
    setIsExecuting(true);
    setError(null);
    setExecutionResult(null);

    try {
      const response = await window.sidebarAPI.executeSkill(skill.id);

      if (response.success) {
        setExecutionResult(response.result);
        await loadSkills(); // Reload to update useCount
      } else {
        setError(response.error || 'Failed to execute skill');
      }
    } catch (err) {
      console.error('Error executing skill:', err);
      setError('Failed to execute skill');
    } finally {
      setIsExecuting(false);
    }
  };

  const handleExecuteSlashCommand = async () => {
    if (!slashCommand.trim()) {
      setError('Please enter a slash command');
      return;
    }

    const skillName = slashCommand.startsWith('/')
      ? slashCommand.slice(1).trim()
      : slashCommand.trim();

    setIsExecuting(true);
    setError(null);
    setExecutionResult(null);

    try {
      const response = await window.sidebarAPI.executeSkillByName(skillName);

      if (response.success) {
        setExecutionResult(response.result);
        await loadSkills();
        setSlashCommand('');
      } else {
        setError(response.error || 'Skill not found');
      }
    } catch (err) {
      console.error('Error executing slash command:', err);
      setError('Failed to execute skill');
    } finally {
      setIsExecuting(false);
    }
  };

  const handleDeleteSkill = async (skill: Skill) => {
    if (!confirm(`Are you sure you want to delete "${skill.name}"?`)) {
      return;
    }

    try {
      const response = await window.sidebarAPI.deleteSkill(skill.id);

      if (response.success) {
        await loadSkills();
        if (selectedSkill?.id === skill.id) {
          setSelectedSkill(null);
        }
      } else {
        setError(response.error || 'Failed to delete skill');
      }
    } catch (err) {
      console.error('Error deleting skill:', err);
      setError('Failed to delete skill');
    }
  };

  const handleExportSkill = async (skill: Skill) => {
    try {
      const response = await window.sidebarAPI.exportSkillToJSON(skill.id);

      if (response.success && response.json) {
        // Copy to clipboard
        navigator.clipboard.writeText(response.json);
        alert('Skill JSON copied to clipboard!');
      } else {
        setError(response.error || 'Failed to export skill');
      }
    } catch (err) {
      console.error('Error exporting skill:', err);
      setError('Failed to export skill');
    }
  };

  const filteredSkills = skills.filter(skill =>
    skill.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    skill.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
    skill.metadata.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <h2 className="text-lg font-semibold mb-3 text-foreground">Skills</h2>

        {/* Slash Command Input */}
        <div className="mb-3">
          <div className="flex gap-2">
            <input
              type="text"
              value={slashCommand}
              onChange={(e) => setSlashCommand(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleExecuteSlashCommand()}
              placeholder="/skill-name"
              className="flex-1 px-3 py-2 rounded-md border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={handleExecuteSlashCommand}
              disabled={isExecuting}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isExecuting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Zap className="w-4 h-4" />
              )}
              Run
            </button>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Execute a skill using /skill-name
          </p>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search skills..."
            className="w-full pl-10 pr-3 py-2 rounded-md border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="mx-4 mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-md flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1 text-sm text-red-500">{error}</div>
          <button
            onClick={() => setError(null)}
            className="text-red-500 hover:text-red-600"
          >
            ×
          </button>
        </div>
      )}

      {/* Execution Result */}
      {executionResult && (
        <div className="mx-4 mt-4 p-3 bg-green-500/10 border border-green-500/20 rounded-md">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 className="w-4 h-4 text-green-500" />
            <span className="text-sm font-medium text-green-500">
              Skill executed successfully
            </span>
          </div>
          <div className="text-xs text-muted-foreground">
            {executionResult.executedActions?.length || 0} actions completed in{' '}
            {(executionResult.duration / 1000).toFixed(2)}s
          </div>
        </div>
      )}

      {/* Skills List */}
      <div className="flex-1 overflow-y-auto p-4">
        {filteredSkills.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Zap className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="text-sm">No skills found</p>
            <p className="text-xs mt-1">
              Create skills from completed agent tasks
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredSkills.map((skill) => (
              <div
                key={skill.id}
                className="p-3 rounded-lg border border-border bg-card hover:border-blue-500/50 transition-colors cursor-pointer"
                onClick={() => setSelectedSkill(selectedSkill?.id === skill.id ? null : skill)}
              >
                {/* Skill Header */}
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <h3 className="font-medium text-foreground text-sm">
                      {skill.name}
                    </h3>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                      {skill.description}
                    </p>
                  </div>
                </div>

                {/* Skill Metadata */}
                <div className="flex items-center gap-3 text-xs text-muted-foreground mb-2">
                  <div className="flex items-center gap-1">
                    <Zap className="w-3 h-3" />
                    <span>{skill.actions.length} actions</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    <span>{skill.metadata.useCount} uses</span>
                  </div>
                </div>

                {/* Tags */}
                {skill.metadata.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-2">
                    {skill.metadata.tags.map((tag, idx) => (
                      <span
                        key={idx}
                        className="px-2 py-0.5 bg-blue-500/10 text-blue-500 rounded text-xs"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                {/* Expanded View */}
                {selectedSkill?.id === skill.id && (
                  <div className="mt-3 pt-3 border-t border-border">
                    {/* Context Info */}
                    {skill.context?.startUrl && (
                      <div className="mb-3">
                        <p className="text-xs text-muted-foreground mb-1">Start URL:</p>
                        <p className="text-xs text-foreground font-mono bg-muted px-2 py-1 rounded">
                          {skill.context.startUrl}
                        </p>
                      </div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleExecuteSkill(skill);
                        }}
                        disabled={isExecuting}
                        className="flex-1 px-3 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 text-xs flex items-center justify-center gap-1"
                      >
                        <Play className="w-3 h-3" />
                        Execute
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleExportSkill(skill);
                        }}
                        className="px-3 py-1.5 border border-border rounded-md hover:bg-muted text-xs flex items-center gap-1"
                      >
                        <FileJson className="w-3 h-3" />
                        Export
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteSkill(skill);
                        }}
                        className="px-3 py-1.5 border border-red-500/50 text-red-500 rounded-md hover:bg-red-500/10 text-xs flex items-center gap-1"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer Info */}
      <div className="p-4 border-t border-border bg-muted/30">
        <p className="text-xs text-muted-foreground">
          💡 Tip: Complete an agent task, then save it as a skill for reuse
        </p>
      </div>
    </div>
  );
};
