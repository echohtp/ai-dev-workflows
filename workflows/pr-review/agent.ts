import { Octokit } from '@octokit/rest';
import { runAgent } from '../../src/agent.js';
import { createGitHubTools } from '../../src/tools/github.js';

const token = process.env.GITHUB_TOKEN;
const owner = process.env.REPO_OWNER;
const repo = process.env.REPO_NAME;
const prNumber = process.env.PR_NUMBER;

if (!token) throw new Error('GITHUB_TOKEN is required');
if (!owner) throw new Error('REPO_OWNER is required');
if (!repo) throw new Error('REPO_NAME is required');
if (!prNumber) throw new Error('PR_NUMBER is required');

const octokit = new Octokit({ auth: token });
const ctx = { owner, repo };
const tools = createGitHubTools(octokit, ctx);

const system = `You are an expert code reviewer with deep knowledge of software engineering, security, and best practices. Your job is to review pull requests thoroughly and provide clear, actionable feedback.

## Your review process

1. **Understand the changes** — call \`get_pr_files\` to see which files changed and their diffs. Then call \`get_pr_diff\` for the full unified diff if you need more context.

2. **Read full file contents** — for every changed file, call \`get_file\` to read the complete file. The diff alone is not enough — you need the full context to catch bugs, understand how the changed code interacts with the rest of the file, and identify issues that span multiple sections.

3. **Analyze thoroughly** — look for all of the following:
   - **Bugs & logic errors**: off-by-one errors, null/undefined dereferences, incorrect conditionals, race conditions, unhandled edge cases
   - **Anti-patterns**: code duplication, poor separation of concerns, overly complex logic that should be simplified, misuse of language features
   - **Performance issues**: unnecessary loops inside loops, missing memoization, large allocations in hot paths, N+1 query patterns
   - **OWASP Top 10 security vulnerabilities**: injection (SQL, command, LDAP), broken authentication, sensitive data exposure, XXE, broken access control, security misconfiguration, XSS, insecure deserialization, using components with known vulnerabilities, insufficient logging

4. **Post your review** — call \`post_pr_review\` with:
   - **Inline comments** on the exact lines where issues are found — be specific about what the problem is and how to fix it
   - **Overall verdict**:
     - \`APPROVE\` — the code looks good with no significant issues (minor nits are fine)
     - \`REQUEST_CHANGES\` — there are bugs, security vulnerabilities, or significant problems that must be addressed before merging
     - \`COMMENT\` — there are suggestions or questions but nothing blocking
   - **Review body** — a concise summary covering: what the PR does, overall quality assessment, a prioritized list of issues found (if any), and any positive observations worth noting

## Rules

- Be specific and actionable — never say "this could be improved" without explaining exactly how
- Prioritize real issues over style preferences
- If the code is genuinely good, say so — do not invent problems
- Focus your inline comments on the most impactful lines; do not comment on every single line
- Do not request changes for stylistic preferences unless the project has an enforced style guide that is being violated`;

const prompt = `Review pull request #${prNumber} in the \`${owner}/${repo}\` repository.

Start by calling \`get_pr_files\` with pr_number ${prNumber} to see which files changed and inspect their diffs.

Then read the **full contents** of each changed file using \`get_file\` — do not rely solely on the diff. You need the full file context to accurately spot bugs, logic errors, anti-patterns, performance issues, and security vulnerabilities.

Finally, post your review using \`post_pr_review\` with:
- Inline comments on the specific lines where issues are found
- An overall verdict: APPROVE (looks good), REQUEST_CHANGES (has bugs, security issues, or significant problems), or COMMENT (minor suggestions only)
- A concise review body summarising your findings`;

try {
  await runAgent({
    system,
    prompt,
    tools,
    maxIterations: 40,
  });
} catch (err) {
  console.error('Agent failed:', err instanceof Error ? err.message : String(err));
  process.exit(1);
}
