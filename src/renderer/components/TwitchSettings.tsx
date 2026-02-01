import { useState, useEffect } from 'react';
import { ChannelData, ChannelUserData, SecurityMode } from '../../shared/types';

interface TwitchSettingsProps {
  onStatusChange?: (connected: boolean) => void;
}

export function TwitchSettings({ onStatusChange }: TwitchSettingsProps) {
  const [channel, setChannel] = useState<ChannelData | null>(null);
  const [users, setUsers] = useState<ChannelUserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; error?: string } | null>(null);

  // Form state
  const [channelName, setChannelName] = useState('Twitch');
  const [securityMode, setSecurityMode] = useState<SecurityMode>('pairing');
  const [username, setUsername] = useState('');
  const [oauthToken, setOauthToken] = useState('');
  const [twitchChannels, setTwitchChannels] = useState('');
  const [allowWhispers, setAllowWhispers] = useState(false);

  // Pairing code state
  const [pairingCode, setPairingCode] = useState<string | null>(null);

  useEffect(() => {
    loadChannel();
  }, []);

  const loadChannel = async () => {
    try {
      setLoading(true);
      const channels = await window.electronAPI.getGatewayChannels();
      const twitchChannel = channels.find((c: ChannelData) => c.type === 'twitch');

      if (twitchChannel) {
        setChannel(twitchChannel);
        setChannelName(twitchChannel.name);
        setSecurityMode(twitchChannel.securityMode);
        onStatusChange?.(twitchChannel.status === 'connected');

        // Load config settings
        if (twitchChannel.config) {
          setUsername(twitchChannel.config.username as string || '');
          setOauthToken(twitchChannel.config.oauthToken as string || '');
          const chans = twitchChannel.config.channels as string[] || [];
          setTwitchChannels(chans.join(', '));
          setAllowWhispers(twitchChannel.config.allowWhispers as boolean || false);
        }

        // Load users for this channel
        const channelUsers = await window.electronAPI.getGatewayUsers(twitchChannel.id);
        setUsers(channelUsers);
      }
    } catch (error) {
      console.error('Failed to load Twitch channel:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddChannel = async () => {
    if (!username.trim() || !oauthToken.trim() || !twitchChannels.trim()) {
      setTestResult({ success: false, error: 'Username, OAuth token, and at least one channel are required' });
      return;
    }

    try {
      setSaving(true);
      setTestResult(null);

      const channelList = twitchChannels
        .split(',')
        .map(c => c.trim().toLowerCase().replace(/^#/, ''))
        .filter(Boolean);

      if (channelList.length === 0) {
        setTestResult({ success: false, error: 'At least one Twitch channel is required' });
        setSaving(false);
        return;
      }

      await window.electronAPI.addGatewayChannel({
        type: 'twitch',
        name: channelName,
        securityMode,
        twitchUsername: username.trim().toLowerCase(),
        twitchOauthToken: oauthToken.trim(),
        twitchChannels: channelList,
        twitchAllowWhispers: allowWhispers,
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

    if (!confirm('Are you sure you want to remove the Twitch channel?')) {
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

  const handleRevokeAccess = async (channelUserId: string) => {
    if (!channel) return;

    try {
      await window.electronAPI.revokeGatewayAccess(channel.id, channelUserId);
      await loadChannel();
    } catch (error: any) {
      console.error('Failed to revoke access:', error);
    }
  };

  if (loading) {
    return <div className="settings-loading">Loading Twitch settings...</div>;
  }

  // No channel configured yet
  if (!channel) {
    return (
      <div className="twitch-settings">
        <div className="settings-section">
          <h3>Connect Twitch</h3>
          <p className="settings-description">
            Connect to Twitch chat to receive and send messages in channels. Great for stream interactions and chat commands.
          </p>

          <div className="settings-callout info">
            <strong>Setup Instructions:</strong>
            <ol style={{ margin: '8px 0 0 0', paddingLeft: '20px' }}>
              <li style={{ marginBottom: '8px' }}>
                <strong>Get an OAuth Token:</strong><br />
                <span style={{ fontSize: '13px' }}>
                  Visit <a href="https://twitchtokengenerator.com/" target="_blank" rel="noopener noreferrer">twitchtokengenerator.com</a> and generate a Chat Bot token
                </span>
              </li>
              <li style={{ marginBottom: '8px' }}>
                <strong>Enter your Twitch username:</strong><br />
                <span style={{ fontSize: '13px' }}>
                  The account that will send/receive messages
                </span>
              </li>
              <li style={{ marginBottom: '8px' }}>
                <strong>Specify channels to join:</strong><br />
                <span style={{ fontSize: '13px' }}>
                  Enter channel names (without #) to monitor
                </span>
              </li>
            </ol>
          </div>

          <div className="settings-field">
            <label>Channel Name</label>
            <input
              type="text"
              className="settings-input"
              placeholder="My Twitch Bot"
              value={channelName}
              onChange={(e) => setChannelName(e.target.value)}
            />
          </div>

          <div className="settings-field">
            <label>Twitch Username *</label>
            <input
              type="text"
              className="settings-input"
              placeholder="your_twitch_username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
            <p className="settings-hint">
              Your Twitch login name (the account that will send messages)
            </p>
          </div>

          <div className="settings-field">
            <label>OAuth Token *</label>
            <input
              type="password"
              className="settings-input"
              placeholder="oauth:xxxxxxxxxxxxxxx"
              value={oauthToken}
              onChange={(e) => setOauthToken(e.target.value)}
            />
            <p className="settings-hint">
              Get a token from <a href="https://twitchtokengenerator.com/" target="_blank" rel="noopener noreferrer">twitchtokengenerator.com</a>
            </p>
          </div>

          <div className="settings-field">
            <label>Twitch Channels *</label>
            <input
              type="text"
              className="settings-input"
              placeholder="channel1, channel2, channel3"
              value={twitchChannels}
              onChange={(e) => setTwitchChannels(e.target.value)}
            />
            <p className="settings-hint">
              Comma-separated channel names to join (without #)
            </p>
          </div>

          <div className="settings-field">
            <label className="settings-checkbox-label">
              <input
                type="checkbox"
                checked={allowWhispers}
                onChange={(e) => setAllowWhispers(e.target.checked)}
              />
              <span>Allow Whispers (DMs)</span>
            </label>
            <p className="settings-hint">
              Enable receiving and responding to Twitch whispers
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
              Controls who can interact with your bot via Twitch
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
            disabled={saving || !channelName.trim() || !username.trim() || !oauthToken.trim() || !twitchChannels.trim()}
          >
            {saving ? 'Connecting...' : 'Connect Twitch'}
          </button>
        </div>

        <div className="settings-section">
          <h4>Twitch Limitations</h4>
          <ul style={{ margin: '8px 0', paddingLeft: '20px', fontSize: '13px' }}>
            <li>Rate limited to 20 messages per 30 seconds</li>
            <li>No file/image attachments (text only)</li>
            <li>Messages limited to 500 characters</li>
            <li>Whispers may require verified accounts</li>
          </ul>
        </div>
      </div>
    );
  }

  // Channel exists - show management UI
  return (
    <div className="twitch-settings">
      <div className="settings-section">
        <h3>Twitch</h3>
        <p className="settings-description">
          Manage your Twitch connection and access settings.
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
          {(() => {
            const channels = channel.config?.channels;
            if (channels && Array.isArray(channels)) {
              return (
                <div className="status-row">
                  <span className="status-label">Channels:</span>
                  <span className="status-value">{(channels as string[]).join(', ')}</span>
                </div>
              );
            }
            return null;
          })()}
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
