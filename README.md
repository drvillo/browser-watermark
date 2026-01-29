# @drvillo/browser-watermark

Browser-only invisible watermarking library using DCT (Discrete Cosine Transform) for document images.

## Features

- **Browser-only**: No backend required, all processing happens client-side
- **Invisible**: Watermarks are embedded in frequency domain, not visible to the eye
- **Robust**: Survives JPEG recompression, resizing, and minor cropping
- **Minimal API**: Simple `watermark()` and `verify()` functions
- **TypeScript**: Full type definitions included

## Installation

```bash
pnpm add @drvillo/browser-watermark
```

## Usage

### Watermarking

```typescript
import { watermark } from '@drvillo/browser-watermark';

const imageFile = document.querySelector('input[type="file"]').files[0];
const payload = 'unique-event-id-12345';

const result = await watermark(imageFile, payload);

// result.blob contains the watermarked image
// result.width, result.height, result.mimeType are also available
```

### Verification

```typescript
import { verify } from '@drvillo/browser-watermark';

const suspectImage = document.querySelector('input[type="file"]').files[0];
const expectedPayload = 'unique-event-id-12345';

const result = await verify(suspectImage, expectedPayload);

if (result.isMatch) {
  console.log(`Match found! Confidence: ${result.confidence}`);
} else {
  console.log('No match found');
}
```

### Supported Input Types

The library accepts various image input types:

- `File` or `Blob`
- `HTMLImageElement`
- `HTMLCanvasElement`
- `ImageData`
- `ArrayBuffer` or `Uint8Array` (encoded image bytes)

### Debug API

For debugging purposes, you can extract the watermark digest without verification:

```typescript
import { extract } from '@drvillo/browser-watermark/debug';

const result = await extract(imageFile);
console.log(`Recovered digest: ${result.digestHex}`);
console.log(`Confidence: ${result.confidence}`);
```

## Demo

Run the demo locally:

```bash
pnpm install
pnpm demo
```

This will start a Vite dev server (usually at `http://localhost:5173`) that automatically opens the demo in your browser. The demo allows you to:

- Upload an image and watermark it with a payload
- Download the watermarked image
- Verify if an image contains a watermark for a given payload

## Development

```bash
# Install dependencies
pnpm install

# Build
pnpm build

# Run all tests
pnpm test

# Run unit tests (Node/jsdom)
pnpm test:unit

# Run browser tests (real browser APIs)
pnpm test:browser

# Type check
pnpm typecheck
```

## How It Works

The library uses block-based DCT (Discrete Cosine Transform) watermarking, a technique that embeds information in the frequency domain of an image rather than its pixels. This makes the watermark invisible to the human eye and robust against common image manipulations.

### Watermarking Pipeline

1.  **Payload Processing**: The payload string is hashed using SHA-256 (via Web Crypto API), and the first 64 bits are extracted as the watermark digest.
2.  **Error Correction (ECC)**: To ensure robustness, bits are encoded using repetition coding (3x redundancy) with majority vote decoding.
3.  **Image Decoding**: The input image is decoded to RGBA and the luminance (Y) channel is extracted for processing.
4.  **Frequency Transformation**: The image is partitioned into 8x8 blocks, and each block is transformed using a 2D DCT-II.
5.  **Embedding**: Bits are spread across multiple blocks using a seeded PRNG for deterministic selection. The watermark is embedded by modulating the signs of mid-frequency coefficients.
6.  **Reconstruction**: An Inverse DCT (IDCT) is applied to reconstruct the luminance channel, which is then merged back with the original chrominance data.
7.  **Encoding**: The final image is encoded back to its original format (JPEG, PNG, or WebP).

### Verification Pipeline

1.  **Extraction**: The suspect image is decoded and transformed into the frequency domain using the same 8x8 DCT process.
2.  **Bit Recovery**: Using the same seeded PRNG, the library recovers the embedded bits from the mid-frequency coefficients.
3.  **ECC Decoding**: Majority voting is used to reconstruct the original 64-bit digest from the redundant bits.
4.  **Comparison**: The recovered digest is compared against the digest of the expected payload.
5.  **Confidence Scoring**: A confidence score is calculated based on the bit-match ratio. A match is typically confirmed if confidence exceeds 0.85.

## Understanding Confidence Levels

The `verify()` function returns a `confidence` score between 0 and 1, representing how reliably the watermark was recovered. A match is confirmed when confidence meets the threshold (default: 0.85) **and** the recovered watermark matches the expected payload.

### What Affects Confidence?

| Factor | Impact | Recommendation |
|--------|--------|----------------|
| **Image size** | Small images (< 200×200) have significantly lower confidence due to reduced redundancy | Use images at least 256×256 pixels |
| **JPEG compression** | Each compression cycle degrades the watermark | Prefer PNG for maximum reliability, or limit re-compression cycles |
| **Image content** | High-frequency textures (grass, fabric, noise) can interfere with watermark recovery | Works best on document-style images with moderate detail |
| **Resizing/scaling** | Destroys watermark alignment | Avoid resizing watermarked images |
| **Cropping** | Removes watermark data | Avoid cropping, or watermark the full image before any cropping |
| **Format conversion** | Lossy conversions (PNG→JPEG→WebP) compound degradation | Minimize format conversions |

### Typical Confidence Ranges

- **0.95–1.0**: Excellent – image is unmodified or losslessly processed
- **0.85–0.95**: Good – image may have been JPEG compressed once
- **0.70–0.85**: Marginal – multiple compressions or small image size
- **< 0.70**: Poor – watermark likely degraded beyond reliable recovery

### When Verification May Fail (False Negatives)

Even if an image was correctly watermarked with the payload, verification can fail due to:

1. **Heavy compression**: Social media platforms often re-encode images at low quality
2. **Very small images**: Insufficient blocks for robust embedding
3. **Multiple processing steps**: Each save/export cycle accumulates errors
4. **Geometric changes**: Any resizing, rotation, or cropping

### Interpreting Results

```typescript
const result = await verify(image, payload);

if (result.isMatch) {
  // High confidence match
  console.log('Verified!');
} else if (result.confidence > 0.7) {
  // Watermark detected but degraded - may warrant manual review
  console.log('Possible match, but confidence is low');
} else {
  // No reliable watermark found
  console.log('No match');
}
```

## Configuration

Both `watermark()` and `verify()` accept an optional options parameter for per-call configuration. This follows the standard pattern used by modern TypeScript libraries—no global state, fully testable, and with excellent IDE autocomplete support.

### Watermark Options

```typescript
import { watermark } from '@drvillo/browser-watermark';

const result = await watermark(imageFile, 'my-payload', {
  // Quality for JPEG/WebP output (0-1). Default: 0.92
  // Higher values = better quality, larger files, more robust watermark
  jpegQuality: 0.95,
});
```

### Verify Options

```typescript
import { verify } from '@drvillo/browser-watermark';

const result = await verify(imageFile, 'my-payload', {
  // Confidence threshold for isMatch (0-1). Default: 0.85
  // Lower values = more permissive, may increase false positives
  threshold: 0.75,
});
```

### Default Values

The library exports a `defaults` object so you can reference or extend the default values:

```typescript
import { defaults } from '@drvillo/browser-watermark';

console.log(defaults.MATCH_THRESHOLD); // 0.85
console.log(defaults.JPEG_QUALITY);    // 0.92
console.log(defaults.PAYLOAD_BITS);    // 64
console.log(defaults.BLOCK_SIZE);      // 8
```

| Constant | Default | Description |
|----------|---------|-------------|
| `MATCH_THRESHOLD` | `0.85` | Minimum confidence required for `isMatch` to be `true` |
| `JPEG_QUALITY` | `0.92` | Quality setting when outputting JPEG/WebP images |
| `PAYLOAD_BITS` | `64` | Number of bits extracted from payload hash (not configurable) |
| `BLOCK_SIZE` | `8` | DCT block size in pixels (not configurable) |

> **Note**: `PAYLOAD_BITS` and `BLOCK_SIZE` are internal algorithm parameters and cannot be changed at runtime. Modifying these would break compatibility between watermarking and verification.

### TypeScript Support

All options are fully typed with JSDoc comments:

```typescript
import type { WatermarkOptions, VerifyOptions } from '@drvillo/browser-watermark';

const watermarkOpts: WatermarkOptions = { jpegQuality: 0.95 };
const verifyOpts: VerifyOptions = { threshold: 0.80 };
```

## Limitations

- Watermarks may degrade with heavy compression or aggressive transformations
- Not designed to resist determined adversaries with advanced forensics tools
- v1 focuses on images only (PDFs can be supported by converting pages to images)

## License

MIT
