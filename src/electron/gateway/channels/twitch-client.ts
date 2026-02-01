/**
 * Twitch Client
 *
 * IRC-based client for Twitch chat communication.
 * Uses WebSocket to connect to Twitch IRC servers.
 *
 * Features:
 * - Real-time chat message receiving
 * - Message sending with rate limiting
 * - Whisper (DM) support
 * - Channel join/leave
 * - User badge parsing
 * - Emote support
 *
 * Requirements:
 * - Twitch username
 * - OAuth token (get from https://twitchtokengenerator.com/ or Twitch dev console)
 * - Channel name(s) to join
 *
 * Rate Limits:
 * - Regular users: 20 messages per 30 seconds
 * - Moderators/VIPs: 100 messages per 30 seconds
 */

import { EventEmitter } from 'events';
import WebSocket from 'ws';

/**
 * Twitch chat message
 */
export interface TwitchMessage {
  /** Message ID */
  id: string;
  /** Channel name (without #) */
  channel: string;
  /** User ID */
  userId: string;
  /** Username (login name) */
  username: string;
  /** Display name */
  displayName: string;
  /** Message content */
  message: string;
  /** Message timestamp */
  timestamp: Date;
  /** Whether this is a whisper (DM) */
  isWhisper: boolean;
  /** User's color */
  color?: string;
  /** User's badges */
  badges: TwitchBadge[];
  /** Emotes in the message */
  emotes: TwitchEmote[];
  /** Whether user is broadcaster */
  isBroadcaster: boolean;
  /** Whether user is moderator */
  isModerator: boolean;
  /** Whether user is subscriber */
  isSubscriber: boolean;
  /** Whether user is VIP */
  isVip: boolean;
  /** Reply thread info */
  replyTo?: {
    messageId: string;
    userId: string;
    username: string;
    message: string;
  };
  /** Raw IRC tags */
  tags: Record<string, string>;
}

export interface TwitchBadge {
  name: string;
  version: string;
}

export interface TwitchEmote {
  id: string;
  name: string;
  start: number;
  end: number;
}

/**
 * Twitch client options
 */
export interface TwitchClientOptions {
  /** Twitch username (login name) */
  username: string;
  /** OAuth token (with oauth: prefix or without) */
  oauthToken: string;
  /** Channels to join (without # prefix) */
  channels: string[];
  /** Enable verbose logging */
  verbose?: boolean;
}

/**
 * Twitch client events
 */
export interface TwitchClientEvents {
  message: (message: TwitchMessage) => void;
  whisper: (message: TwitchMessage) => void;
  join: (channel: string) => void;
  part: (channel: string) => void;
  error: (error: Error) => void;
  connected: () => void;
  disconnected: () => void;
}

/**
 * Twitch IRC Client
 */
export class TwitchClient extends EventEmitter {
  private options: TwitchClientOptions;
  private ws?: WebSocket;
  private connected = false;
  private reconnectTimer?: NodeJS.Timeout;
  private pingTimer?: NodeJS.Timeout;
  private joinedChannels: Set<string> = new Set();

  // Rate limiting
  private messageQueue: Array<{ channel: string; message: string }> = [];
  private messageSentTimestamps: number[] = [];
  private readonly RATE_LIMIT_WINDOW = 30000; // 30 seconds
  private readonly RATE_LIMIT_COUNT = 20; // 20 messages per window
  private rateLimitTimer?: NodeJS.Timeout;

  private readonly IRC_URL = 'wss://irc-ws.chat.twitch.tv:443';

  constructor(options: TwitchClientOptions) {
    super();
    this.options = {
      ...options,
      // Ensure oauth: prefix
      oauthToken: options.oauthToken.startsWith('oauth:')
        ? options.oauthToken
        : `oauth:${options.oauthToken}`,
      // Ensure lowercase channels
      channels: options.channels.map((c) => c.toLowerCase().replace(/^#/, '')),
    };
  }

  /**
   * Check if credentials are valid
   */
  async checkConnection(): Promise<{ success: boolean; username?: string; error?: string }> {
    return new Promise((resolve) => {
      const testWs = new WebSocket(this.IRC_URL);

      const timeout = setTimeout(() => {
        testWs.close();
        resolve({ success: false, error: 'Connection timeout' });
      }, 10000);

      testWs.on('open', () => {
        testWs.send('CAP REQ :twitch.tv/tags twitch.tv/commands');
        testWs.send(`PASS ${this.options.oauthToken}`);
        testWs.send(`NICK ${this.options.username}`);
      });

      testWs.on('message', (data: Buffer) => {
        const message = data.toString();

        // Check for authentication success
        if (message.includes('001') || message.includes(':Welcome')) {
          clearTimeout(timeout);
          testWs.close();
          resolve({ success: true, username: this.options.username });
        }

        // Check for authentication failure
        if (message.includes('NOTICE * :Login authentication failed')) {
          clearTimeout(timeout);
          testWs.close();
          resolve({ success: false, error: 'Invalid OAuth token' });
        }
      });

      testWs.on('error', (error: Error) => {
        clearTimeout(timeout);
        testWs.close();
        resolve({ success: false, error: error.message });
      });
    });
  }

  /**
   * Connect and start receiving messages
   */
  async startReceiving(): Promise<void> {
    if (this.connected) {
      return;
    }

    return new Promise((resolve, reject) => {
      if (this.options.verbose) {
        console.log('Connecting to Twitch IRC...');
      }

      this.ws = new WebSocket(this.IRC_URL);

      this.ws.on('open', () => {
        // Request capabilities for rich message info
        this.ws!.send('CAP REQ :twitch.tv/tags twitch.tv/commands twitch.tv/membership');
        // Authenticate
        this.ws!.send(`PASS ${this.options.oauthToken}`);
        this.ws!.send(`NICK ${this.options.username}`);
      });

      this.ws.on('message', (data: Buffer) => {
        this.handleMessage(data.toString());
      });

      this.ws.on('error', (error: Error) => {
        if (this.options.verbose) {
          console.error('Twitch WebSocket error:', error);
        }
        this.emit('error', error);
        if (!this.connected) {
          reject(error);
        }
      });

      this.ws.on('close', () => {
        this.connected = false;
        this.stopPing();
        this.emit('disconnected');
        this.scheduleReconnect();
      });

      // Wait for successful connection
      const connectionTimeout = setTimeout(() => {
        if (!this.connected) {
          reject(new Error('Connection timeout'));
        }
      }, 15000);

      this.once('connected', () => {
        clearTimeout(connectionTimeout);
        resolve();
      });
    });
  }

  /**
   * Handle incoming IRC message
   */
  private handleMessage(raw: string): void {
    const lines = raw.split('\r\n').filter(Boolean);

    for (const line of lines) {
      // Handle PING
      if (line.startsWith('PING')) {
        this.ws?.send('PONG :tmi.twitch.tv');
        continue;
      }

      // Parse IRC message
      const parsed = this.parseIrcMessage(line);
      if (!parsed) continue;

      switch (parsed.command) {
        case '001': // Welcome - authentication successful
        case '376': // End of MOTD - fully connected
          if (!this.connected) {
            this.connected = true;
            this.startPing();
            this.emit('connected');
            // Join channels
            for (const channel of this.options.channels) {
              this.joinChannel(channel);
            }
          }
          break;

        case 'NOTICE':
          // Check for auth failure
          if (line.includes('Login authentication failed')) {
            this.emit('error', new Error('Login authentication failed'));
          }
          break;

        case 'JOIN':
          if (parsed.prefix?.startsWith(this.options.username)) {
            const channel = parsed.params[0].replace(/^#/, '');
            this.joinedChannels.add(channel);
            this.emit('join', channel);
          }
          break;

        case 'PART':
          if (parsed.prefix?.startsWith(this.options.username)) {
            const channel = parsed.params[0].replace(/^#/, '');
            this.joinedChannels.delete(channel);
            this.emit('part', channel);
          }
          break;

        case 'PRIVMSG':
          this.handlePrivmsg(parsed);
          break;

        case 'WHISPER':
          this.handleWhisper(parsed);
          break;
      }
    }
  }

  /**
   * Parse IRC message into components
   */
  private parseIrcMessage(line: string): {
    tags: Record<string, string>;
    prefix?: string;
    command: string;
    params: string[];
  } | null {
    let position = 0;
    const tags: Record<string, string> = {};

    // Parse tags
    if (line.startsWith('@')) {
      const spaceIndex = line.indexOf(' ');
      const tagString = line.substring(1, spaceIndex);
      position = spaceIndex + 1;

      for (const tag of tagString.split(';')) {
        const [key, value] = tag.split('=');
        tags[key] = value?.replace(/\\s/g, ' ').replace(/\\:/g, ';') || '';
      }
    }

    // Skip any additional spaces
    while (line[position] === ' ') position++;

    // Parse prefix
    let prefix: string | undefined;
    if (line[position] === ':') {
      const spaceIndex = line.indexOf(' ', position);
      prefix = line.substring(position + 1, spaceIndex);
      position = spaceIndex + 1;
    }

    // Skip any additional spaces
    while (line[position] === ' ') position++;

    // Parse command
    const nextSpace = line.indexOf(' ', position);
    const command =
      nextSpace === -1 ? line.substring(position) : line.substring(position, nextSpace);
    position = nextSpace === -1 ? line.length : nextSpace + 1;

    // Parse params
    const params: string[] = [];
    while (position < line.length) {
      // Skip spaces
      while (line[position] === ' ') position++;

      if (position >= line.length) break;

      if (line[position] === ':') {
        // Rest of line is trailing param
        params.push(line.substring(position + 1));
        break;
      } else {
        // Regular param
        const nextSpace = line.indexOf(' ', position);
        if (nextSpace === -1) {
          params.push(line.substring(position));
          break;
        } else {
          params.push(line.substring(position, nextSpace));
          position = nextSpace + 1;
        }
      }
    }

    return { tags, prefix, command, params };
  }

  /**
   * Handle PRIVMSG (channel message)
   */
  private handlePrivmsg(parsed: ReturnType<typeof this.parseIrcMessage>): void {
    if (!parsed) return;

    const channel = parsed.params[0].replace(/^#/, '');
    const messageText = parsed.params[1] || '';
    const tags = parsed.tags;

    // Skip own messages
    if (tags['user-id'] === this.getCurrentUserId()) {
      return;
    }

    const message = this.createTwitchMessage(channel, messageText, tags, false);
    this.emit('message', message);
  }

  /**
   * Handle WHISPER (direct message)
   */
  private handleWhisper(parsed: ReturnType<typeof this.parseIrcMessage>): void {
    if (!parsed) return;

    const messageText = parsed.params[1] || '';
    const tags = parsed.tags;

    const message = this.createTwitchMessage('', messageText, tags, true);
    this.emit('whisper', message);
  }

  /**
   * Create a TwitchMessage object from IRC data
   */
  private createTwitchMessage(
    channel: string,
    messageText: string,
    tags: Record<string, string>,
    isWhisper: boolean
  ): TwitchMessage {
    // Parse badges
    const badges: TwitchBadge[] = [];
    if (tags.badges) {
      for (const badge of tags.badges.split(',')) {
        const [name, version] = badge.split('/');
        if (name && version) {
          badges.push({ name, version });
        }
      }
    }

    // Parse emotes
    const emotes: TwitchEmote[] = [];
    if (tags.emotes) {
      for (const emoteData of tags.emotes.split('/')) {
        const [id, positions] = emoteData.split(':');
        if (id && positions) {
          for (const pos of positions.split(',')) {
            const [start, end] = pos.split('-').map(Number);
            emotes.push({
              id,
              name: messageText.substring(start, end + 1),
              start,
              end,
            });
          }
        }
      }
    }

    // Parse reply info
    let replyTo: TwitchMessage['replyTo'];
    if (tags['reply-parent-msg-id']) {
      replyTo = {
        messageId: tags['reply-parent-msg-id'],
        userId: tags['reply-parent-user-id'] || '',
        username: tags['reply-parent-user-login'] || '',
        message: tags['reply-parent-msg-body'] || '',
      };
    }

    // Check special user states from badges
    const badgeNames = badges.map((b) => b.name);

    return {
      id: tags.id || `${Date.now()}-${Math.random().toString(36).substring(2)}`,
      channel,
      userId: tags['user-id'] || '',
      username: tags.login || tags['display-name']?.toLowerCase() || '',
      displayName: tags['display-name'] || tags.login || '',
      message: messageText,
      timestamp: tags['tmi-sent-ts']
        ? new Date(parseInt(tags['tmi-sent-ts'], 10))
        : new Date(),
      isWhisper,
      color: tags.color || undefined,
      badges,
      emotes,
      isBroadcaster: badgeNames.includes('broadcaster'),
      isModerator: tags.mod === '1' || badgeNames.includes('moderator'),
      isSubscriber: tags.subscriber === '1' || badgeNames.includes('subscriber'),
      isVip: badgeNames.includes('vip'),
      replyTo,
      tags,
    };
  }

  /**
   * Get current user ID (from first message or undefined)
   */
  private getCurrentUserId(): string | undefined {
    // This would need to be set from a self-message or API call
    return undefined;
  }

  /**
   * Start ping interval
   */
  private startPing(): void {
    this.pingTimer = setInterval(() => {
      if (this.ws && this.connected) {
        this.ws.send('PING :tmi.twitch.tv');
      }
    }, 60000); // Ping every minute
  }

  /**
   * Stop ping interval
   */
  private stopPing(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = undefined;
    }
  }

  /**
   * Schedule reconnection
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      return;
    }

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = undefined;
      try {
        await this.startReceiving();
      } catch (error) {
        console.error('Twitch reconnection failed:', error);
        this.scheduleReconnect();
      }
    }, 5000);
  }

  /**
   * Stop receiving messages
   */
  async stopReceiving(): Promise<void> {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }

    if (this.rateLimitTimer) {
      clearTimeout(this.rateLimitTimer);
      this.rateLimitTimer = undefined;
    }

    this.stopPing();

    if (this.ws) {
      this.ws.close();
      this.ws = undefined;
    }

    this.connected = false;
    this.joinedChannels.clear();
    this.emit('disconnected');
  }

  /**
   * Join a channel
   */
  joinChannel(channel: string): void {
    const channelName = channel.toLowerCase().replace(/^#/, '');
    if (this.ws && this.connected) {
      this.ws.send(`JOIN #${channelName}`);
    }
  }

  /**
   * Leave a channel
   */
  leaveChannel(channel: string): void {
    const channelName = channel.toLowerCase().replace(/^#/, '');
    if (this.ws && this.connected) {
      this.ws.send(`PART #${channelName}`);
    }
  }

  /**
   * Send a message to a channel
   */
  async sendMessage(channel: string, message: string, replyTo?: string): Promise<void> {
    if (!this.ws || !this.connected) {
      throw new Error('Not connected to Twitch');
    }

    const channelName = channel.toLowerCase().replace(/^#/, '');

    // Rate limiting
    await this.waitForRateLimit();

    let ircMessage = `PRIVMSG #${channelName} :${message}`;

    // Add reply tag if provided
    if (replyTo) {
      ircMessage = `@reply-parent-msg-id=${replyTo} ${ircMessage}`;
    }

    this.ws.send(ircMessage);
    this.messageSentTimestamps.push(Date.now());
  }

  /**
   * Send a whisper (DM) to a user
   */
  async sendWhisper(username: string, message: string): Promise<void> {
    // Note: Whispers are now sent through the API, not IRC
    // This is included for legacy support but may not work
    if (!this.ws || !this.connected) {
      throw new Error('Not connected to Twitch');
    }

    await this.waitForRateLimit();
    this.ws.send(`PRIVMSG #${this.options.username} :/w ${username} ${message}`);
    this.messageSentTimestamps.push(Date.now());
  }

  /**
   * Wait for rate limit
   */
  private async waitForRateLimit(): Promise<void> {
    // Clean old timestamps
    const now = Date.now();
    this.messageSentTimestamps = this.messageSentTimestamps.filter(
      (ts) => now - ts < this.RATE_LIMIT_WINDOW
    );

    // Check if we need to wait
    if (this.messageSentTimestamps.length >= this.RATE_LIMIT_COUNT) {
      const oldestTimestamp = this.messageSentTimestamps[0];
      const waitTime = this.RATE_LIMIT_WINDOW - (now - oldestTimestamp) + 100;
      if (waitTime > 0) {
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      }
    }
  }

  /**
   * Get joined channels
   */
  getJoinedChannels(): string[] {
    return Array.from(this.joinedChannels);
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Get username
   */
  getUsername(): string {
    return this.options.username;
  }
}
