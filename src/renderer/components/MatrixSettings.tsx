import { useState, useEffect } from 'react';
import { ChannelData, ChannelUserData, SecurityMode } from '../../shared/types';

interface MatrixSettingsProps {
  onStatusChange?: (connected: boolean) => void;
}

export function MatrixSettings({ onStatusChange }: MatrixSettingsProps) {
  const [channel, setChannel] = useState<ChannelData | null>(null);
  const [users, setUsers] = useState<ChannelUserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; error?: string } | null>(null);

  // Form state
  const [channelName, setChannelName] = useState('Matrix');
  const [securityMode, setSecurityMode] = useState<SecurityMode>('pairing');
  const [homeserver, setHomeserver] = useState('');
  const [userId, setUserId] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [deviceId, setDeviceId] = useState('');
  const [roomIds, setRoomIds] = useState('');

  // Pairing code state
  const [pairingCode, setPairingCode] = useState<string | null>(null);

  useEffect(() => {
    loadChannel();
  }, []);

  const loadChannel = async () => {
    try {
      setLoading(true);
      const channels = await window.electronAPI.getGatewayChannels();
      const matrixChannel = channels.find((c: ChannelData) => c.type === 'matrix');

      if (matrixChannel) {
        setChannel(matrixChannel);
        setChannelName(matrixChannel.name);
        setSecurityMode(matrixChannel.securityMode);
        onStatusChange?.(matrixChannel.status === 'connected');

        // Load config settings
        if (matrixChannel.config) {
          setHomeserver(matrixChannel.config.homeserver as string || '');
          setUserId(matrixChannel.config.userId as string || '');
          setAccessToken(matrixChannel.config.accessToken as string || '');
          setDeviceId(matrixChannel.config.deviceId as string || '');
          const rooms = matrixChannel.config.roomIds as string[] || [];
          setRoomIds(rooms.join(', '));
        }

        // Load users for this channel
        const channelUsers = await window.electronAPI.getGatewayUsers(matrixChannel.id);
        setUsers(channelUsers);
      }
    } catch (error) {
      console.error('Failed to load Matrix channel:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddChannel = async () => {
    if (!homeserver.trim() || !userId.trim() || !accessToken.trim()) {
      setTestResult({ success: false, error: 'Homeserver, User ID, and Access Token are required' });
      return;
    }

    try {
      setSaving(true);
      setTestResult(null);

      const roomIdList = roomIds
        .split(',')
        .map(r => r.trim())
        .filter(Boolean);

      await window.electronAPI.addGatewayChannel({
        type: 'matrix',
        name: channelName,
        securityMode,
        matrixHomeserver: homeserver.trim(),
        matrixUserId: userId.trim(),
        matrixAccessToken: accessToken.trim(),
        matrixDeviceId: deviceId.trim() || undefined,
        matrixRoomIds: roomIdList.length > 0 ? roomIdList : undefined,
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

    if (!confirm('Are you sure you want to remove the Matrix channel?')) {
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
    return <div className="settings-loading">Loading Matrix settings...</div>;
  }

  // No channel configured yet
  if (!channel) {
    return (
      <div className="matrix-settings">
        <div className="settings-section">
          <h3>Connect Matrix</h3>
          <p className="settings-description">
            Connect to a Matrix homeserver to receive and send messages. Matrix is a decentralized, open-source communication protocol.
          </p>

          <div className="settings-callout info">
            <strong>Setup Instructions:</strong>
            <ol style={{ margin: '8px 0 0 0', paddingLeft: '20px' }}>
              <li style={{ marginBottom: '8px' }}>
                <strong>Get your Access Token:</strong><br />
                <span style={{ fontSize: '13px' }}>
                  In Element: Settings &gt; Help &amp; About &gt; Advanced &gt; Access Token
                </span>
              </li>
              <li style={{ marginBottom: '8px' }}>
                <strong>Find your User ID:</strong><br />
                <span style={{ fontSize: '13px' }}>
                  Format: @username:homeserver.org (shown in your profile)
                </span>
              </li>
              <li style={{ marginBottom: '8px' }}>
                <strong>Homeserver URL:</strong><br />
                <span style={{ fontSize: '13px' }}>
                  e.g., https://matrix.org or your self-hosted server
                </span>
              </li>
            </ol>
          </div>

          <div className="settings-field">
            <label>Channel Name</label>
            <input
              type="text"
              className="settings-input"
              placeholder="My Matrix"
              value={channelName}
              onChange={(e) => setChannelName(e.target.value)}
            />
          </div>

          <div className="settings-field">
            <label>Homeserver URL *</label>
            <input
              type="text"
              className="settings-input"
              placeholder="https://matrix.org"
              value={homeserver}
              onChange={(e) => setHomeserver(e.target.value)}
            />
            <p className="settings-hint">
              Your Matrix homeserver URL (include https://)
            </p>
          </div>

          <div className="settings-field">
            <label>User ID *</label>
            <input
              type="text"
              className="settings-input"
              placeholder="@yourname:matrix.org"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
            />
            <p className="settings-hint">
              Your Matrix user ID (e.g., @user:matrix.org)
            </p>
          </div>

          <div className="settings-field">
            <label>Access Token *</label>
            <input
              type="password"
              className="settings-input"
              placeholder="Enter your access token"
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
            />
            <p className="settings-hint">
              Found in Element: Settings &gt; Help &amp; About &gt; Advanced
            </p>
          </div>

          <div className="settings-field">
            <label>Device ID (optional)</label>
            <input
              type="text"
              className="settings-input"
              placeholder="Leave empty to auto-generate"
              value={deviceId}
              onChange={(e) => setDeviceId(e.target.value)}
            />
          </div>

          <div className="settings-field">
            <label>Room IDs (optional)</label>
            <input
              type="text"
              className="settings-input"
              placeholder="!roomid1:matrix.org, !roomid2:matrix.org"
              value={roomIds}
              onChange={(e) => setRoomIds(e.target.value)}
            />
            <p className="settings-hint">
              Comma-separated room IDs to listen to (leave empty for all joined rooms)
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
              Controls who can interact with your bot via Matrix
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
            disabled={saving || !channelName.trim() || !homeserver.trim() || !userId.trim() || !accessToken.trim()}
          >
            {saving ? 'Connecting...' : 'Connect Matrix'}
          </button>
        </div>
      </div>
    );
  }

  // Channel exists - show management UI
  return (
    <div className="matrix-settings">
      <div className="settings-section">
        <h3>Matrix</h3>
        <p className="settings-description">
          Manage your Matrix connection and access settings.
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
              <span className="status-label">User:</span>
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
