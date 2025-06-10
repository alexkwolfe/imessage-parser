#!/usr/bin/env node

/**
 * Example: Extract messages with full formatting information
 * Shows how to access bold, italic, links, mentions, and other attributes
 */

const { IMessageDatabase } = require('../lib');

async function extractFormattedMessages(chatName = 'Fam') {
  console.log(`\nExtracting formatted messages from "${chatName}"...\n`);

  const db = new IMessageDatabase(undefined, {
    includeMetadata: true,
    preserveFormatting: true,
  });

  try {
    // Find the chat
    const chats = await db.getChats();
    const chat = chats.find(c => 
      c.display_name === chatName || 
      c.chat_identifier.includes(chatName)
    );

    if (!chat) {
      console.error(`Chat "${chatName}" not found`);
      return;
    }

    // Get recent messages with attributedBody
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - 6);
    
    const messages = await db.getAttributedMessagesInRange(
      startDate,
      new Date(),
      chatName
    );

    console.log(`Found ${messages.length} messages with formatting\n`);

    // Analyze formatting
    let linksFound = 0;
    let mentionsFound = 0;
    let boldCount = 0;
    let dataDetectorsFound = 0;

    messages.forEach(msg => {
      const parsed = db.parseMessage(msg);
      
      if (parsed.attributes) {
        if (parsed.attributes.links?.length) {
          linksFound += parsed.attributes.links.length;
          
          console.log('📎 Found links:');
          parsed.attributes.links.forEach(link => {
            console.log(`   - ${link.url}`);
            const linkText = parsed.text.substring(link.location, link.location + link.length);
            console.log(`     Text: "${linkText}"`);
          });
          console.log();
        }

        if (parsed.attributes.mentions?.length) {
          mentionsFound += parsed.attributes.mentions.length;
          
          console.log('👤 Found mentions:');
          parsed.attributes.mentions.forEach(mention => {
            console.log(`   - ${mention.handle}`);
          });
          console.log();
        }

        if (parsed.attributes.bold?.length) {
          boldCount += parsed.attributes.bold.length;
          
          console.log('🔤 Found bold text:');
          parsed.attributes.bold.forEach(range => {
            const boldText = parsed.text.substring(range.location, range.location + range.length);
            console.log(`   - "${boldText}"`);
          });
          console.log();
        }

        if (parsed.attributes.dataDetectors?.length) {
          dataDetectorsFound += parsed.attributes.dataDetectors.length;
          
          console.log('🔍 Found data detectors:');
          parsed.attributes.dataDetectors.forEach(detector => {
            console.log(`   - Type: ${detector.type}, Value: ${detector.value}`);
          });
          console.log();
        }
      }
    });

    // Summary
    console.log('\n=== Formatting Summary ===');
    console.log(`Total messages with formatting: ${messages.length}`);
    console.log(`Links found: ${linksFound}`);
    console.log(`Mentions found: ${mentionsFound}`);
    console.log(`Bold text segments: ${boldCount}`);
    console.log(`Data detectors: ${dataDetectorsFound}`);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await db.close();
  }
}

// Run the example
const chatName = process.argv[2] || 'Fam';
extractFormattedMessages(chatName).catch(console.error);