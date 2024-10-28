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

async function getSummary(textToSummarize: string, channelId: string, timeframe: string, locale: string): Promise<string> {
  const prompt = `
You are an advanced AI assistant specializing in analyzing and summarizing complex political discussions from Discord channels. Your task is to provide a highly technical, extremely concise, and professional summary of the issues discussed, focusing solely on factual information and omitting any personal details.

Here is the information you need to analyze:

<discord_transcript>
${textToSummarize}
</discord_transcript>

<channel_id>
<#${channelId}>
</channel_id>

<timeframe>
${timeframe}
</timeframe>

<datetime>
${new Date().toISOString()}
</datetime>

<locale>
${locale}
</locale>

Please follow these steps to create your summary:

1. Read and analyze the provided transcript.

2. Use only the language specified in <locale> for the analysis and the summary.

3. Wrap your analysis in <analysis> tags, addressing the following points (using the same language as the original transcript):
   a. List the main topics and issues discussed.
   b. Write down relevant points from the transcript to support main topics.
   c. Identify any conclusions, agreements, or significant disagreements.
   d. Extract key technical points, data, or statistics.
   e. Discard any messages that are "outdated" respect to the current <datetime>, for example meetings that took place before the current date.
   f. Note any unresolved points or areas requiring further discussion.
   g. Identify and list key phrases or terms crucial to understanding the discussion.
   h. Analyze the tone and level of engagement in the conversation.
   i. Count and categorize the topics based on their importance or relevance (high, medium, low).
   j. Ensure there are no more than 2 topics of high importance.
   k. If there are 3 or more topics of high and medium importance combined, briefly explain the medium importance topics.
   l. Discard the topics with low importance, or medium importance if there are more than a total of 4 topics.
   m. If there are no important topics or there are no messages, note this fact.
   n. Critically evaluate your analysis, focusing on how to make each point concise without losing essential information.

4. Based on your analysis, create a summary that adheres to the following guidelines:
   - Write the summary in the same language as the original transcript.
   - Maintain strict objectivity and avoid personal opinions.
   - Use clear, concise, and technical language.
   - Focus on factual information and omit any personal details.
   - Ensure the summary is as condensed as possible while retaining important points.
   - Use Markdown formatting.

5. Format your summary as follows:
   a. Start with a title using the channel name and timeframe. For example: "Summary of the last [timeframe] in [channel_id]".
   b. Present the content as a numbered list of topics discussed, with each topic having a sublist of relevant points. Use Markdown formatting for the list structure.

Here's an example of the desired output format (replace with actual content, using the same language as the original transcript):

# Summary of the last [timeframe] in [channel_id]
1. **[Topic 1]** 
   - ...
   - ...
   - ...
2. **[Topic 2]**
   - ...
   - ...
3. **[Topic 3]**
   - ...
   - ...

5. Review your summary to ensure it meets all requirements before submitting. Remember to use the same language as the original text and maintain a professional tone throughout.

6. If the language of the summary is not the same as the <locale>, translate the summary to the correct language.

Begin your response with your analysis in <analysis> tags, followed by the final summary in the format shown above.
`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.1,
    max_tokens: 1500,
  });

  const completion = response.choices[0].message.content;
  console.debug("Completion:", completion);

  if (!completion) {
    throw new Error('No summary was generated.');
  }

  const summary = completion.replace(/<analysis>[\s\S]*?<\/analysis>/i, '');

  return summary.trim().replace(/\n\n/g, '\n');
}

async function formatSummary(summary: string, locale: string): Promise<string> {
  const prompt = `
You are tasked with improving the readability and flow of a given summary using markdown formatting. Your goal is to enhance the presentation without altering the content. Follow these steps carefully:

1. Here is the summary you will be working with:
<summary>
${summary}
</summary>

<locale>
${locale}
</locale>

2. Language Check:
   - Translate all content to match the <locale>, if necessary.

3. Apply Markdown Formatting:
   - Use headers (# for main title, ## for subtitles) to structure the content hierarchically.
   - Utilize bold (**text**) and italic (*text*) formatting to emphasize key points or important terms.
   - Create bullet points or numbered lists for any series of items or steps. By default indent the list items with 2 spaces. Use sub-sub list only if really needed.
   - For any code snippets or technical terms, use inline code formatting (\`code\`).

4. Content Integrity:
   - Do not add, remove, or change any information from the original summary.
   - Ensure all facts, figures, and key points remain intact.
   - Maintain the original order of information unless a minor reordering significantly improves readability without changing the meaning.

5. Final Check:
   - Review your formatted version to ensure it enhances readability without altering the content.
   - Verify that the language is consistent throughout, including the title.

Provide your formatted summary within <formatted_summary> tags. Use markdown syntax within these tags.
`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.1,
    max_tokens: 1000,
  });

  const completion = response.choices[0].message.content;
  console.debug("Completion:", completion);

  if (!completion) {
    throw new Error('No summary was generated.');
  }

  const match = completion.match(/<formatted_summary>([\s\S]*?)<\/formatted_summary>/);

  if (!match || !match[1]) {
    throw new Error('Formatted summary tags not found.');
  }

  const formattedSummary = match[1];

  return formattedSummary.trim().replace(/\n\n/g, '\n');
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

      const targetChannel = await client.channels.fetch(targetChannelId) as TextChannel;
      const locale = targetChannel.guild.preferredLocale.toString();
      const summary = await getSummary(messagesToSummarize, sourceChannelId, timeframe, locale);
      console.log("Summary:", summary);

      const formattedSummary = await formatSummary(summary, locale);
      console.log("Formatted summary:", formattedSummary);
    
      if (formattedSummary.length >= 2000) {
        throw new Error("Summary is too long.");
      }

      await targetChannel.send(formattedSummary);

      console.log("Summary sent to the channel.", sourceChannelId, targetChannelId);
    }

    return 'Summary sent to the channels.';
  } catch (error) {
    console.error("Handler error:", error);
    throw new Error('Failed to summarize messages.');
  }
};
