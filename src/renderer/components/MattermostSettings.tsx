import { useState, useEffect } from 'react';
import { ChannelData, ChannelUserData, SecurityMode } from '../../shared/types';

interface MattermostSettingsProps {
  onStatusChange?: (connected: boolean) => void;
}

export function MattermostSettings({ onStatusChange }: MattermostSettingsProps) {
  const [channel, setChannel] = useState<ChannelData | null>(null);
  const [users, setUsers] = useState<ChannelUserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; error?: string } | null>(null);

  // Form state
  const [channelName, setChannelName] = useState('Mattermost');
  const [securityMode, setSecurityMode] = useState<SecurityMode>('pairing');
  const [serverUrl, setServerUrl] = useState('');
  const [token, setToken] = useState('');
  const [teamId, setTeamId] = useState('');

  // Pairing code state
  const [pairingCode, setPairingCode] = useState<string | null>(null);

  useEffect(() => {
    loadChannel();
  }, []);

  const loadChannel = async () => {
    try {
      setLoading(true);
      const channels = await window.electronAPI.getGatewayChannels();
      const mattermostChannel = channels.find((c: ChannelData) => c.type === 'mattermost');

      if (mattermostChannel) {
        setChannel(mattermostChannel);
        setChannelName(mattermostChannel.name);
        setSecurityMode(mattermostChannel.securityMode);
        onStatusChange?.(mattermostChannel.status === 'connected');

        // Load config settings
        if (mattermostChannel.config) {
          setServerUrl(mattermostChannel.config.serverUrl as string || '');
          setToken(mattermostChannel.config.token as string || '');
          setTeamId(mattermostChannel.config.teamId as string || '');
        }

        // Load users for this channel
        const channelUsers = await window.electronAPI.getGatewayUsers(mattermostChannel.id);
        setUsers(channelUsers);
      }
    } catch (error) {
      console.error('Failed to load Mattermost channel:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddChannel = async () => {
    if (!serverUrl.trim() || !token.trim()) {
      setTestResult({ success: false, error: 'Server URL and access token are required' });
      return;
    }

    try {
      setSaving(true);
      setTestResult(null);

      await window.electronAPI.addGatewayChannel({
        type: 'mattermost',
        name: channelName,
        securityMode,
        mattermostServerUrl: serverUrl.trim(),
        mattermostToken: token.trim(),
        mattermostTeamId: teamId.trim() || undefined,
      });

      await loadChannel();
    } catch (error: any) {
      setTestResult({ success: false, error: error.message });
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    if (!channel) return;

    try {
      setTesting(true);
      setTestResult(null);

      const result = await window.electronAPI.testGatewayChannel(channel.id);
      setTestResult(result);
    } catch (error: any) {
      setTestResult({ success: false, error: error.message });
    } finally {
      setTesting(false);
    }
  };

  const handleToggleEnabled = async () => {
    if (!channel) return;

    try {
      setSaving(true);
      if (channel.enabled) {
        await window.electronAPI.disableGatewayChannel(channel.id);
      } else {
        await window.electronAPI.enableGatewayChannel(channel.id);
      }
      await loadChannel();
    } catch (error: any) {
      setTestResult({ success: false, error: error.message });
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveChannel = async () => {
    if (!channel) return;

    if (!confirm('Are you sure you want to remove the Mattermost channel?')) {
      return;
    }

    try {
      setSaving(true);
      await window.electronAPI.removeGatewayChannel(channel.id);
      setChannel(null);
      setUsers([]);
      onStatusChange?.(false);
    } catch (error: any) {
      setTestResult({ success: false, error: error.message });
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateSecurityMode = async (newMode: SecurityMode) => {
    if (!channel) return;

    try {
      await window.electronAPI.updateGatewayChannel({
        id: channel.id,
        securityMode: newMode,
      });
      setSecurityMode(newMode);
      setChannel({ ...channel, securityMode: newMode });
    } catch (error: any) {
      console.error('Failed to update security mode:', error);
    }
  };

  const handleGeneratePairingCode = async () => {
    if (!channel) return;

    try {
      const code = await window.electronAPI.generateGatewayPairing(channel.id, '');
      setPairingCode(code);
    } catch (error: any) {
      console.error('Failed to generate pairing code:', error);
    }
  };

  const handleRevokeAccess = async (userId: string) => {
    if (!channel) return;

    try {
      await window.electronAPI.revokeGatewayAccess(channel.id, userId);
      await loadChannel();
    } catch (error: any) {
      console.error('Failed to revoke access:', error);
    }
  };

  if (loading) {
    return <div className="settings-loading">Loading Mattermost settings...</div>;
  }

  // No channel configured yet
  if (!channel) {
    return (
      <div className="mattermost-settings">
        <div className="settings-section">
          <h3>Connect Mattermost</h3>
          <p className="settings-description">
            Connect to your Mattermost server to receive and send messages. Supports both self-hosted and cloud instances.
          </p>

          <div className="settings-callout info">
            <strong>Setup Instructions:</strong>
            <ol style={{ margin: '8px 0 0 0', paddingLeft: '20px' }}>
              <li style={{ marginBottom: '8px' }}>
                <strong>Get your Personal Access Token:</strong><br />
                <span style={{ fontSize: '13px' }}>
                  Go to Account Settings &gt; Security &gt; Personal Access Tokens in Mattermost
                </span>
              </li>
              <li style={{ marginBottom: '8px' }}>
                <strong>Enter your server URL:</strong><br />
                <span style={{ fontSize: '13px' }}>
                  e.g., https://your-team.mattermost.com
                </span>
              </li>
            </ol>
          </div>

          <div className="settings-field">
            <label>Channel Name</label>
            <input
              type="text"
              className="settings-input"
              placeholder="My Mattermost"
              value={channelName}
              onChange={(e) => setChannelName(e.target.value)}
            />
          </div>

          <div className="settings-field">
            <label>Server URL *</label>
            <input
              type="text"
              className="settings-input"
              placeholder="https://your-team.mattermost.com"
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
            />
            <p className="settings-hint">
              Your Mattermost server URL (include https://)
            </p>
          </div>

          <div className="settings-field">
            <label>Personal Access Token *</label>
            <input
              type="password"
              className="settings-input"
              placeholder="Enter your access token"
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
            <p className="settings-hint">
              Generate a token in Account Settings &gt; Security
            </p>
          </div>

          <div className="settings-field">
            <label>Team ID (optional)</label>
            <input
              type="text"
              className="settings-input"
              placeholder="Leave empty to use default team"
              value={teamId}
              onChange={(e) => setTeamId(e.target.value)}
            />
            <p className="settings-hint">
              Specific team to operate in (optional)
            </p>
          </div>

          <div className="settings-field">
            <label>Security Mode</label>
            <select
              className="settings-select"
              value={securityMode}
              onChange={(e) => setSecurityMode(e.target.value as SecurityMode)}
            >
              <option value="open">Open (anyone can message)</option>
              <option value="allowlist">Allowlist (specific users only)</option>
              <option value="pairing">Pairing (require code to connect)</option>
            </select>
            <p className="settings-hint">
              Controls who can interact with your bot via Mattermost
            </p>
          </div>

          {testResult && (
            <div className={`settings-callout ${testResult.success ? 'success' : 'error'}`}>
              {testResult.success ? 'Connection successful!' : testResult.error}
            </div>
          )}

          <button
            className="settings-button primary"
            onClick={handleAddChannel}
            disabled={saving || !channelName.trim() || !serverUrl.trim() || !token.trim()}
          >
            {saving ? 'Connecting...' : 'Connect Mattermost'}
          </button>
        </div>
      </div>
    );
  }

  // Channel exists - show management UI
  return (
    <div className="mattermost-settings">
      <div className="settings-section">
        <h3>Mattermost</h3>
        <p className="settings-description">
          Manage your Mattermost connection and access settings.
        </p>

        <div className="settings-status">
          <div className="status-row">
            <span className="status-label">Status:</span>
            <span className={`status-value status-${channel.status}`}>
              {channel.status === 'connected' ? 'Connected' :
               channel.status === 'connecting' ? 'Connecting...' :
               channel.status === 'error' ? 'Error' : 'Disconnected'}
            </span>
          </div>
          {channel.botUsername && (
            <div className="status-row">
              <span className="status-label">Username:</span>
              <span className="status-value">{channel.botUsername}</span>
            </div>
          )}
        </div>

        <div className="settings-actions">
          <button
            className={`settings-button ${channel.enabled ? 'danger' : 'primary'}`}
            onClick={handleToggleEnabled}
            disabled={saving}
          >
            {saving ? 'Updating...' : channel.enabled ? 'Disable' : 'Enable'}
          </button>

          <button
            className="settings-button"
            onClick={handleTestConnection}
            disabled={testing || !channel.enabled}
          >
            {testing ? 'Testing...' : 'Test Connection'}
          </button>

          <button
            className="settings-button danger"
            onClick={handleRemoveChannel}
            disabled={saving}
          >
            Remove Channel
          </button>
        </div>

        {testResult && (
          <div className={`settings-callout ${testResult.success ? 'success' : 'error'}`}>
            {testResult.success ? 'Connection test successful!' : testResult.error}
          </div>
        )}
      </div>

      <div className="settings-section">
        <h4>Security Settings</h4>

        <div className="settings-field">
          <label>Security Mode</label>
          <select
            className="settings-select"
            value={securityMode}
            onChange={(e) => handleUpdateSecurityMode(e.target.value as SecurityMode)}
          >
            <option value="open">Open (anyone can message)</option>
            <option value="allowlist">Allowlist (specific users only)</option>
            <option value="pairing">Pairing (require code to connect)</option>
          </select>
        </div>

        {securityMode === 'pairing' && (
          <div className="settings-field">
            <label>Pairing Code</label>
            {pairingCode ? (
              <div className="pairing-code">
                <code>{pairingCode}</code>
                <p className="settings-hint">
                  Share this code with users who want to connect. It expires in 5 minutes.
                </p>
              </div>
            ) : (
              <button
                className="settings-button"
                onClick={handleGeneratePairingCode}
              >
                Generate Pairing Code
              </button>
            )}
          </div>
        )}
      </div>

      {users.length > 0 && (
        <div className="settings-section">
          <h4>Authorized Users</h4>
          <div className="users-list">
            {users.map((user) => (
              <div key={user.id} className="user-item">
                <div className="user-info">
                  <span className="user-name">{user.displayName}</span>
                  <span className="user-id">{user.channelUserId}</span>
                </div>
                <button
                  className="settings-button small danger"
                  onClick={() => handleRevokeAccess(user.channelUserId)}
                >
                  Revoke
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
