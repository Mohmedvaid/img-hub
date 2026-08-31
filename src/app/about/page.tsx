import { brand } from '@config/brand'
import { findLegalPage } from '@config/legal'
import { limits } from '@config/limits'
import { liveTools } from '@config/tools'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { formatInfo } from '@/lib/pipeline/formats'
import { buildMetadata } from '@/lib/seo/metadata'

const page = findLegalPage('about')
if (!page) throw new Error('the about page is missing from config/legal.ts')

export const metadata = buildMetadata({
  title: page.metaTitle,
  description: page.metaDescription,
  path: '/about',
  indexable: page.indexable,
})

export default function AboutPage() {
  const entry = findLegalPage('about')
  if (!entry) notFound()

  const inputFormats = limits.inputFormats.map((format) => formatInfo(format).label).join(', ')

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-12 sm:px-6">
      <h1 className="font-semibold text-2xl text-fg-primary tracking-tight sm:text-3xl">
        {entry.title}
      </h1>

      <div className="mt-6 flex flex-col gap-5 text-fg-secondary leading-relaxed">
        <p>
          {brand.name} is a set of image tools that run entirely inside your browser. Convert,
          compress, resize, crop, rotate and strip metadata — in one pass, on your own device.
          Nothing is uploaded, there is no account, and there is no cost.
        </p>

        <h2 className="mt-4 font-medium text-fg-primary text-lg">Why it works this way</h2>

        <p>
          Every other tool in this category asks you to upload your photos to a server, waits,
          processes them there, and sends them back. That design has three problems. Your files end
          up on someone else&rsquo;s machine. You wait twice for the network. And the person running
          it pays for every image, which is why those sites are covered in upsells or quietly cap
          what you can do.
        </p>

        <p>
          Browsers can now do the whole job locally. {brand.name} decodes with the browser&rsquo;s
          own image decoder and encodes with WebAssembly builds of MozJPEG, libwebp and libpng, all
          running in a background thread so the page keeps responding. The result is that your files
          never leave your device, there is no queue, and the marginal cost of a visitor is zero.
          That last part is why this can stay free without a catch.
        </p>

        <p>
          You do not have to take that on trust. Open your browser&rsquo;s developer tools, watch
          the network tab, and run a file through. Nothing goes out.
        </p>

        <h2 className="mt-4 font-medium text-fg-primary text-lg">What it does</h2>

        <p>
          The tools are combinable rather than separate. Most sites make you convert on one page,
          then compress on another, re-uploading in between. Here you tick what you want and it
          happens in a single pass, in an order chosen so the result is right: rotate, crop, resize,
          strip metadata, then encode.
        </p>

        <p>
          It reads {inputFormats}, and writes{' '}
          {limits.outputFormats.map((format) => formatInfo(format).label).join(', ')}. Batches run
          up to {limits.maxFilesPerBatch} files, and one corrupt file never takes the rest down with
          it.
        </p>

        <h2 className="mt-4 font-medium text-fg-primary text-lg">Limits worth knowing</h2>

        <p>
          Because the work happens on your device, your device is the constraint. Very large files
          or very large batches will be slower on a phone than on a laptop, and a twelve-megapixel
          image takes a moment to encode. Files over{' '}
          {Math.round(limits.maxFileBytes / (1024 * 1024))} MB are refused rather than crashing the
          tab. Images are converted to sRGB, which is correct for anything headed to the web but not
          for colour-managed print work.
        </p>

        <h2 className="mt-4 font-medium text-fg-primary text-lg">Who builds it</h2>

        <p>
          {brand.name} is built and maintained by {brand.legalEntity}. If something is broken,
          confusing, or missing,{' '}
          <Link href="/contact" className="text-brand underline underline-offset-2">
            get in touch
          </Link>{' '}
          — bug reports from people who hit a real file that would not convert are the most useful
          thing anyone sends.
        </p>

        <p>
          There are {liveTools().length} tool pages plus{' '}
          <Link href="/" className="text-brand underline underline-offset-2">
            the full builder
          </Link>
          , which combines any of them.
        </p>
      </div>
    </main>
  )
}
