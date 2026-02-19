import { useState, useEffect, useCallback } from "react";
import {
  CustomSkill,
  SkillRegistryEntry,
  SkillStatusReport,
  SkillStatusEntry,
} from "../../shared/types";

interface SkillHubBrowserProps {
  onSkillInstalled?: (skill: CustomSkill) => void;
  onClose?: () => void;
}

export function SkillHubBrowser({ onSkillInstalled, onClose }: SkillHubBrowserProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SkillRegistryEntry[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedSkill, setSelectedSkill] = useState<SkillRegistryEntry | null>(null);
  const [installedSkills, setInstalledSkills] = useState<Set<string>>(new Set());
  const [skillStatus, setSkillStatus] = useState<SkillStatusReport | null>(null);
  const [installing, setInstalling] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"browse" | "installed" | "status">("installed");
  const [isLoadingStatus, setIsLoadingStatus] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Load installed skills and status on mount
  useEffect(() => {
    loadSkillStatus();
  }, []);

  const loadSkillStatus = async (showRefreshing = false) => {
    if (showRefreshing) {
      setIsRefreshing(true);
    }
    try {
      const status = await window.electronAPI.getSkillStatus();
      setSkillStatus(status);

      // Build set of installed skill IDs
      const installed = new Set<string>();
      status.skills.forEach((skill) => {
        if (skill.source === "managed") {
          installed.add(skill.id);
        }
      });
      setInstalledSkills(installed);
    } catch (err) {
      console.error("Failed to load skill status:", err);
      setError("Failed to load skill status");
    } finally {
      setIsLoadingStatus(false);
      setIsRefreshing(false);
    }
  };

  const handleRefresh = () => {
    loadSkillStatus(true);
  };

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    setError(null);

    try {
      const result = await window.electronAPI.searchSkillRegistry(searchQuery);
      setSearchResults(result.results);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Search failed";
      setError(message);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, [searchQuery]);

  const handleInstall = async (skillId: string) => {
    setInstalling(skillId);
    setError(null);

    try {
      const result = await window.electronAPI.installSkillFromRegistry(skillId);

      if (result.success && result.skill) {
        setInstalledSkills((prev) => new Set([...prev, skillId]));
        onSkillInstalled?.(result.skill);
        await loadSkillStatus();
      } else {
        setError(result.error || "Installation failed");
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Installation failed";
      setError(message);
    } finally {
      setInstalling(null);
    }
  };

  const handleUninstall = async (skillId: string) => {
    if (!confirm(`Are you sure you want to uninstall "${skillId}"?`)) {
      return;
    }

    setInstalling(skillId);
    setError(null);

    try {
      const result = await window.electronAPI.uninstallSkill(skillId);

      if (result.success) {
        setInstalledSkills((prev) => {
          const next = new Set(prev);
          next.delete(skillId);
          return next;
        });
        await loadSkillStatus();
      } else {
        setError(result.error || "Uninstall failed");
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Uninstall failed";
      setError(message);
    } finally {
      setInstalling(null);
    }
  };

  const handleOpenFolder = async () => {
    await window.electronAPI.openCustomSkillsFolder();
  };

  const getStatusBadge = (entry: SkillStatusEntry) => {
    if (entry.eligible) {
      return <span className="settings-badge settings-badge--success">Ready</span>;
    }
    if (entry.disabled) {
      return <span className="settings-badge settings-badge--warning">Disabled</span>;
    }
    if (entry.blockedByAllowlist) {
      return <span className="settings-badge settings-badge--error">Blocked</span>;
    }
    return <span className="settings-badge settings-badge--neutral">Missing Requirements</span>;
  };

  const renderBrowseTab = () => (
    <div className="skillhub-tab">
      <div className="input-with-button">
        <input
          type="text"
          placeholder="Search skills..."
          className="settings-input"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
        />
        <button
          className="button-secondary button-small"
          onClick={handleSearch}
          disabled={isSearching}
        >
          {isSearching ? "Searching..." : "Search"}
        </button>
      </div>

      {searchResults.length > 0 ? (
        <div className="skillhub-list">
          {searchResults.map((skill) => (
            <div
              key={skill.id}
              className={`settings-card skillhub-card ${selectedSkill?.id === skill.id ? "is-selected" : ""}`}
              onClick={() => setSelectedSkill(skill)}
            >
              <div className="skillhub-card-header">
                <div className="skillhub-card-info">
                  <span className="skillhub-icon">{skill.icon || "📦"}</span>
                  <div>
                    <div className="skillhub-title-row">
                      <h4 className="skillhub-title">{skill.name}</h4>
                    </div>
                    <p className="settings-description skillhub-description">{skill.description}</p>
                  </div>
                </div>
                <div className="skillhub-card-actions">
                  {installedSkills.has(skill.id) ? (
                    <span className="settings-badge settings-badge--success">Installed</span>
                  ) : (
                    <button
                      className="button-primary button-small"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleInstall(skill.id);
                      }}
                      disabled={installing === skill.id}
                    >
                      {installing === skill.id ? "Installing..." : "Install"}
                    </button>
                  )}
                </div>
              </div>
              {skill.tags && skill.tags.length > 0 && (
                <div className="skillhub-tags">
                  {skill.tags.map((tag) => (
                    <span key={tag} className="settings-badge settings-badge--outline">
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : searchQuery && !isSearching ? (
        <div className="settings-empty">No skills found. Try a different search term.</div>
      ) : (
        <div className="settings-empty">
          Search the SkillHub registry to discover and install new skills.
        </div>
      )}
    </div>
  );

  const renderInstalledTab = () => {
    const managedSkills = skillStatus?.skills.filter((s) => s.source === "managed") || [];

    return (
      <div className="skillhub-tab">
        <div className="settings-section-header">
          <h3>Installed from Registry</h3>
          <div className="settings-section-actions">
            <button className="button-secondary button-small" onClick={handleOpenFolder}>
              Open Folder
            </button>
          </div>
        </div>

        {managedSkills.length > 0 ? (
          <div className="skillhub-list">
            {managedSkills.map((skill) => (
              <div key={skill.id} className="settings-card skillhub-card">
                <div className="skillhub-card-header">
                  <div className="skillhub-card-info">
                    <span className="skillhub-icon">{skill.icon || "📦"}</span>
                    <div>
                      <div className="skillhub-title-row">
                        <h4 className="skillhub-title">{skill.name}</h4>
                        {getStatusBadge(skill)}
                      </div>
                      <p className="settings-description skillhub-description">
                        {skill.description}
                      </p>
                      {skill.metadata?.version && (
                        <p className="skillhub-meta">v{skill.metadata.version}</p>
                      )}
                    </div>
                  </div>
                  <button
                    className="button-danger button-small"
                    onClick={() => handleUninstall(skill.id)}
                    disabled={installing === skill.id}
                  >
                    {installing === skill.id ? "Uninstalling..." : "Uninstall"}
                  </button>
                </div>

                {!skill.eligible && (
                  <div className="skillhub-warnings">
                    {skill.missing.bins.length > 0 && (
                      <p>Missing binaries: {skill.missing.bins.join(", ")}</p>
                    )}
                    {skill.missing.env.length > 0 && (
                      <p>Missing env vars: {skill.missing.env.join(", ")}</p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="settings-empty">
            No skills installed from registry yet.
            <br />
            Browse the registry to discover and install skills.
          </div>
        )}
      </div>
    );
  };

  const renderStatusTab = () => {
    if (!skillStatus) {
      return <div className="settings-empty">Loading skill status...</div>;
    }

    return (
      <div className="skillhub-tab">
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-label">Total Skills</div>
            <div className="stat-value">{skillStatus.summary.total}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Ready</div>
            <div className="stat-value stat-value--success">{skillStatus.summary.eligible}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Disabled</div>
            <div className="stat-value stat-value--warning">{skillStatus.summary.disabled}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Missing Deps</div>
            <div className="stat-value stat-value--error">
              {skillStatus.summary.missingRequirements}
            </div>
          </div>
        </div>

        {["bundled", "managed", "workspace"].map((source) => {
          const skills = skillStatus.skills.filter((s) => s.source === source);
          if (skills.length === 0) return null;

          return (
            <details key={source} className="skillhub-group" open={source !== "bundled"}>
              <summary>
                <span className="skillhub-group-title">{source} Skills</span>
                <span className="settings-badge settings-badge--neutral">{skills.length}</span>
              </summary>
              <div className="skillhub-group-content">
                {skills.map((skill) => (
                  <div key={skill.id} className="skillhub-group-item">
                    <div className="skillhub-group-info">
                      <span>{skill.icon || "📦"}</span>
                      <span>{skill.name}</span>
                    </div>
                    {getStatusBadge(skill)}
                  </div>
                ))}
              </div>
            </details>
          );
        })}
      </div>
    );
  };

  // Show initial loading state
  if (isLoadingStatus) {
    return <div className="settings-loading">Loading skills...</div>;
  }

  return (
    <div className="skillhub-settings">
      <div className="settings-section">
        <div className="settings-section-header">
          <div>
            <h3>SkillHub</h3>
            <p className="settings-description">
              Search the SkillHub registry to discover and install new skills.
            </p>
          </div>
          <div className="settings-section-actions">
            <button
              className="button-secondary button-small"
              onClick={handleRefresh}
              disabled={isRefreshing}
            >
              {isRefreshing ? "Refreshing..." : "Refresh"}
            </button>
            {onClose && (
              <button className="button-secondary button-small" onClick={onClose}>
                Close
              </button>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="settings-alert settings-alert-error">
          <span>{error}</span>
          <button className="button-secondary button-small" onClick={() => setError(null)}>
            Dismiss
          </button>
        </div>
      )}

      <div className="settings-tabs">
        <button
          className={`settings-tab ${activeTab === "installed" ? "active" : ""}`}
          onClick={() => setActiveTab("installed")}
        >
          Installed
        </button>
        <button
          className={`settings-tab ${activeTab === "browse" ? "active" : ""}`}
          onClick={() => setActiveTab("browse")}
        >
          Browse Registry
        </button>
        <button
          className={`settings-tab ${activeTab === "status" ? "active" : ""}`}
          onClick={() => setActiveTab("status")}
        >
          Status
        </button>
      </div>

      <div className="skillhub-tab-content">
        {activeTab === "browse" && renderBrowseTab()}
        {activeTab === "installed" && renderInstalledTab()}
        {activeTab === "status" && renderStatusTab()}
      </div>
    </div>
  );
}
