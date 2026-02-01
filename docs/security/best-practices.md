# Security Best Practices

Recommended security practices for CoWork OS deployments.

## Initial Setup

### 1. Use Pairing Mode by Default

Always start with pairing mode for external channels:
- Most secure option
- Users must prove access to desktop app
- Prevents unauthorized access

### 2. Use Dedicated Bot Accounts

Create separate bot accounts for CoWork OS:
- Don't use personal accounts
- Easier to audit and revoke
- Limits blast radius if compromised

### 3. Enable All Guardrails

Keep all guardrails enabled:
- Command blocking prevents dangerous operations
- Budget limits prevent runaway costs
- Iteration limits prevent infinite loops

### 4. Review Tool Permissions

Start with minimal permissions:
- Enable only what you need
- Add permissions as required
- Review periodically

## Ongoing Operations

### 1. Review Approval Requests

Always review approval requests carefully:
- Read the full command/action
- Verify it matches your intent
- Deny suspicious requests

### 2. Monitor Task Activity

Regularly check:
- Active tasks and their status
- Completed tasks and results
- Any unusual patterns

### 3. Audit User Access

Periodically review:
- Who has paired/allowlisted access
- Remove users who no longer need access
- Rotate pairing codes if shared widely

### 4. Keep CoWork OS Updated

Install updates promptly:
- Security fixes
- New features
- Bug fixes

## Channel-Specific Recommendations

### Telegram

- Use pairing mode
- Consider group restrictions
- Monitor bot commands usage

### Discord

- Use application ID verification
- Limit to specific guilds
- Consider server-specific bots

### Slack

- Use signing secret validation
- Restrict to specific workspaces
- Use app-level tokens

### WhatsApp

- Use pairing mode only
- Be cautious with group access
- Consider business API for production

### Microsoft Teams

- Use Azure Bot with proper tenant configuration
- Keep App Password rotated regularly
- Use pairing mode for multi-tenant deployments
- Monitor webhook endpoint access logs

### Google Chat

- Use dedicated service account with minimal permissions
- Restrict to specific Google Workspace organizations
- Review Chat API quotas and rate limits
- Use pairing mode for space-level access control

### iMessage (macOS)

- Only available on macOS with Messages app signed in
- Use pairing mode for external users
- Consider contact allowlist for stricter control
- Monitor imsg CLI access

### Signal

- E2E encrypted - messages are secure in transit
- Use trust-on-first-use (TOFU) carefully
- Keep signal-cli data directory secure
- Use pairing mode for unknown contacts

### Mattermost

- Use personal access token with minimal permissions
- Restrict to specific teams/channels
- Use pairing mode for external users
- Monitor WebSocket connection health

### Matrix

- Verify homeserver security practices
- Consider E2E encryption for sensitive rooms
- Use access token rotation
- Monitor room memberships

### Twitch

- Use OAuth tokens with minimal scopes
- Restrict to channels you moderate
- Disable whispers unless needed
- Monitor chat activity for abuse

### LINE

- Protect Channel Secret and Access Token
- Use webhook signature verification
- Monitor webhook server logs
- Consider rate limiting for high-traffic channels

### BlueBubbles (macOS)

- Secure BlueBubbles server with strong password
- Use local network only if possible
- Use pairing mode for unknown contacts
- Keep BlueBubbles server updated

### Email

- Use app passwords, not main account password
- Consider dedicated email account for bot
- Use subject line filtering to limit access
- Monitor for phishing attempts in responses

## Environment Recommendations

### Development

- Unrestricted file access may be appropriate
- Open mode acceptable for local testing
- Enable debug logging

### Production

- Use pairing or allowlist mode
- Restrict file access to workspace
- Disable debug logging
- Enable all guardrails

### Shared Environments

- Use context policies to restrict groups
- Block memory tools in shared contexts
- Consider Docker sandboxing

## Incident Response

### 1. How to Revoke Access

To immediately revoke a user's access:
1. Go to **Settings > Channels > [Channel] > Users**
2. Find the user
3. Click **Revoke Access**

Or remove from allowlist in channel settings.

### 2. How to Stop a Runaway Task

If a task is misbehaving:
1. Click the task in the UI
2. Click **Cancel Task**
3. Or use the task manager to force-stop

### 3. How to Reset Security

If you suspect compromise:
1. Revoke all channel users
2. Generate new pairing codes
3. Review audit logs
4. Update any leaked credentials

### 4. How to Report Vulnerabilities

If you find a security issue:
1. Do not disclose publicly
2. Email security@cowork.dev
3. Include:
   - Description of the issue
   - Steps to reproduce
   - Potential impact
   - Your contact info

## FAQ

### Q: Is my data sent to external servers?

Only to the configured LLM provider (Anthropic/AWS Bedrock). No data is sent to CoWork OS servers.

### Q: Are my API keys stored securely?

API keys are stored locally in the app data directory. Consider using environment variables for sensitive keys.

### Q: Can other users see my clipboard?

Clipboard tools are blocked by default in group contexts. In DM contexts, only you and the bot can access clipboard content.

### Q: What happens if Docker isn't available?

CoWork OS falls back to process isolation with timeouts. On macOS, native sandbox-exec is preferred.

### Q: How long are pairing codes valid?

Default: 5 minutes (300 seconds). Configurable in channel settings.

### Q: Can I use multiple security modes?

Yes, context policies allow different modes for DMs vs groups on the same channel.

### Q: Are shell commands logged?

Yes, all shell commands and their outputs are logged in the audit trail.

### Q: Can I disable the approval requirement for shell commands?

Shell commands with approval are designed for safety. You can add trusted patterns to auto-approve specific safe commands.

## Security Checklist

### Before First Use

- [ ] Updated to latest version
- [ ] Reviewed default settings
- [ ] Configured workspace permissions
- [ ] Tested pairing flow

### Before Adding External Channels

- [ ] Security mode selected (pairing recommended)
- [ ] Context policies configured
- [ ] Test with limited users first
- [ ] Document who has access

### Regular Maintenance

- [ ] Check for updates
- [ ] Review user access list
- [ ] Check audit logs
- [ ] Test recovery procedures
