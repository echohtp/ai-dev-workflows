import { Octokit } from '@octokit/rest';
import type { AgentTool, ToolInput } from '../agent.js';

interface RepoContext {
  owner: string;
  repo: string;
}

export function createGitHubTools(octokit: Octokit, ctx: RepoContext): AgentTool[] {
  return [
    {
      definition: {
        name: 'get_file',
        description: 'Read the contents of a file from the repository.',
        input_schema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'File path relative to repo root' },
            ref: { type: 'string', description: 'Branch, tag, or SHA (defaults to default branch)' },
          },
          required: ['path'],
        },
      },
      handler: async (input: ToolInput) => {
        try {
          const { data } = await octokit.repos.getContent({
            ...ctx,
            path: input.path as string,
            ref: input.ref as string | undefined,
          });
          if (!('content' in data)) return 'Error: not a file';
          return Buffer.from(data.content, 'base64').toString('utf-8');
        } catch (err: unknown) {
          return `Error: ${(err as Error).message}`;
        }
      },
    },

    {
      definition: {
        name: 'list_directory',
        description: 'List files and directories at a path in the repository.',
        input_schema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Directory path (use "" for repo root)' },
            ref: { type: 'string', description: 'Branch or SHA (optional)' },
          },
          required: ['path'],
        },
      },
      handler: async (input: ToolInput) => {
        try {
          const { data } = await octokit.repos.getContent({
            ...ctx,
            path: input.path as string,
            ref: input.ref as string | undefined,
          });
          if (!Array.isArray(data)) return 'Error: not a directory';
          return data.map((f) => `${f.type === 'dir' ? '[dir]' : '[file]'} ${f.name}`).join('\n');
        } catch (err: unknown) {
          return `Error: ${(err as Error).message}`;
        }
      },
    },

    {
      definition: {
        name: 'search_code',
        description: 'Search for code patterns in the repository. Use GitHub code search syntax.',
        input_schema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query (e.g. "auth function" or "TODO extension:ts")' },
          },
          required: ['query'],
        },
      },
      handler: async (input: ToolInput) => {
        try {
          const { data } = await octokit.search.code({
            q: `${input.query as string} repo:${ctx.owner}/${ctx.repo}`,
            per_page: 10,
          });
          if (data.items.length === 0) return 'No results found.';
          return data.items.map((i) => `${i.path}`).join('\n');
        } catch (err: unknown) {
          return `Error: ${(err as Error).message}`;
        }
      },
    },

    {
      definition: {
        name: 'get_pr_diff',
        description: 'Get the full diff of a pull request.',
        input_schema: {
          type: 'object',
          properties: {
            pr_number: { type: 'number', description: 'Pull request number' },
          },
          required: ['pr_number'],
        },
      },
      handler: async (input: ToolInput) => {
        try {
          const response = await octokit.request('GET /repos/{owner}/{repo}/pulls/{pull_number}', {
            ...ctx,
            pull_number: input.pr_number as number,
            headers: { accept: 'application/vnd.github.v3.diff' },
          });
          return String(response.data).slice(0, 60000);
        } catch (err: unknown) {
          return `Error: ${(err as Error).message}`;
        }
      },
    },

    {
      definition: {
        name: 'get_pr_files',
        description: 'List files changed in a pull request with their status and patch.',
        input_schema: {
          type: 'object',
          properties: {
            pr_number: { type: 'number', description: 'Pull request number' },
          },
          required: ['pr_number'],
        },
      },
      handler: async (input: ToolInput) => {
        try {
          const { data } = await octokit.pulls.listFiles({
            ...ctx,
            pull_number: input.pr_number as number,
            per_page: 50,
          });
          return data.map((f) => [
            `${f.status.toUpperCase()} ${f.filename} (+${f.additions}/-${f.deletions})`,
            f.patch ? f.patch.slice(0, 2000) : '',
          ].filter(Boolean).join('\n')).join('\n\n---\n\n');
        } catch (err: unknown) {
          return `Error: ${(err as Error).message}`;
        }
      },
    },

    {
      definition: {
        name: 'get_issue',
        description: 'Get the title, body, and labels of a GitHub issue.',
        input_schema: {
          type: 'object',
          properties: {
            issue_number: { type: 'number', description: 'Issue number' },
          },
          required: ['issue_number'],
        },
      },
      handler: async (input: ToolInput) => {
        try {
          const { data } = await octokit.issues.get({
            ...ctx,
            issue_number: input.issue_number as number,
          });
          return JSON.stringify({
            title: data.title,
            body: data.body,
            labels: data.labels.map((l) => (typeof l === 'string' ? l : l.name)),
            state: data.state,
            author: data.user?.login,
          }, null, 2);
        } catch (err: unknown) {
          return `Error: ${(err as Error).message}`;
        }
      },
    },

    {
      definition: {
        name: 'create_branch',
        description: 'Create a new branch in the repository.',
        input_schema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'New branch name' },
            from_branch: { type: 'string', description: 'Base branch (defaults to main)' },
          },
          required: ['name'],
        },
      },
      handler: async (input: ToolInput) => {
        try {
          const base = (input.from_branch as string) || 'main';
          const { data: ref } = await octokit.git.getRef({ ...ctx, ref: `heads/${base}` });
          await octokit.git.createRef({
            ...ctx,
            ref: `refs/heads/${input.name as string}`,
            sha: ref.object.sha,
          });
          return `Branch "${input.name}" created from "${base}"`;
        } catch (err: unknown) {
          return `Error: ${(err as Error).message}`;
        }
      },
    },

    {
      definition: {
        name: 'write_file',
        description: 'Create or update a file in the repository on a specific branch.',
        input_schema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'File path relative to repo root' },
            content: { type: 'string', description: 'Full file content' },
            branch: { type: 'string', description: 'Branch to commit to' },
            message: { type: 'string', description: 'Commit message' },
          },
          required: ['path', 'content', 'branch', 'message'],
        },
      },
      handler: async (input: ToolInput) => {
        try {
          let sha: string | undefined;
          try {
            const { data } = await octokit.repos.getContent({
              ...ctx,
              path: input.path as string,
              ref: input.branch as string,
            });
            if ('sha' in data) sha = data.sha;
          } catch {
            // File doesn't exist yet
          }

          await octokit.repos.createOrUpdateFileContents({
            ...ctx,
            path: input.path as string,
            message: input.message as string,
            content: Buffer.from(input.content as string).toString('base64'),
            branch: input.branch as string,
            sha,
          });
          return `Wrote ${input.path} to ${input.branch}`;
        } catch (err: unknown) {
          return `Error: ${(err as Error).message}`;
        }
      },
    },

    {
      definition: {
        name: 'create_pull_request',
        description: 'Open a pull request.',
        input_schema: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'PR title' },
            body: { type: 'string', description: 'PR description (markdown)' },
            head: { type: 'string', description: 'Branch with changes' },
            base: { type: 'string', description: 'Target branch (defaults to main)' },
          },
          required: ['title', 'body', 'head'],
        },
      },
      handler: async (input: ToolInput) => {
        try {
          const { data } = await octokit.pulls.create({
            ...ctx,
            title: input.title as string,
            body: input.body as string,
            head: input.head as string,
            base: (input.base as string) || 'main',
          });
          return `PR #${data.number} created: ${data.html_url}`;
        } catch (err: unknown) {
          return `Error: ${(err as Error).message}`;
        }
      },
    },

    {
      definition: {
        name: 'post_comment',
        description: 'Post a comment on an issue or pull request.',
        input_schema: {
          type: 'object',
          properties: {
            issue_number: { type: 'number', description: 'Issue or PR number' },
            body: { type: 'string', description: 'Comment body (supports markdown)' },
          },
          required: ['issue_number', 'body'],
        },
      },
      handler: async (input: ToolInput) => {
        try {
          const { data } = await octokit.issues.createComment({
            ...ctx,
            issue_number: input.issue_number as number,
            body: input.body as string,
          });
          return `Comment posted: ${data.html_url}`;
        } catch (err: unknown) {
          return `Error: ${(err as Error).message}`;
        }
      },
    },

    {
      definition: {
        name: 'post_pr_review',
        description: 'Post a code review on a pull request.',
        input_schema: {
          type: 'object',
          properties: {
            pr_number: { type: 'number', description: 'Pull request number' },
            body: { type: 'string', description: 'Review summary' },
            event: {
              type: 'string',
              enum: ['APPROVE', 'REQUEST_CHANGES', 'COMMENT'],
              description: 'Review action',
            },
            comments: {
              type: 'array',
              description: 'Inline comments on specific lines',
              items: {
                type: 'object',
                properties: {
                  path: { type: 'string', description: 'File path' },
                  line: { type: 'number', description: 'Line number in the file' },
                  body: { type: 'string', description: 'Comment text' },
                },
                required: ['path', 'line', 'body'],
              },
            },
          },
          required: ['pr_number', 'body', 'event'],
        },
      },
      handler: async (input: ToolInput) => {
        try {
          const { data } = await octokit.pulls.createReview({
            ...ctx,
            pull_number: input.pr_number as number,
            body: input.body as string,
            event: input.event as 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT',
            comments: ((input.comments as Array<{ path: string; line: number; body: string }>) || []).map((c) => ({
              path: c.path,
              line: c.line,
              body: c.body,
            })),
          });
          return `Review posted (${input.event}): ${data.html_url}`;
        } catch (err: unknown) {
          return `Error: ${(err as Error).message}`;
        }
      },
    },

    {
      definition: {
        name: 'get_failed_jobs',
        description: 'Get details of failed jobs and steps in a GitHub Actions workflow run.',
        input_schema: {
          type: 'object',
          properties: {
            run_id: { type: 'number', description: 'Workflow run ID' },
          },
          required: ['run_id'],
        },
      },
      handler: async (input: ToolInput) => {
        try {
          const { data } = await octokit.actions.listJobsForWorkflowRun({
            ...ctx,
            run_id: input.run_id as number,
          });
          const failed = data.jobs.filter((j) => j.conclusion === 'failure');
          if (failed.length === 0) return 'No failed jobs found.';
          return failed.map((j) => {
            const failedSteps = (j.steps || []).filter((s) => s.conclusion === 'failure');
            return [
              `Job: ${j.name}`,
              `URL: ${j.html_url}`,
              `Failed steps: ${failedSteps.map((s) => s.name).join(', ') || 'none listed'}`,
            ].join('\n');
          }).join('\n\n');
        } catch (err: unknown) {
          return `Error: ${(err as Error).message}`;
        }
      },
    },
  ];
}
