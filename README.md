# skill-creator

> Create new AI agent skills from scratch, improve existing skills, and optimize skill descriptions for better triggering accuracy via the Claw0x API. Use when users want to build a skill, write a SKILL.md, write handler code, evaluate skill quality, optimize skill metadata, or generate test cases. Covers the full skill development lifecycle from intent capture through deployment and iteration. Even if the user just says "I have an idea for a skill" or "help me package this as a skill", this is the right tool.

[![License: MIT-0](https://img.shields.io/badge/License-MIT--0-blue.svg)](LICENSE)
[![Claw0x](https://img.shields.io/badge/Powered%20by-Claw0x-orange)](https://claw0x.com)
[![OpenClaw Compatible](https://img.shields.io/badge/OpenClaw-Compatible-green)](https://openclaw.org)

## What is This?

This is a native skill for **OpenClaw** and other AI agents. Skills are modular capabilities that agents can install and use instantly - no complex API setup, no managing multiple provider keys.

Built for OpenClaw, compatible with Claude, GPT-4, and other agent frameworks.

## Installation

### For OpenClaw Users

Simply tell your agent:

```
Install the "skill-creator" skill from Claw0x
```

Or use this connection prompt:

```
Add skill: skill-creator
Platform: Claw0x
Get your API key at: https://claw0x.com
```

### For Other Agents (Claude, GPT-4, etc.)

1. Get your free API key at [claw0x.com](https://claw0x.com) (no credit card required)
2. Add to your agent's configuration:
   - Skill name: `skill-creator`
   - Endpoint: `https://claw0x.com/v1/call`
   - Auth: Bearer token with your Claw0x API key

### Via CLI

```bash
npx @claw0x/cli add skill-creator
```

---


# Skill Creator

Build production-ready AI agent skills for the Claw0x platform. From a one-sentence idea to a deployed, billed, security-scanned skill — this guide and API cover the full lifecycle.

> **Free to use.** This skill costs nothing. [Sign up at claw0x.com](https://claw0x.com), create an API key, and start calling. No credit card required.

## How It Works — Under the Hood

This skill provides a structured pipeline for creating, evaluating, and optimizing AI agent skills. It's a pure logic skill — no external API calls, all processing happens locally.

### The Five Actions

1. **create** — Takes a one-sentence intent ("I want a skill that extracts data from PDFs") and generates a complete SKILL.md with proper frontmatter, all required sections, and a handler.ts skeleton. Auto-evaluates the output and suggests improvements.

2. **improve** — Takes an existing SKILL.md and optional feedback. Auto-fixes structural issues (missing frontmatter, missing sections, missing env declarations). Returns before/after quality scores.

3. **evaluate** — Scores a SKILL.md across four dimensions: completeness (required sections), clarity (code examples, tables), triggering quality (description analysis), and structure (frontmatter, env vars). Returns 0-1 scores plus actionable suggestions.

4. **optimize-description** — Analyzes the frontmatter `description` field and rewrites it for better agent triggering. Checks word count, "Use when" phrasing, action verbs, and edge-case coverage.

5. **generate-tests** — Creates realistic test prompts in two categories: should-trigger and should-not-trigger. Use these to validate that agents invoke the skill correctly.

### Why Description Quality Matters

Agents match skills by scanning descriptions against user intent. A conservative description ("validates email format") only triggers on exact matches. A pushy description ("Use when users mention email validation, address checking, deliverability, bounce prevention, or inbox verification") catches the long tail of how users actually phrase requests. This skill's `optimize-description` action applies that principle systematically.

### Evaluation Criteria

The `evaluate` action checks:

- **Completeness** — Are all required sections present? (Prerequisites, When to Use, API Call, Input, Output)
- **Clarity** — Does it have code examples? Tables? Real output samples?
- **Triggering quality** — Is the description 20-40 words? Does it use "Use when..." phrasing? Action verbs?
- **Structure** — Valid YAML frontmatter? CLAW0X_API_KEY declared? Proper section ordering?

## Prerequisites

A valid Claw0x API key (`CLAW0X_API_KEY`). Sign up at [claw0x.com](https://claw0x.com) and create a key in your dashboard. Store it securely in environment variables or a secret manager — never hardcode it in source files.

No credit card or wallet balance needed — this skill is free.

## When to Use

- Creating a new skill from scratch (SKILL.md + handler.ts)
- Improving or editing an existing skill's documentation
- Evaluating skill quality before deployment
- Optimizing a skill's description for better agent triggering
- Generating test prompts to validate skill behavior
- Auditing a skill against platform standards

## API Call

```bash
curl -s -X POST https://api.claw0x.com/v1/call \
  -H "Authorization: Bearer $CLAW0X_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "skill": "skill-creator",
    "input": {
      "action": "create",
      "intent": "I want a skill that extracts structured data from PDFs",
      "output_format": "markdown",
      "context": {
        "target_tools": ["Read", "Write", "Bash"],
        "complexity": "medium"
      }
    }
  }'
```

## Input

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `action` | string | Yes | One of: `create`, `improve`, `evaluate`, `optimize-description`, `generate-tests` |
| `intent` | string | Yes (create) | What the skill should do — one clear sentence |
| `skill_md` | string | Yes (improve/evaluate/optimize-description/generate-tests) | Existing SKILL.md content |
| `output_format` | string | No | `markdown` (default) or `json` |
| `context` | object | No | Additional context: `target_tools` (string[]), `complexity` (low/medium/high), `domain` (string) |
| `feedback` | string | No (improve) | Specific feedback on what to change |
| `num_tests` | number | No (generate-tests) | Number of test cases per category (default: 3) |

## Output

### `create` response

```json
{
  "action": "create",
  "name": "PDF Data Extractor",
  "slug": "pdf-data-extractor",
  "skill_md": "---\nname: pdf-data-extractor\ndescription: Extract structured data from PDF documents...\n---\n\n# PDF Data Extractor\n...",
  "handler_skeleton": "import { VercelRequest, VercelResponse } from '@vercel/node';\n...",
  "evaluation": {
    "completeness": 0.85,
    "clarity": 0.9,
    "triggering_quality": 0.8
  },
  "suggestions": [
    "Add error handling for corrupt PDFs",
    "Include example output with realistic invoice data"
  ],
  "_meta": { "skill": "skill-creator", "version": "1.0.0", "latency_ms": 42 }
}
```

### `evaluate` response

```json
{
  "action": "evaluate",
  "scores": {
    "completeness": 0.8,
    "clarity": 0.7,
    "triggering_quality": 0.6,
    "structure": 0.9,
    "overall": 0.75
  },
  "issues": [
    "Missing section: \"Error Codes\"",
    "Description is too short for reliable triggering"
  ],
  "suggestions": [
    "Add \"Use when...\" phrasing to description",
    "Include action verbs (extract, generate, analyze)"
  ],
  "_meta": { "skill": "skill-creator", "version": "1.0.0", "latency_ms": 15 }
}
```

### `optimize-description` response

```json
{
  "action": "optimize-description",
  "skill_name": "email-validator",
  "original_description": "Validates email addresses",
  "optimized_description": "Validates email addresses via the Claw0x API. Use when users mention email validation, address checking, deliverability, bounce prevention, or inbox verification. Even if the user just says 'check this email', this skill applies.",
  "analysis": {
    "word_count": 5,
    "has_use_when": false,
    "has_action_verbs": true,
    "optimal_range": "20-40 words"
  },
  "tips": [
    "Description too short. Expanded with trigger phrases.",
    "Added \"Use when\" phrasing for better triggering."
  ],
  "_meta": { "skill": "skill-creator", "version": "1.0.0", "latency_ms": 8 }
}
```

## Example — Full Create Workflow

**Request:**
```json
{
  "skill": "skill-creator",
  "input": {
    "action": "create",
    "intent": "I want a skill that validates email addresses and checks deliverability",
    "context": {
      "target_tools": ["Bash"],
      "complexity": "low"
    }
  }
}
```

**Response includes:**
- A complete SKILL.md with frontmatter, all required sections, and a pushy description
- A handler.ts skeleton with auth middleware, input validation, and error handling
- Quality scores (completeness, clarity, triggering)
- Specific suggestions for improvement

Then use `evaluate` to score it, `optimize-description` to improve triggering, and `generate-tests` to create validation prompts.

## Error Codes

| Code | Meaning | When |
|------|---------|------|
| `400` | Invalid input | Missing required fields, unknown action |
| `401` | Unauthorized | Invalid or missing API key |
| `500` | Processing failed | Internal error (not billed) |

## Pricing

**Free.** This is a pure logic skill with no upstream API costs. Only your Claw0x API key is needed.


---

## About Claw0x

Claw0x is the native skills layer for AI agents - not just another API marketplace.

**Why Claw0x?**
- **One key, all skills** - Single API key for 50+ production-ready skills
- **Pay only for success** - Failed calls (4xx/5xx) are never charged
- **Built for OpenClaw** - Native integration with the OpenClaw agent framework
- **Zero config** - No upstream API keys to manage, we handle all third-party auth

**For Developers:**
- [Browse all skills](https://claw0x.com/skills)
- [Sell your own skills](https://claw0x.com/docs/sell)
- [API Documentation](https://claw0x.com/docs/api-reference)
- [OpenClaw Integration Guide](https://claw0x.com/docs/openclaw)

## Links

- [Claw0x Platform](https://claw0x.com)
- [OpenClaw Framework](https://openclaw.org)
- [Skill Documentation](https://claw0x.com/skills/skill-creator)
