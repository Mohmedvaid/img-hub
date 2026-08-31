import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Testing Library only auto-registers cleanup when vitest globals are on, and they
// are not. Without this every render stacks up and queries find duplicates.
afterEach(cleanup)

/**
 * jsdom has no canvas, no ResizeObserver and no object URLs. Components under test
 * touch all three, so they get the smallest stubs that let real behaviour run.
 * Anything needing genuine pixels is covered by the browser smoke suite instead.
 */

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver

if (!URL.createObjectURL) {
  URL.createObjectURL = () => 'blob:stub'
  URL.revokeObjectURL = () => {}
}

// jsdom's Blob.slice() returns an object without arrayBuffer(), which real browsers
// all provide. Reading it through FileReader gives the same result.
if (typeof Blob !== 'undefined' && !Blob.prototype.arrayBuffer) {
  Blob.prototype.arrayBuffer = function arrayBuffer(this: Blob): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as ArrayBuffer)
      reader.onerror = () => reject(reader.error)
      reader.readAsArrayBuffer(this)
    })
  }
}

/**
 * jsdom implements neither of these, and both are plain data carriers rather than
 * rendering surfaces, so a faithful stub is short and does not fake any behaviour.
 */

if (typeof globalThis.PointerEvent === 'undefined') {
  // Everything the crop overlay reads — clientX, clientY, shiftKey, buttons — is
  // MouseEvent's. Extending it keeps those real rather than hand-assigned.
  class PointerEventStub extends MouseEvent {
    readonly pointerId: number
    readonly pointerType: string

    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init)
      this.pointerId = init.pointerId ?? 1
      this.pointerType = init.pointerType ?? 'mouse'
    }
  }

  globalThis.PointerEvent = PointerEventStub as unknown as typeof PointerEvent
}

if (typeof globalThis.ImageData === 'undefined') {
  class ImageDataStub {
    readonly data: Uint8ClampedArray
    readonly colorSpace = 'srgb' as const

    constructor(
      readonly width: number,
      readonly height: number,
    ) {
      this.data = new Uint8ClampedArray(width * height * 4)
    }
  }

  globalThis.ImageData = ImageDataStub as unknown as typeof ImageData
}
