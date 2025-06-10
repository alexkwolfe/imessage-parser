#!/usr/bin/env node

/**
 * Example: Extract all questions from a specific chat
 * This demonstrates how to use the node-imessage-parser library
 * to find and extract formatted messages from iMessage
 */

const { IMessageDatabase } = require('../lib');

async function extractQuestions(chatName = 'Fam') {
  console.log(`Searching for questions in "${chatName}" chat...\n`);

  const db = new IMessageDatabase();

  try {
    // Find the chat
    const chats = await db.getChats();
    const targetChat = chats.find(chat => 
      chat.display_name === chatName || 
      chat.chat_identifier.includes(chatName)
    );

    if (!targetChat) {
      console.error(`Chat "${chatName}" not found`);
      console.log('\nAvailable chats:');
      chats.forEach(chat => {
        if (chat.display_name) {
          console.log(`  - ${chat.display_name}`);
        }
      });
      return;
    }

    console.log(`Found chat: ${targetChat.display_name || targetChat.chat_identifier}`);
    console.log(`Chat ID: ${targetChat.ROWID}\n`);

    // Get recent messages
    const messages = await db.getMessagesFromChat(targetChat.ROWID, 500);
    console.log(`Analyzing ${messages.length} recent messages...\n`);

    const questions = [];

    for (const message of messages) {
      const parsed = db.parseMessage(message);
      
      // Look for questions
      if (parsed.text && 
          (parsed.text.includes('?') || 
           parsed.text.toLowerCase().includes('question'))) {
        
        const date = new Date((message.date / 1000000000) + 978307200000);
        
        questions.push({
          date: date.toLocaleString(),
          from: message.is_from_me ? 'Me' : message.handle_id,
          text: parsed.text,
          hasAttributedBody: !!message.attributedBody,
        });
      }
    }

    console.log(`Found ${questions.length} messages with questions:\n`);

    // Display questions
    questions.reverse().forEach((q, index) => {
      console.log(`${index + 1}. [${q.date}] ${q.from}:`);
      console.log(`   ${q.hasAttributedBody ? '[Formatted] ' : ''}${q.text.substring(0, 100)}${q.text.length > 100 ? '...' : ''}`);
      console.log();
    });

    // Extract detailed formatted messages
    console.log('\n--- Full Formatted Questions ---\n');

    const formattedQuestions = questions.filter(q => q.hasAttributedBody);
    formattedQuestions.forEach((q, index) => {
      console.log(`Question ${index + 1}:`);
      console.log(`Date: ${q.date}`);
      console.log(`From: ${q.from}`);
      console.log('\nContent:');
      console.log(q.text);
      console.log('\n---\n');
    });

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await db.close();
  }
}

// Run with command line argument or default to 'Fam'
const chatName = process.argv[2] || 'Fam';
extractQuestions(chatName).catch(console.error);