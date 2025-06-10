const { IMessageDatabase } = require('../lib');

/**
 * Example showing how to parse messages with automatic link generation
 */

async function parseMessagesWithLinks() {
  const db = new IMessageDatabase();

  try {
    const chats = await db.getChats();
    
    if (chats.length === 0) {
      console.log('No chats found');
      return;
    }

    // Example 1: Basic message parsing with links
    console.log('=== Basic Message Parsing with Links ===\n');
    
    const basicMessages = await db.getMessagesFromChat(chats[0].ROWID, 5);
    
    for (const message of basicMessages) {
      // Parse message - link is always included
      const parsed = db.parseMessage(message);
      
      console.log('Message:', parsed.text.substring(0, 50) + '...');
      console.log('Link:', parsed.link);
      console.log('---');
    }
    
    // Example 2: Messages with full chat context
    console.log('\n=== Messages with Chat Context ===\n');
    
    const messagesWithChat = await db.getMessagesWithChatInfo(chats[0].ROWID, 5);
    
    for (const message of messagesWithChat) {
      const parsed = db.parseMessageWithChat(message);
      
      console.log('Message:', parsed.text.substring(0, 50) + '...');
      console.log('Link:', parsed.link);
      console.log('Chat:', message.chat_display_name || message.chat_identifier);
      console.log('Type:', message.chat_identifier?.startsWith('chat') ? 'Group' : 'Individual');
      console.log('---');
    }
    
    // Example 3: Demonstrating link fallbacks
    console.log('\n=== Link Types and Fallbacks ===\n');
    
    // Find a group chat
    const groupChat = chats.find(c => c.chat_identifier?.startsWith('chat'));
    
    if (groupChat) {
      const groupMessages = await db.getMessagesWithChatInfo(groupChat.ROWID, 1);
      
      if (groupMessages.length > 0) {
        // Simulate message without GUID
        const messageWithoutGuid = { ...groupMessages[0], guid: '' };
        
        console.log('Group chat message WITH guid:');
        console.log('Link:', db.parseMessageWithChat(groupMessages[0]).link);
        
        console.log('\nGroup chat message WITHOUT guid (fallback):');
        console.log('Link:', db.parseMessageWithChat(messageWithoutGuid).link);
      }
    }
    
    // Example 4: Working with the ParsedMessage type
    console.log('\n=== ParsedMessage Structure ===\n');
    
    const sampleMessage = basicMessages[0];
    const fullParsed = db.parseMessage(sampleMessage);
    
    console.log('ParsedMessage object:');
    console.log(JSON.stringify({
      text: fullParsed.text.substring(0, 100) + '...',
      link: fullParsed.link,
      hasAttributes: !!fullParsed.attributes,
      hasRawData: !!fullParsed.rawData
    }, null, 2));
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await db.close();
  }
}

// Run the example
parseMessagesWithLinks().catch(console.error);