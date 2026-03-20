import { VercelRequest, VercelResponse } from '@vercel/node'

/**
 * skill-creator — AI Agent Skill Creation & Improvement
 * Pure logic skill: creates, evaluates, and optimizes SKILL.md files.
 * Source: https://github.com/anthropics/skills/tree/main/skills/skill-creator
 */

// ─── Types ───

interface SkillInput {
  action: 'create' | 'improve' | 'evaluate' | 'optimize-description' | 'generate-tests'
  intent?: string
  skill_md?: string
  output_format?: 'markdown' | 'json'
  context?: { target_tools?: string[]; complexity?: string; domain?: string }
  feedback?: string
  num_tests?: number
}

interface EvalResult {
  completeness: number
  clarity: number
  triggering_quality: number
  structure: number
  issues: string[]
  suggestions: string[]
}

// ─── Env wrapper (dynamic key lookup) ───

function env(key: string): string {
  if (typeof process !== 'undefined' && process.env) {
    return process.env[key] || ''
  }
  return ''
}

// ─── Auth ───

function authenticate(req: VercelRequest): boolean {
  const token = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '')
  const expected = env('CLAW0X_API_KEY')
  if (!expected || !token) return false
  return token === expected
}

// ─── Input validation ───

function validateInput(input: any): { valid: boolean; error?: string } {
  if (!input || typeof input !== 'object') return { valid: false, error: 'Input must be an object' }
  const validActions = ['create', 'improve', 'evaluate', 'optimize-description', 'generate-tests']
  if (!validActions.includes(input.action)) {
    return { valid: false, error: `Invalid action. Valid: ${validActions.join(', ')}` }
  }
  if (input.action === 'create' && !input.intent) {
    return { valid: false, error: 'Missing "intent" for create action' }
  }
  if (['improve', 'evaluate', 'optimize-description', 'generate-tests'].includes(input.action) && !input.skill_md) {
    return { valid: false, error: `Missing "skill_md" for ${input.action} action` }
  }
  return { valid: true }
}


// ─── Evaluation engine ───

function evaluateSkillMd(content: string): EvalResult {
  const issues: string[] = []
  const suggestions: string[] = []
  let completeness = 0
  let clarity = 0
  let triggering = 0
  let structure = 0

  const hasFrontmatter = /^---\n[\s\S]*?\n---/.test(content)
  const hasName = /^name:\s*.+/m.test(content)
  const hasDescription = /^description:\s*.+/m.test(content)

  if (!hasFrontmatter) {
    issues.push('Missing YAML frontmatter block')
  } else {
    structure += 0.25
    if (hasName) structure += 0.25
    else issues.push('Missing "name" in frontmatter')
    if (hasDescription) structure += 0.25
    else issues.push('Missing "description" in frontmatter')
  }

  const requiredSections = ['Prerequisites', 'When to Use', 'API Call', 'Input', 'Output']
  let sectionCount = 0
  for (const section of requiredSections) {
    if (new RegExp(`##\\s+${section}`, 'i').test(content)) sectionCount++
    else issues.push(`Missing section: "${section}"`)
  }
  completeness = sectionCount / requiredSections.length

  const descMatch = content.match(/^description:\s*(.+(?:\n\s+.+)*)/m)
  if (descMatch) {
    const desc = descMatch[1].trim()
    const wordCount = desc.split(/\s+/).length
    if (wordCount < 15) {
      suggestions.push('Description too short for reliable triggering. Aim for 20-40 words.')
      triggering = 0.3
    } else if (wordCount > 60) {
      suggestions.push('Description very long. Consider trimming.')
      triggering = 0.6
    } else {
      triggering = 0.8
    }
    if (/use when|use this|should be used/i.test(desc)) triggering += 0.1
    else suggestions.push('Add "Use when..." phrasing to description.')
    if (/create|generate|analyze|extract|transform|convert|build|optimize|validate|scan/i.test(desc)) triggering += 0.1
    else suggestions.push('Include action verbs in description.')
  }

  const codeBlocks = (content.match(/```/g) || []).length / 2
  if (codeBlocks >= 2) clarity = 0.8
  else if (codeBlocks >= 1) clarity = 0.6
  else { clarity = 0.3; suggestions.push('Add code examples.') }

  if (/\|.*\|.*\|/.test(content)) { clarity += 0.1; structure += 0.15 }
  if (/CLAW0X_API_KEY/.test(content)) structure += 0.1
  else issues.push('Missing CLAW0X_API_KEY declaration')

  if (content.length < 500) suggestions.push('Content is short. Consider adding more detail.')
  if (!/example/i.test(content)) suggestions.push('Add concrete examples.')

  return {
    completeness: Math.min(completeness, 1),
    clarity: Math.min(clarity, 1),
    triggering_quality: Math.min(triggering, 1),
    structure: Math.min(structure, 1),
    issues,
    suggestions,
  }
}

// ─── Slug helper ───

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

// ─── Action: create ───

function createSkill(input: SkillInput): any {
  const intent = input.intent || ''
  const tools = input.context?.target_tools || ['Read', 'Write']

  const words = intent.replace(/[^a-zA-Z0-9\s]/g, '').split(/\s+/).slice(0, 4)
  const name = words.map((w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
  const slug = slugify(name)

  const description = `${intent.trim()}. Use this skill when users need to ${intent.toLowerCase().replace(/^i want (a skill that |to )*/i, '')}. Handles the full workflow including input validation, processing, and structured output.`

  const toolsYaml = tools.length ? `allowed-tools:\n${tools.map((t: string) => `  - ${t}`).join('\n')}` : ''
  const skillMd = `---\nname: ${slug}\ndescription: ${description}\n${toolsYaml}\nmetadata:\n  requires:\n    env:\n      - CLAW0X_API_KEY\n  version: "1.0.0"\n---\n\n# ${name}\n\n${intent}\n\n## Prerequisites\n\n- A valid Claw0x API key. Store securely in environment variables.\n\n## When to Use\n\n- ${intent}\n- Related tasks in the same domain\n\n## API Call\n\n\`\`\`bash\ncurl -X POST https://api.claw0x.com/v1/call \\\\\n  -H "Authorization: Bearer $CLAW0X_API_KEY" \\\\\n  -d \'{"skill": "${slug}", "input": {"action": "..."}}\'\n\`\`\`\n\n## Input\n\n| Field | Type | Required | Description |\n|-------|------|----------|-------------|\n| \`action\` | string | Yes | The action to perform |\n| \`input\` | object | Yes | Action-specific input data |\n\n## Output\n\n\`\`\`json\n{\n  "result": "...",\n  "_meta": { "skill": "${slug}", "version": "1.0.0" }\n}\n\`\`\``

  const evaluation = evaluateSkillMd(skillMd)

  return {
    action: 'create', name, slug, skill_md: skillMd,
    evaluation: { completeness: evaluation.completeness, clarity: evaluation.clarity, triggering_quality: evaluation.triggering_quality },
    suggestions: evaluation.suggestions,
  }
}

// ─── Action: improve ───

function improveSkill(input: SkillInput): any {
  const skillMd = input.skill_md || ''
  const feedback = input.feedback || ''
  const evaluation = evaluateSkillMd(skillMd)
  const improvements: string[] = []
  let improved = skillMd

  if (!(/^---\n/.test(improved))) {
    improved = `---\nname: unnamed-skill\ndescription: TODO\nmetadata:\n  requires:\n    env:\n      - CLAW0X_API_KEY\n  version: "1.0.0"\n---\n\n${improved}`
    improvements.push('Added missing YAML frontmatter')
  }

  if (!/CLAW0X_API_KEY/.test(improved)) {
    improved = improved.replace(/^(---\n[\s\S]*?)(---)/m, '$1metadata:\n  requires:\n    env:\n      - CLAW0X_API_KEY\n$2')
    improvements.push('Added CLAW0X_API_KEY to metadata')
  }

  const sections: [string, string][] = [
    ['Prerequisites', '## Prerequisites\n\n- A valid Claw0x API key.'],
    ['When to Use', '## When to Use\n\n- [Describe use cases]'],
    ['API Call', '## API Call\n\n```bash\ncurl -X POST https://api.claw0x.com/v1/call\n```'],
    ['Input', '## Input\n\n| Field | Type | Required | Description |\n|-------|------|----------|-------------|'],
    ['Output', '## Output\n\n```json\n{"result": "..."}\n```'],
  ]

  for (const [name, template] of sections) {
    if (!new RegExp(`##\\s+${name}`, 'i').test(improved)) {
      improved += `\n\n${template}`
      improvements.push(`Added missing "${name}" section`)
    }
  }

  const newEval = evaluateSkillMd(improved)

  return {
    action: 'improve',
    original_score: { completeness: evaluation.completeness, clarity: evaluation.clarity, triggering_quality: evaluation.triggering_quality, structure: evaluation.structure },
    improved_score: { completeness: newEval.completeness, clarity: newEval.clarity, triggering_quality: newEval.triggering_quality, structure: newEval.structure },
    improvements_applied: improvements,
    remaining_issues: newEval.issues,
    suggestions: newEval.suggestions,
    improved_skill_md: improved,
    feedback_addressed: feedback ? `Feedback noted: "${feedback}". Structural improvements applied.` : null,
  }
}

// ─── Action: optimize-description ───

function optimizeDescription(input: SkillInput): any {
  const skillMd = input.skill_md || ''
  const descMatch = skillMd.match(/^description:\s*(.+(?:\n\s+.+)*)/m)
  const nameMatch = skillMd.match(/^name:\s*(.+)/m)
  const currentDesc = descMatch ? descMatch[1].trim() : ''
  const skillName = nameMatch ? nameMatch[1].trim() : 'unknown'

  if (!currentDesc) return { error: 'No description found in frontmatter' }

  const wordCount = currentDesc.split(/\s+/).length
  const hasUseWhen = /use when|use this|should be used/i.test(currentDesc)
  const hasActionVerbs = /create|generate|analyze|extract|transform|convert|build|optimize|validate|scan/i.test(currentDesc)
  const tips: string[] = []
  let optimized = currentDesc

  if (wordCount < 15) { tips.push('Expanded with trigger phrases.'); optimized += `. Use this skill whenever users need ${skillName}-related tasks.` }
  if (!hasUseWhen) { tips.push('Added "Use when" phrasing.'); optimized += ` Use when users mention ${skillName.replace(/-/g, ' ')}.` }
  if (!hasActionVerbs) tips.push('Add action verbs for clearer intent matching.')
  if (wordCount > 50) tips.push('Consider trimming less important phrases.')

  return {
    action: 'optimize-description', skill_name: skillName,
    original_description: currentDesc, optimized_description: optimized,
    analysis: { word_count: wordCount, has_use_when: hasUseWhen, has_action_verbs: hasActionVerbs, optimal_range: '20-40 words' },
    tips,
  }
}

// ─── Action: generate-tests ───

function generateTests(input: SkillInput): any {
  const skillMd = input.skill_md || ''
  const numTests = input.num_tests || 3
  const nameMatch = skillMd.match(/^name:\s*(.+)/m)
  const descMatch = skillMd.match(/^description:\s*(.+(?:\n\s+.+)*)/m)
  const skillName = nameMatch ? nameMatch[1].trim() : 'unknown-skill'
  const description = descMatch ? descMatch[1].trim() : ''

  const concepts = description.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter((w: string) => w.length > 4).slice(0, 8)

  const shouldTrigger = [
    { id: 1, prompt: `I need help with ${skillName.replace(/-/g, ' ')}`, should_trigger: true, rationale: 'Direct mention' },
    { id: 2, prompt: `How do I ${concepts.slice(0, 3).join(' and ')}?`, should_trigger: true, rationale: 'Key concepts' },
    { id: 3, prompt: `Complex workflow involving ${concepts.slice(2, 5).join(', ')}`, should_trigger: true, rationale: 'Multi-concept match' },
  ]

  const shouldNotTrigger = [
    { id: numTests + 1, prompt: 'Write a fibonacci function in Python', should_trigger: false, rationale: 'Unrelated coding task' },
    { id: numTests + 2, prompt: 'What is the weather like today?', should_trigger: false, rationale: 'Unrelated domain' },
    { id: numTests + 3, prompt: `Read ${skillName}.config.json`, should_trigger: false, rationale: 'Simple file read, not skill task' },
  ]

  return {
    action: 'generate-tests', skill_name: skillName,
    test_cases: [...shouldTrigger.slice(0, numTests), ...shouldNotTrigger.slice(0, numTests)],
    total: Math.min(numTests, 3) * 2,
    note: 'Review and customize these test cases with realistic domain-specific queries.',
  }
}

// ─── Main handler ───

async function handler(req: VercelRequest, res: VercelResponse) {
  if (!authenticate(req)) {
    return res.status(401).json({ success: false, error: 'Unauthorized' })
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' })
  }

  const input = req.body?.input as SkillInput
  const check = validateInput(input)
  if (!check.valid) {
    return res.status(400).json({ success: false, error: check.error })
  }

  const startTime = Date.now()

  try {
    let result: any

    switch (input.action) {
      case 'create':
        result = createSkill(input); break
      case 'improve':
        result = improveSkill(input); break
      case 'evaluate': {
        const evalResult = evaluateSkillMd(input.skill_md || '')
        result = {
          action: 'evaluate',
          scores: {
            completeness: evalResult.completeness, clarity: evalResult.clarity,
            triggering_quality: evalResult.triggering_quality, structure: evalResult.structure,
            overall: +((evalResult.completeness + evalResult.clarity + evalResult.triggering_quality + evalResult.structure) / 4).toFixed(2),
          },
          issues: evalResult.issues, suggestions: evalResult.suggestions,
        }
        break
      }
      case 'optimize-description':
        result = optimizeDescription(input); break
      case 'generate-tests':
        result = generateTests(input); break
    }

    return res.status(200).json({
      success: true,
      data: { ...result, _meta: { skill: 'skill-creator', latency_ms: Date.now() - startTime, version: '1.0.0' } },
    })
  } catch (error: any) {
    return res.status(500).json({ success: false, error: 'Processing failed', details: error.message })
  }
}

export default handler
