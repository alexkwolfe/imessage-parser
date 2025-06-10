# iMessage Deep Linking Guide

This guide explains how to create deep links to iMessage conversations and specific messages using the node-imessage-parser library.

## Overview

macOS and iOS support several URL schemes for opening the Messages app to specific conversations or messages. This library provides utilities to generate these links automatically from parsed message data.

## Supported URL Schemes

### 1. SMS URL Scheme (`sms://`)
- **Purpose**: Opens Messages app to a specific conversation
- **Format**: `sms://+15551234567` or `sms://email@example.com`
- **Support**: Works reliably on macOS and iOS
- **No special entitlements required**

### 2. iMessage URL Scheme (`imessage://`)
- **Purpose**: Alternative to `sms://` for opening conversations
- **Format**: `imessage://+15551234567`
- **Support**: Works on macOS and iOS
- **No special entitlements required**

### 3. Messages URL Scheme (`messages://`)
- **Purpose**: Can open specific messages or chats by GUID
- **Format**: `messages://open?guid=<message-or-chat-guid>`
- **Support**: Limited - see Special Entitlements section
- **May require special entitlements**

## Basic Usage

### Getting Message Links in Parse Results

Message links are automatically included in all parse results:

```javascript
const { IMessageDatabase } = require('node-imessage-parser');

const db = new IMessageDatabase();

// Parse message - link is always included
const message = await db.getMessagesFromChat(chatId, 1);
const parsed = db.parseMessage(message[0]);

console.log(parsed);
// {
//   text: "Hello world",
//   link: "messages://open?guid=12345-67890-ABCDEF"
// }

// If the message has no GUID, link will be an empty string
// Use parseMessageWithChat() for better fallback links
```

### Using Message Context for Better Links

For more reliable links that fall back to conversation links when message GUIDs aren't available:

```javascript
// Get messages with full chat context
const messages = await db.getMessagesWithChatInfo(chatId);

// Parse with automatic link selection
const parsed = db.parseMessageWithChat(messages[0]);

console.log(parsed.link);
// Will be one of:
// - "messages://open?guid=<message-guid>" (if message has GUID)
// - "sms://+15551234567" (for individual chats without message GUID)
// - "messages://open?guid=<chat-guid>" (for group chats without message GUID)
```

### Building Custom Links

Use the link builder utilities for more control:

```javascript
const { buildChatLinks, buildMessageLink, buildComposeLink } = require('node-imessage-parser');

// Get all possible links for a chat
const chatLinks = buildChatLinks(chat);
// Returns array of:
// - { url: "sms://+15551234567", type: "sms", description: "..." }
// - { url: "imessage://+15551234567", type: "imessage", description: "..." }
// - { url: "messages://open?guid=...", type: "messages", description: "..." }

// Build link for specific message
const messageLink = buildMessageLink(message);
// Returns: { url: "messages://open?guid=...", type: "messages", description: "..." }

// Build compose link with pre-filled text
const composeLink = buildComposeLink('+15551234567', 'Hello there!');
// Returns: { url: "sms://+15551234567&body=Hello%20there!", type: "sms", description: "..." }
```

## Special Entitlements and Limitations

### Messages URL Scheme (`messages://`)

The `messages://` URL scheme has special requirements:

1. **In Web Browsers**: May not work at all or show security warnings
2. **In Native Apps**: Requires proper entitlements:
   - `com.apple.security.temporary-exception.mach-lookup.global-name`
   - May need to be signed with a Developer ID certificate

3. **In Shortcuts App**: Works without special entitlements
4. **In AppleScript/JXA**: Works when executed locally

### Recommended Approach

For maximum compatibility:

1. **For Opening Conversations**: Use `sms://` or `imessage://`
   - These work reliably without special permissions
   - Supported in all contexts (web, native apps, etc.)

2. **For Specific Messages**: Provide multiple options
   - Primary: `messages://` link (for contexts where it works)
   - Fallback: `sms://` link to open the conversation

## Examples

### Web Application

```html
<!-- Safe approach for web apps -->
<a href="sms://+15551234567">Open Conversation</a>

<!-- With fallback for messages -->
<a href="messages://open?guid=12345" 
   onclick="if(!window.open(this.href)){window.location='sms://+15551234567';}return false;">
   Open Message
</a>
```

### Electron/Native App

```javascript
const { shell } = require('electron');

// Open conversation (always works)
shell.openExternal('sms://+15551234567');

// Try to open specific message
shell.openExternal('messages://open?guid=12345').catch(() => {
  // Fallback to conversation
  shell.openExternal('sms://+15551234567');
});
```

### Shortcuts App

```javascript
// In Shortcuts, messages:// URLs work without restrictions
const shortcutURL = `shortcuts://run-shortcut?name=OpenMessage&input=${encodeURIComponent(messageLink)}`;
```

## Security Considerations

1. **URL Encoding**: Always encode phone numbers and email addresses
   ```javascript
   const encoded = encodeURIComponent('+1 (555) 123-4567');
   const link = `sms://${encoded}`;
   ```

2. **User Consent**: Always inform users before opening external apps
3. **Validation**: Validate phone numbers and emails before creating links
4. **Privacy**: Don't expose message GUIDs in public contexts

## Troubleshooting

### Link Not Working

1. **Check URL encoding**: Special characters must be encoded
2. **Verify GUID exists**: Not all messages have GUIDs
3. **Test URL scheme**: Try `sms://` first as it's most reliable
4. **Check platform**: Some schemes only work on macOS or iOS

### Messages App Not Opening

1. **macOS**: Ensure Messages app is installed and set as default
2. **Permissions**: User may need to approve opening external apps
3. **Context**: Some contexts (like sandboxed apps) may block URL schemes

## Platform-Specific Notes

### macOS
- All URL schemes supported
- Works in Safari, Chrome, and native apps
- May show confirmation dialog

### iOS
- `sms://` and `imessage://` work reliably
- `messages://` may be restricted
- Works in Safari and native apps

### Web Browsers
- `sms://` universally supported
- `imessage://` works on Apple devices
- `messages://` often blocked for security