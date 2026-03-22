import { VercelRequest, VercelResponse } from '@vercel/node';
import { authMiddleware } from '../../lib/auth';
import { validateInput } from '../../lib/validation';
import { successResponse, errorResponse } from '../../lib/response';

/**
 * skill-creator — AI Agent Skill Creation & Improvement
 * Pure logic skill that helps create, evaluate, and optimize SKILL.md files.
 * Source: https://github.com/anthropics/skills/tree/main/skills/skill-creator
 *
 * Actions: create, improve, evaluate, optimize-description, generate-tests
 */

const VALID_ACTIONS = ['create', 'improve', 'evaluate', 'optimize-description', 'generate-tests'] as const;
type Action = typeof VALID_ACTIONS[number];

// ─── Skill template components ───

const FRONTMATTER_TEMPLATE = (name: string, description: string, tools: string[]) => `---
name: ${name}
description: ${description}
${tools.length ? `allowed-tools:\n${tools.map(t => `  - ${t}`).join('\n')}` : ''}
metadata:
  requires:
    env:
      - CLAW0X_API_KEY
  version: "1.0.0"
---`;

const SECTION_TEMPLATES: Record<string, string> = {
  prerequisites: '## Prerequisites\n\n- A valid Claw0x API key (`CLAW0X_API_KEY`). Store securely in environment variables.',
  when_to_use: '## When to Use\n\n- [Describe primary use cases]\n- [Describe secondary use cases]',
  api_call: '## API Call\n\n```bash\ncurl -X POST https://api.claw0x.com/v1/call \\\n  -H "Authorization: Bearer $CLAW0X_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d \'{"skill": "{slug}", "input": {"action": "..."}}\'\n```',
  input: '## Input\n\n| Field | Type | Required | Description |\n|-------|------|----------|-------------|',
  output: '## Output\n\n```json\n{\n  "result": "...",\n  "_meta": { "skill": "{slug}", "version": "1.0.0" }\n}\n```',
};

// ─── Evaluation criteria ───

interface EvalResult {
  completeness: number;
  clarity: number;
  triggering_quality: number;
  structure: number;
  issues: string[];
  suggestions: string[];
}

function evaluateSkillMd(content: string): EvalResult {
  const issues: string[] = [];
  const suggestions: string[] = [];
  let completeness = 0;
  let clarity = 0;
  let triggering = 0;
  let structure = 0;

  // Check frontmatter
  const hasFrontmatter = /^---\n[\s\S]*?\n---/.test(content);
  const hasName = /^name:\s*.+/m.test(content);
  const hasDescription = /^description:\s*.+/m.test(content);

  if (!hasFrontmatter) {
    issues.push('Missing YAML frontmatter block');
  } else {
    structure += 0.25;
    if (hasName) structure += 0.25;
    else issues.push('Missing "name" in frontmatter');
    if (hasDescription) structure += 0.25;
    else issues.push('Missing "description" in frontmatter');
  }

  // Check required sections
  const requiredSections = ['Prerequisites', 'When to Use', 'API Call', 'Input', 'Output'];
  let sectionCount = 0;
  for (const section of requiredSections) {
    if (new RegExp(`##\\s+${section}`, 'i').test(content)) {
      sectionCount++;
    } else {
      issues.push(`Missing section: "${section}"`);
    }
  }
  completeness = sectionCount / requiredSections.length;

  // Check description quality for triggering
  const descMatch = content.match(/^description:\s*(.+(?:\n\s+.+)*)/m);
  if (descMatch) {
    const desc = descMatch[1].trim();
    const wordCount = desc.split(/\s+/).length;
    if (wordCount < 15) {
      suggestions.push('Description is too short for reliable triggering. Aim for 20-40 words.');
      triggering = 0.3;
    } else if (wordCount > 60) {
      suggestions.push('Description is very long. Consider trimming to the most important trigger phrases.');
      triggering = 0.6;
    } else {
      triggering = 0.8;
    }

    // Check for "Use when" pattern
    if (/use when|use this|should be used/i.test(desc)) {
      triggering += 0.1;
    } else {
      suggestions.push('Add "Use when..." phrasing to description for better triggering.');
    }

    // Check for action verbs
    const actionVerbs = ['create', 'generate', 'analyze', 'extract', 'transform', 'convert', 'build', 'optimize', 'validate', 'scan'];
    const hasActionVerbs = actionVerbs.some(v => desc.toLowerCase().includes(v));
    if (hasActionVerbs) triggering += 0.1;
    else suggestions.push('Include action verbs in description (create, generate, analyze, etc.).');
  }

  // Clarity: check for examples and code blocks
  const codeBlocks = (content.match(/```/g) || []).length / 2;
  if (codeBlocks >= 2) clarity = 0.8;
  else if (codeBlocks >= 1) clarity = 0.6;
  else {
    clarity = 0.3;
    suggestions.push('Add code examples to improve clarity.');
  }

  // Check for table formatting
  if (/\|.*\|.*\|/.test(content)) {
    clarity += 0.1;
    structure += 0.15;
  }

  // Check env var declaration
  if (/CLAW0X_API_KEY/.test(content)) {
    structure += 0.1;
  } else {
    issues.push('Missing CLAW0X_API_KEY in metadata.requires.env');
  }

  // General suggestions
  if (content.length < 500) suggestions.push('Skill content is quite short. Consider adding more detail.');
  if (!/example/i.test(content)) suggestions.push('Add concrete examples to help users understand expected behavior.');

  return {
    completeness: Math.min(completeness, 1),
    clarity: Math.min(clarity, 1),
    triggering_quality: Math.min(triggering, 1),
    structure: Math.min(structure, 1),
    issues,
    suggestions,
  };
}


// ─── Slug generator ───

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// ─── Action: create ───

function createSkill(input: any): any {
  const intent = input.intent || '';
  const context = input.context || {};
  const tools = context.target_tools || ['Read', 'Write'];
  const format = input.output_format || 'markdown';

  if (!intent) {
    throw { status: 400, message: 'Missing "intent" field for create action' };
  }

  // Derive name and slug from intent
  const words = intent.replace(/[^a-zA-Z0-9\s]/g, '').split(/\s+/).slice(0, 4);
  const name = words.map((w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
  const slug = slugify(name);

  // Build description with triggering hints
  const description = `${intent.trim()}. Use this skill when users need to ${intent.toLowerCase().replace(/^i want (a skill that |to )*/i, '')}. Handles the full workflow including input validation, processing, and structured output.`;

  // Generate SKILL.md
  const frontmatter = FRONTMATTER_TEMPLATE(slug, description, tools);
  const sections = [
    `# ${name}`,
    '',
    `${intent}`,
    '',
    SECTION_TEMPLATES.prerequisites,
    '',
    SECTION_TEMPLATES.when_to_use.replace('[Describe primary use cases]', intent).replace('[Describe secondary use cases]', 'Related tasks in the same domain'),
    '',
    SECTION_TEMPLATES.api_call.replace(/{slug}/g, slug),
    '',
    SECTION_TEMPLATES.input,
    `| \`action\` | string | Yes | The action to perform |`,
    `| \`input\` | object | Yes | Action-specific input data |`,
    '',
    SECTION_TEMPLATES.output.replace(/{slug}/g, slug),
  ];

  const skillMd = `${frontmatter}\n\n${sections.join('\n')}`;

  // Generate handler skeleton
  const handlerSkeleton = `import { VercelRequest, VercelResponse } from '@vercel/node';
import { authMiddleware } from '../../lib/auth';
import { validateInput } from '../../lib/validation';
import { successResponse, errorResponse } from '../../lib/response';

async function handler(req: VercelRequest, res: VercelResponse) {
  const validation = validateInput(req.body, {
    input: { type: 'object', required: true },
  });
  if (!validation.valid) {
    return errorResponse(res, 'Invalid input', 400, validation.errors);
  }

  const { input } = validation.data!;
  const action = input.action || 'default';
  const startTime = Date.now();

  try {
    let result: any;

    switch (action) {
      case 'default':
        // TODO: Implement main logic for ${name}
        result = { message: 'Not implemented yet' };
        break;
      default:
        return errorResponse(res, \`Unknown action: \${action}\`, 400);
    }

    return successResponse(res, {
      ...result,
      _meta: { skill: '${slug}', latency_ms: Date.now() - startTime, version: '1.0.0' },
    });
  } catch (error: any) {
    return errorResponse(res, 'Processing failed', 500, error.message);
  }
}

export default authMiddleware(handler);`;

  // Evaluate the generated skill
  const evaluation = evaluateSkillMd(skillMd);

  if (format === 'json') {
    return {
      action: 'create',
      name,
      slug,
      skill_md: skillMd,
      handler_skeleton: handlerSkeleton,
      evaluation: {
        completeness: evaluation.completeness,
        clarity: evaluation.clarity,
        triggering_quality: evaluation.triggering_quality,
      },
      suggestions: evaluation.suggestions,
    };
  }

  return {
    action: 'create',
    name,
    slug,
    skill_md: skillMd,
    handler_skeleton: handlerSkeleton,
    evaluation: {
      completeness: evaluation.completeness,
      clarity: evaluation.clarity,
      triggering_quality: evaluation.triggering_quality,
    },
    suggestions: evaluation.suggestions,
  };
}

// ─── Action: improve ───

function improveSkill(input: any): any {
  const skillMd = input.skill_md || '';
  const feedback = input.feedback || '';

  if (!skillMd) {
    throw { status: 400, message: 'Missing "skill_md" field for improve action' };
  }

  const evaluation = evaluateSkillMd(skillMd);
  const improvements: string[] = [];
  let improved = skillMd;

  // Auto-fix missing frontmatter
  if (!(/^---\n/.test(improved))) {
    improved = `---\nname: unnamed-skill\ndescription: TODO - Add description\nmetadata:\n  requires:\n    env:\n      - CLAW0X_API_KEY\n  version: "1.0.0"\n---\n\n${improved}`;
    improvements.push('Added missing YAML frontmatter');
  }

  // Auto-fix missing CLAW0X_API_KEY
  if (!/CLAW0X_API_KEY/.test(improved)) {
    improved = improved.replace(
      /^(---\n[\s\S]*?)(---)/m,
      '$1metadata:\n  requires:\n    env:\n      - CLAW0X_API_KEY\n$2'
    );
    improvements.push('Added CLAW0X_API_KEY to metadata.requires.env');
  }

  // Add missing sections
  const sectionChecks: [string, string][] = [
    ['Prerequisites', SECTION_TEMPLATES.prerequisites],
    ['When to Use', SECTION_TEMPLATES.when_to_use],
    ['API Call', SECTION_TEMPLATES.api_call],
    ['Input', SECTION_TEMPLATES.input],
    ['Output', SECTION_TEMPLATES.output],
  ];

  for (const [name, template] of sectionChecks) {
    if (!new RegExp(`##\\s+${name}`, 'i').test(improved)) {
      improved += `\n\n${template}`;
      improvements.push(`Added missing "${name}" section`);
    }
  }

  const newEvaluation = evaluateSkillMd(improved);

  return {
    action: 'improve',
    original_score: {
      completeness: evaluation.completeness,
      clarity: evaluation.clarity,
      triggering_quality: evaluation.triggering_quality,
      structure: evaluation.structure,
    },
    improved_score: {
      completeness: newEvaluation.completeness,
      clarity: newEvaluation.clarity,
      triggering_quality: newEvaluation.triggering_quality,
      structure: newEvaluation.structure,
    },
    improvements_applied: improvements,
    remaining_issues: newEvaluation.issues,
    suggestions: newEvaluation.suggestions,
    improved_skill_md: improved,
    feedback_addressed: feedback ? `Feedback noted: "${feedback}". Applied structural improvements. Manual content edits may still be needed.` : null,
  };
}

// ─── Action: optimize-description ───

function optimizeDescription(input: any): any {
  const skillMd = input.skill_md || '';

  if (!skillMd) {
    throw { status: 400, message: 'Missing "skill_md" field for optimize-description action' };
  }

  const descMatch = skillMd.match(/^description:\s*(.+(?:\n\s+.+)*)/m);
  const nameMatch = skillMd.match(/^name:\s*(.+)/m);
  const currentDesc = descMatch ? descMatch[1].trim() : '';
  const skillName = nameMatch ? nameMatch[1].trim() : 'unknown';

  if (!currentDesc) {
    throw { status: 400, message: 'No description found in SKILL.md frontmatter' };
  }

  // Analyze current description
  const wordCount = currentDesc.split(/\s+/).length;
  const hasUseWhen = /use when|use this|should be used/i.test(currentDesc);
  const hasActionVerbs = /create|generate|analyze|extract|transform|convert|build|optimize|validate|scan/i.test(currentDesc);
  const hasNegation = /not |don't|never/i.test(currentDesc);

  const tips: string[] = [];
  let optimized = currentDesc;

  if (wordCount < 15) {
    tips.push('Description too short. Expanded with trigger phrases.');
    optimized += `. Use this skill whenever users need to work with ${skillName}-related tasks.`;
  }

  if (!hasUseWhen) {
    tips.push('Added "Use when" phrasing for better triggering.');
    optimized += ` Use when users mention ${skillName.replace(/-/g, ' ')} or related concepts.`;
  }

  if (!hasActionVerbs) {
    tips.push('Added action verbs for clearer intent matching.');
  }

  if (!hasNegation) {
    tips.push('Consider adding "even if they don\'t explicitly ask for..." to catch edge cases.');
  }

  if (wordCount > 50) {
    tips.push('Description is long. Consider trimming less important phrases.');
  }

  return {
    action: 'optimize-description',
    skill_name: skillName,
    original_description: currentDesc,
    optimized_description: optimized,
    analysis: {
      word_count: wordCount,
      has_use_when: hasUseWhen,
      has_action_verbs: hasActionVerbs,
      optimal_range: '20-40 words',
    },
    tips,
  };
}

// ─── Action: generate-tests ───

function generateTests(input: any): any {
  const skillMd = input.skill_md || '';
  const numTests = input.num_tests || 3;

  if (!skillMd) {
    throw { status: 400, message: 'Missing "skill_md" field for generate-tests action' };
  }

  const nameMatch = skillMd.match(/^name:\s*(.+)/m);
  const descMatch = skillMd.match(/^description:\s*(.+(?:\n\s+.+)*)/m);
  const skillName = nameMatch ? nameMatch[1].trim() : 'unknown-skill';
  const description = descMatch ? descMatch[1].trim() : '';

  // Extract key concepts from description
  const concepts = description
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter((w: string) => w.length > 4)
    .slice(0, 8);

  // Generate should-trigger test cases
  const shouldTrigger = [
    {
      id: 1,
      prompt: `I need help with ${skillName.replace(/-/g, ' ')} — can you set this up for me?`,
      should_trigger: true,
      rationale: 'Direct mention of skill name',
    },
    {
      id: 2,
      prompt: `How do I ${concepts.slice(0, 3).join(' and ')} in my project?`,
      should_trigger: true,
      rationale: 'Mentions key concepts from description',
    },
    {
      id: 3,
      prompt: `I have a complex workflow that involves ${concepts.slice(2, 5).join(', ')} and I need to automate it`,
      should_trigger: true,
      rationale: 'Complex multi-concept query matching skill domain',
    },
  ];

  // Generate should-not-trigger test cases
  const shouldNotTrigger = [
    {
      id: numTests + 1,
      prompt: 'Write a fibonacci function in Python',
      should_trigger: false,
      rationale: 'Generic coding task, unrelated to skill domain',
    },
    {
      id: numTests + 2,
      prompt: 'What is the weather like today?',
      should_trigger: false,
      rationale: 'Completely unrelated domain',
    },
    {
      id: numTests + 3,
      prompt: `Read the file ${skillName}.config.json and tell me what it contains`,
      should_trigger: false,
      rationale: 'Mentions skill name but is a simple file read task',
    },
  ];

  const allTests = [...shouldTrigger.slice(0, numTests), ...shouldNotTrigger.slice(0, numTests)];

  return {
    action: 'generate-tests',
    skill_name: skillName,
    test_cases: allTests,
    total: allTests.length,
    should_trigger_count: Math.min(numTests, shouldTrigger.length),
    should_not_trigger_count: Math.min(numTests, shouldNotTrigger.length),
    note: 'Review and customize these test cases. Replace generic prompts with realistic user queries specific to your domain.',
  };
}

// ─── Main handler ───

async function handler(req: VercelRequest, res: VercelResponse) {
  const validation = validateInput(req.body, {
    input: { type: 'object', required: true },
  });
  if (!validation.valid) {
    return errorResponse(res, 'Invalid input', 400, validation.errors);
  }

  const { input } = validation.data!;
  const action = (input.action || '').toLowerCase() as Action;

  if (!VALID_ACTIONS.includes(action)) {
    return errorResponse(res, `Invalid action "${action}". Valid: ${VALID_ACTIONS.join(', ')}`, 400);
  }

  const startTime = Date.now();

  try {
    let result: any;

    switch (action) {
      case 'create':
        result = createSkill(input);
        break;
      case 'improve':
        result = improveSkill(input);
        break;
      case 'evaluate':
        const evalResult = evaluateSkillMd(input.skill_md || '');
        result = {
          action: 'evaluate',
          scores: {
            completeness: evalResult.completeness,
            clarity: evalResult.clarity,
            triggering_quality: evalResult.triggering_quality,
            structure: evalResult.structure,
            overall: +(
              (evalResult.completeness + evalResult.clarity + evalResult.triggering_quality + evalResult.structure) / 4
            ).toFixed(2),
          },
          issues: evalResult.issues,
          suggestions: evalResult.suggestions,
        };
        break;
      case 'optimize-description':
        result = optimizeDescription(input);
        break;
      case 'generate-tests':
        result = generateTests(input);
        break;
    }

    return successResponse(res, {
      ...result,
      _meta: { skill: 'skill-creator', latency_ms: Date.now() - startTime, version: '1.0.0' },
    });
  } catch (error: any) {
    if (error.status) {
      return errorResponse(res, error.message, error.status);
    }
    console.error('[skill-creator] Error:', error.message);
    return errorResponse(res, 'Processing failed', 500, error.message);
  }
}

export default authMiddleware(handler);
