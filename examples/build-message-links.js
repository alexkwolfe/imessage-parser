const { IMessageDatabase } = require('../lib');

/**
 * Example showing how to build deep links to iMessage conversations and messages
 */

async function buildMessageLinks() {
  const db = new IMessageDatabase();

  try {
    // Get chats to demonstrate conversation links
    const chats = await db.getChats();
    
    console.log('=== iMessage Deep Links ===\n');
    
    for (const chat of chats.slice(0, 3)) {
      console.log(`Chat: ${chat.display_name || chat.chat_identifier}`);
      
      // Build conversation link
      // The chat_identifier typically contains the phone number or email
      if (chat.chat_identifier) {
        // Extract phone/email from chat_identifier
        // Format is usually like "chat123456789" or "+15551234567" or "email@example.com"
        let recipient = chat.chat_identifier;
        
        // Remove "chat" prefix if present
        if (recipient.startsWith('chat') && /^chat\d+$/.test(recipient)) {
          // This is a group chat, use the GUID instead
          console.log(`  Group Chat Link: messages://open?guid=${chat.guid}`);
        } else {
          // Individual chat - use SMS URL scheme
          console.log(`  Conversation Link: sms://${recipient}`);
          console.log(`  Alternative Link: imessage://${recipient}`);
        }
      }
      
      // Get a few messages from this chat to show message-specific links
      const messages = await db.getMessagesFromChat(chat.ROWID, 3);
      
      for (const message of messages) {
        if (message.text || message.attributedBody) {
          const parsed = db.parseMessage(message);
          const preview = parsed.text.substring(0, 50) + (parsed.text.length > 50 ? '...' : '');
          
          console.log(`\n  Message: "${preview}"`);
          console.log(`    Message GUID: ${message.guid}`);
          console.log(`    Message Link: messages://open?guid=${message.guid}`);
          
          // Note: The messages:// URL scheme with message GUID may require special entitlements
          // or may only work in certain contexts (like Shortcuts app)
        }
      }
      
      console.log('\n---\n');
    }
    
    console.log('Notes:');
    console.log('- sms:// and imessage:// URLs open the Messages app to a conversation');
    console.log('- messages://open?guid=<guid> may require special permissions');
    console.log('- These URLs work in Safari, Shortcuts, and other macOS apps');
    console.log('- For group chats, use the chat GUID rather than chat_identifier');
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await db.close();
  }
}

buildMessageLinks().catch(console.error);