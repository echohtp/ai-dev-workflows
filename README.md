# AI Dev Workflows

Agentic GitHub Actions workflows powered by [Claude](https://anthropic.com/claude). Each workflow runs an autonomous agent that reads your codebase, makes decisions, and takes real actions.

---

## Workflows

### Issue → PR (`workflows/issue-to-pr/`)

Trigger by labeling any issue with `ai-implement`. The agent reads the issue, explores the codebase to understand patterns and conventions, implements the feature or fix on a new branch, writes tests if your repo has them, and opens a PR that closes the original issue.

- **Trigger**: `issues: [labeled]` where label = `ai-implement`
- **Actions**: `create_branch`, `write_file` (multiple), `create_pull_request`, `post_comment`
- **Branch naming**: `ai/issue-{number}-{kebab-slug}`

---

## Setup

### 1. Get an Anthropic API key

Sign up at [console.anthropic.com](https://console.anthropic.com) and create an API key.

### 2. Add the secret to your repository

**Settings → Secrets and variables → Actions → New repository secret**

- Name: `ANTHROPIC_API_KEY`
- Value: your key

### 3. Copy the workflow

Copy `workflows/issue-to-pr/workflow.yml` to `.github/workflows/issue-to-pr.yml` and `workflows/issue-to-pr/agent.ts` to the corresponding path. Also copy `src/`, `package.json`, `package-lock.json`, and `tsconfig.json`.

## Requirements

- Node.js 20+
- `ANTHROPIC_API_KEY` repository secret
- `GITHUB_TOKEN` is provided automatically by GitHub Actions
