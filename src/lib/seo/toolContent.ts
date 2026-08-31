/**
 * Page copy for tool pages, derived from format facts.
 *
 * The risk with generating a dozen conversion pages from one template is thin,
 * near-duplicate content — which search engines discount and readers resent. So
 * nothing here is filler: every sentence is derived from something true about the
 * specific formats involved (transparency, animation, lossy vs lossless, encode
 * cost), pulled from `formats.ts`.
 *
 * The result is that `png-to-jpg` warns about losing transparency while
 * `png-to-webp` does not, because that is the actual difference between them.
 */

import type { ToolDefinition } from '@config/tools'
import { formatInfo, losesAnimation, losesTransparency } from '@/lib/pipeline/formats'

export type FaqEntry = { readonly question: string; readonly answer: string }

export type ToolContent = {
  /** Leads the page, under the h1. */
  readonly intro: string
  /** Rendered as a list and mirrored into FAQPage structured data. */
  readonly faq: readonly FaqEntry[]
}

const PRIVACY_ANSWER =
  'No. Everything happens inside your browser on your own device. Your files are never uploaded, so nothing is stored on a server and nothing is shared. You can check this yourself: open your browser devtools, watch the network tab, and run a file through.'

const COST_ANSWER =
  'Free, with no sign-up and no watermark. Because the work happens on your device rather than on a server, there is no per-image cost to pass on.'

export function toolContent(tool: ToolDefinition): ToolContent {
  if (tool.conversion) {
    return conversionContent(tool, tool.conversion.from, tool.conversion.to)
  }
  return standaloneContent(tool)
}

function conversionContent(
  tool: ToolDefinition,
  from: Parameters<typeof formatInfo>[0],
  to: Parameters<typeof formatInfo>[0],
): ToolContent {
  const source = formatInfo(from)
  const target = formatInfo(to)

  const sentences = [
    `Convert ${source.label} images to ${target.label} without uploading them anywhere.`,
  ]

  if (target.lossy && !source.lossy) {
    sentences.push(
      `${target.label} is a lossy format, so it trades a little detail for a much smaller file — usually the right trade for anything shown on a web page.`,
    )
  } else if (!target.lossy && source.lossy) {
    sentences.push(
      `${target.label} is lossless, so nothing further is discarded. Note that detail already lost when the ${source.label} was created cannot be recovered.`,
    )
  }

  if (losesTransparency(from, to)) {
    sentences.push(
      `${source.label} can store transparency and ${target.label} cannot, so transparent areas become solid. You will be warned before that happens.`,
    )
  }

  if (losesAnimation(from, to)) {
    sentences.push(
      `${source.label} can hold multiple frames and ${target.label} cannot, so only the first frame is kept.`,
    )
  }

  sentences.push('Resize and compress in the same pass rather than running three separate tools.')

  const faq: FaqEntry[] = [
    {
      question: `Are my ${source.label} files uploaded anywhere?`,
      answer: PRIVACY_ANSWER,
    },
    {
      question: `Will converting to ${target.label} reduce quality?`,
      answer: target.lossy
        ? `${target.label} is lossy, so some detail is discarded to save space. At the default quality the difference is not visible at normal viewing size. Lower the quality for smaller files, raise it if you are archiving.`
        : `No. ${target.label} is lossless, so the pixels are preserved exactly. The file may still get smaller, because the encoder finds a more efficient way to store the same image.`,
    },
    {
      question: `Does this keep transparency?`,
      answer: losesTransparency(from, to)
        ? `It cannot. ${target.label} has no transparency channel, so transparent pixels are flattened. Convert to WebP or PNG instead if you need to keep it.`
        : `Yes. ${target.label} supports transparency, so transparent areas are preserved.`,
    },
    {
      question: 'How many files can I convert at once?',
      answer:
        'Up to 50 in one batch. They are processed one at a time so your browser stays responsive, and a file that fails does not stop the rest.',
    },
    { question: 'Is there a cost or a limit?', answer: COST_ANSWER },
  ]

  return { intro: sentences.join(' '), faq }
}

function standaloneContent(tool: ToolDefinition): ToolContent {
  const shared: FaqEntry[] = [
    { question: 'Are my images uploaded anywhere?', answer: PRIVACY_ANSWER },
    { question: 'Is there a cost or a limit?', answer: COST_ANSWER },
  ]

  switch (tool.primary) {
    case 'compress':
      return {
        intro:
          'Make image files smaller without a visible drop in quality. Lossy formats like JPEG and WebP respond to the quality setting; lossless ones like PNG are re-encoded more efficiently instead. Convert and resize in the same pass if you want.',
        faq: [
          {
            question: 'How much smaller will my files get?',
            answer:
              'It depends on the source. A photo straight from a camera often drops by 80% or more with no visible change. A file that is already optimised may barely move — and if re-encoding would make it larger, that is reported rather than hidden.',
          },
          {
            question: 'Why does the quality slider do nothing on my PNG?',
            answer:
              'PNG is lossless, so there is no quality to trade away. To make a PNG substantially smaller, tick Convert format and choose WebP, which typically cuts the size by more than half at the same visual quality.',
          },
          ...shared,
        ],
      }

    case 'resize':
      return {
        intro:
          'Change the pixel dimensions of an image, one file or fifty. Fit inside a box while keeping the aspect ratio, fill a box and centre-crop the overflow, or stretch to exact dimensions. The format stays the same unless you ask to change it.',
        faq: [
          {
            question: 'What is the difference between fit, fill and stretch?',
            answer:
              'Fit scales the whole image to sit inside your box, so the result may be smaller than the box on one side. Fill scales it to cover the box completely and centre-crops what hangs over. Stretch ignores the aspect ratio and distorts the image to match exactly.',
          },
          {
            question: 'Can I enlarge a small image?',
            answer:
              'Yes, by ticking "Allow enlarging" — but enlarging invents pixels that were never captured, so the result looks soft. It is off by default so a small image is left alone rather than blurred.',
          },
          ...shared,
        ],
      }

    case 'rotate':
      return {
        intro:
          'Turn images in 90° steps or mirror them. Photos that arrive sideways are straightened automatically first, using the orientation your camera recorded, so what you see is what you started with.',
        faq: [
          {
            question: 'Why did my photo already look upright before I rotated it?',
            answer:
              'Phone cameras store the image the way the sensor saw it plus a tag saying how to display it. That tag is applied to the actual pixels on load, so the image is upright before you touch anything — and stays upright everywhere, including in apps that ignore the tag.',
          },
          {
            question: 'Does rotating reduce quality?',
            answer:
              'A quarter turn moves pixels without resampling them, so the geometry itself is exact. Any quality change comes from re-encoding the file afterwards, which you control with the quality setting — or avoid entirely by choosing a lossless output format.',
          },
          {
            question: 'Can I rotate by an arbitrary angle, like 5 degrees?',
            answer:
              'Not yet. Off-axis rotation exposes empty corners that have to be filled or cropped, which is a choice worth designing properly rather than guessing at. Right-angle turns and mirroring are supported today.',
          },
          ...shared,
        ],
      }

    default:
      return { intro: tool.metaDescription, faq: shared }
  }
}
