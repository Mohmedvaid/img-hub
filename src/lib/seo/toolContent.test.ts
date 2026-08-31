import { allTools, findTool, liveTools, type ToolDefinition } from '@config/tools'
import { describe, expect, it } from 'vitest'
import { toolContent } from './toolContent'

/** Fails with the missing slug rather than a null dereference if the registry changes. */
function tool(slug: string): ToolDefinition {
  const found = findTool(slug)
  if (!found) throw new Error(`no tool registered for slug: ${slug}`)
  return found
}

describe('generated copy is not thin or duplicated', () => {
  it('gives every live tool a substantial intro', () => {
    for (const tool of liveTools()) {
      expect(toolContent(tool).intro.length).toBeGreaterThan(120)
    }
  })

  it('gives every live tool a distinct intro', () => {
    const intros = liveTools().map((tool) => toolContent(tool).intro)
    expect(new Set(intros).size).toBe(intros.length)
  })

  it('gives every live tool at least four questions', () => {
    for (const tool of liveTools()) {
      expect(toolContent(tool).faq.length).toBeGreaterThanOrEqual(4)
    }
  })

  it('answers every question with something substantive', () => {
    for (const tool of liveTools()) {
      for (const entry of toolContent(tool).faq) {
        expect(entry.answer.length).toBeGreaterThan(60)
        expect(entry.question.endsWith('?')).toBe(true)
      }
    }
  })

  it('never repeats a question within one page', () => {
    for (const tool of allTools()) {
      const questions = toolContent(tool).faq.map((entry) => entry.question)
      expect(new Set(questions).size).toBe(questions.length)
    }
  })
})

describe('copy reflects the actual formats involved', () => {
  it('warns about transparency loss only where it happens', () => {
    expect(toolContent(tool('png-to-jpg')).intro).toMatch(/transparen/i)
    expect(toolContent(tool('png-to-webp')).intro).not.toMatch(/become solid/i)
  })

  it('warns about animation loss converting GIF to a still format', () => {
    expect(toolContent(tool('gif-to-png')).intro).toMatch(/first frame/i)
  })

  it('describes a lossless target as lossless', () => {
    expect(toolContent(tool('jpg-to-png')).intro).toMatch(/lossless/i)
  })

  it('answers the transparency question differently per target format', () => {
    const toJpg = toolContent(tool('png-to-jpg')).faq.find((e) => /transparency/i.test(e.question))
    const toWebp = toolContent(tool('png-to-webp')).faq.find((e) =>
      /transparency/i.test(e.question),
    )

    expect(toJpg?.answer).not.toBe(toWebp?.answer)
    expect(toJpg?.answer).toMatch(/cannot/i)
    expect(toWebp?.answer).toMatch(/Yes/)
  })

  it('explains on the compressor why quality does nothing to a PNG', () => {
    const faq = toolContent(tool('compress-image')).faq
    expect(faq.some((entry) => /PNG/.test(entry.question))).toBe(true)
  })
})

describe('the privacy claim appears everywhere, because it is the differentiator', () => {
  it('answers an upload question on every live tool', () => {
    for (const tool of liveTools()) {
      const asked = toolContent(tool).faq.some((entry) => /upload/i.test(entry.question))
      expect(asked).toBe(true)
    }
  })

  it('states plainly that nothing is uploaded', () => {
    for (const tool of liveTools()) {
      const answer = toolContent(tool).faq.find((entry) => /upload/i.test(entry.question))?.answer
      expect(answer).toMatch(/never uploaded/i)
    }
  })
})
