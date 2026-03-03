import Anthropic from '@anthropic-ai/sdk';

export type ToolInput = Record<string, unknown>;
export type ToolHandler = (input: ToolInput) => Promise<string>;

export interface AgentTool {
  definition: Anthropic.Tool;
  handler: ToolHandler;
}

export async function runAgent(options: {
  system: string;
  prompt: string;
  tools: AgentTool[];
  model?: string;
  maxIterations?: number;
}): Promise<string> {
  const {
    system,
    prompt,
    tools,
    model = 'claude-sonnet-4-6',
    maxIterations = 30,
  } = options;

  const client = new Anthropic();
  const toolMap = new Map(tools.map((t) => [t.definition.name, t.handler]));

  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: prompt },
  ];

  let result = '';

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    console.log(`\n── iteration ${iteration + 1} ──`);

    const stream = client.messages.stream({
      model,
      max_tokens: 16000,
      thinking: { type: 'adaptive' },
      system: [
        {
          type: 'text',
          text: system,
          cache_control: { type: 'ephemeral' },
        },
      ],
      tools: tools.map((t) => t.definition),
      messages,
    });

    stream.on('text', (text) => process.stdout.write(text));

    const response = await stream.finalMessage();
    messages.push({ role: 'assistant', content: response.content });

    if (response.stop_reason === 'end_turn') {
      result = response.content
        .filter((b) => b.type === 'text')
        .map((b) => (b as Anthropic.TextBlock).text)
        .join('\n');
      console.log('\n\n✓ done');
      break;
    }

    if (response.stop_reason === 'tool_use') {
      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const block of response.content) {
        if (block.type !== 'tool_use') continue;

        const handler = toolMap.get(block.name);
        let content: string;

        if (!handler) {
          content = `Error: unknown tool "${block.name}"`;
        } else {
          console.log(`\n→ ${block.name}(${JSON.stringify(block.input).slice(0, 120)})`);
          try {
            content = await handler(block.input as ToolInput);
            console.log(`  ← ${content.slice(0, 200)}`);
          } catch (err) {
            content = `Error: ${err instanceof Error ? err.message : String(err)}`;
            console.error(`  ← ${content}`);
          }
        }

        toolResults.push({ type: 'tool_result', tool_use_id: block.id, content });
      }

      messages.push({ role: 'user', content: toolResults });
    }
  }

  return result;
}
