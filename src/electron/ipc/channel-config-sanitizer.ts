import type { Channel } from "../database/repositories";
import { getChannelRegistry } from "../gateway/channel-registry";

export type PublicChannelPayload = Omit<Channel, "config" | "securityConfig"> & {
  securityMode: Channel["securityConfig"]["mode"];
  config?: Record<string, unknown>;
};

const HIDDEN_CONFIG_KEYS =
  /token|secret|password|api[_-]?key|access[_-]?token|refresh[_-]?token|signing[_-]?secret|authorization/i;

const getHiddenKeysRegex = (): RegExp => HIDDEN_CONFIG_KEYS;

export const sanitizeChannelConfig = (
  type: string,
  config: unknown,
): Record<string, unknown> | undefined => {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return undefined;
  }

  const channelMetadata = getChannelRegistry().getMetadata(type);
  const schema = channelMetadata?.configSchema;
  const secretKeys = new Set<string>();
  const hiddenKeys = getHiddenKeysRegex();

  if (schema?.properties) {
    for (const [key, property] of Object.entries(schema.properties)) {
      if ((property as { secret?: boolean })?.secret) {
        secretKeys.add(key);
      }
    }
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(config as Record<string, unknown>)) {
    if (secretKeys.has(key)) {
      continue;
    }
    if (hiddenKeys.test(key)) {
      continue;
    }
    sanitized[key] = value;
  }

  return sanitized;
};

export const toPublicChannel = (
  channel: Channel,
  statusOverride?: Channel["status"],
): PublicChannelPayload => ({
  id: channel.id,
  type: channel.type,
  name: channel.name,
  enabled: channel.enabled,
  status: statusOverride ?? channel.status,
  botUsername: channel.botUsername,
  securityMode: channel.securityConfig?.mode,
  createdAt: channel.createdAt,
  updatedAt: channel.updatedAt,
  config: sanitizeChannelConfig(channel.type, channel.config),
});
