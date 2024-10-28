import { Client, GatewayIntentBits, Collection, TextChannel } from 'discord.js';
import OpenAI from 'openai';
import { Context, Handler } from 'aws-lambda';
import parseDuration from 'parse-duration';

interface InputEvent {
  source_channel_ids: string[];
  target_channel_ids?: string[];
  timeframe?: string;
}

const discordToken = process.env.DISCORD_BOT_TOKEN!;
const openaiApiKey = process.env.OPENAI_API_KEY!;

const client = new Client({ 
  intents: [
    GatewayIntentBits.Guilds, 
    GatewayIntentBits.GuildMessages, 
    GatewayIntentBits.MessageContent
  ]
});

const openai = new OpenAI({
  apiKey: openaiApiKey
});

let isClientReady = false;

client.once('ready', () => {
  console.log(`Logged in as ${client.user?.tag}!`);
  isClientReady = true;
});
client.login(discordToken).catch(console.error);

async function fetchMessages(channelId: string, timeframe: string = '1 day'): Promise<string> {
  const channel = await client.channels.fetch(channelId) as TextChannel;
  const now = new Date();

  const durationMs = parseDuration(timeframe);
  if (!durationMs) {
    throw new Error(`Invalid timeframe: ${timeframe}`);
  }

  const pastTime = new Date(now.getTime() - durationMs);
  let lastMessageId: string | undefined = undefined;
  let allMessages = new Collection<string, Message>();

  while (true) {
    const options: { limit: number; before?: string } = { limit: 100 };
    if (lastMessageId) {
      options.before = lastMessageId;
    }

    const fetchedMessages = await channel.messages.fetch(options);
    if (fetchedMessages.size === 0) {
      break; 
    }

    console.log(`Fetched ${fetchedMessages.size} messages`);

    const recentMessages = fetchedMessages.filter(msg => msg.createdAt >= pastTime);
    allMessages = allMessages.concat(recentMessages);

    console.log(`Total collected messages: ${allMessages.size}`);

    const oldestMessage = fetchedMessages.last();
    if (!oldestMessage || oldestMessage.createdAt < pastTime) {
      break;
    }

    lastMessageId = fetchedMessages.last()?.id;
  }

  if (allMessages.size === 0) {
    return "**No messages to summarize.**";
  }

  // Sort messages by creation time (optional, since Discord fetches are in descending order)
  const sortedMessages = allMessages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);

  const messagesToSummarize = sortedMessages.map(msg => `${msg.author.username}: ${msg.content}`).join('\n');

  return messagesToSummarize;
}

async function getSummary(textToSummarize: string): Promise<string> {
  const prompt = `
You are an advanced AI assistant specializing in analyzing and summarizing complex political discussions from Discord channels. Your task is to provide a highly technical, extremely concise, and professional summary of the issues discussed, focusing solely on factual information and omitting any personal details.

Here is the Discord transcript you need to analyze and summarize:

<discord_transcript>
${textToSummarize}
</discord_transcript>

Please follow these steps to create your summary:

1. Carefully read and analyze the provided transcript.

2. Conduct your analysis inside <analysis> tags, breaking down the text as follows:
   a. Identify the language used in the transcript, and write your analysis in the same language.
   b. List the main topics and issues discussed.
   c. Identify any conclusions, agreements, or significant disagreements.
   d. Extract key technical points, data, or statistics.
   e. Note any unresolved points or areas requiring further discussion.
   f. Identify and list key phrases or terms crucial to understanding the discussion.
   g. Categorize the topics based on their importance or relevance (high, medium, low).
   h. Discard the topics with low importance.
   i. Ensure there are no more than 1-2 topics of high importance.
   j. If there are 5 or more topics of high and medium importance combined, briefly explain the medium importance topics.
   k. If there are no important topics or the message is empty, note this fact.
   l. Critically evaluate your analysis, focusing on how to make each point concise without losing essential information.

3. Based on your analysis, create a summary that adheres to the following guidelines:
   - Write the summary in the same language as the original transcript.
   - Maintain strict objectivity and avoid personal opinions.
   - Use clear, concise, and technical language.
   - Focus on factual information and omit any personal details.
   - Ensure the summary is as condensed as possible while retaining important points.
   - Do not include empty lines as spacers.

4. Format your summary as a numbered list of topics discussed, with each topic having a sublist of relevant points. Use Markdown formatting for the list structure.

5. Review your summary to ensure it meets all requirements before submitting. Remember to use the same language as the original text and maintain a professional tone throughout.

Begin your response with your analysis in <analysis> tags, followed by the final summary in the format shown above.
`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.1,
    max_tokens: 2000,
  });

  const completion = response.choices[0].message.content;
  console.debug("Completion:", completion);

  if (!completion) {
    throw new Error('No summary was generated.');
  }

  const summary = completion.replace(/<analysis>[\s\S]*?<\/analysis>/i, '');

  return summary.trim();
}

export const handler: Handler<InputEvent, string> = async (event: InputEvent): Promise<string> => {
  console.log("Event:", event);

  const sourceChannelIds = event.source_channel_ids;
  const targetChannelIds = event.target_channel_ids || sourceChannelIds;
  const timeframe = event.timeframe;

  if (!isClientReady) {
    await new Promise((resolve, reject) => {
      client.once('ready', resolve);
      client.once('error', reject);
    });
  }

  try {
    for (let i = 0; i < sourceChannelIds.length; i++) {
      const sourceChannelId = sourceChannelIds[i];
      const targetChannelId = targetChannelIds[i];

      const messagesToSummarize = await fetchMessages(sourceChannelId, timeframe);
      console.log("messagesToSummarize:", messagesToSummarize);

      const summary = await getSummary(messagesToSummarize);
      console.log("Summary:", summary);
    
      if (summary.length >= 2000) {
        throw new Error("Summary is too long.");
      }

      const targetChannel = await client.channels.fetch(targetChannelId) as TextChannel;
      await targetChannel.send(summary);

      console.log("Summary sent to the channel.", sourceChannelId, targetChannelId, summary);
    }

    return 'Summary sent to the channels.';
  } catch (error) {
    console.error("Handler error:", error);
    throw new Error('Failed to summarize messages.');
  }
};
