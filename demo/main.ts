import { watermark, verify, type VisibleWatermarkPosition } from '../src/index';

const imageInput = document.getElementById('imageInput') as HTMLInputElement;
const payloadInput = document.getElementById('payloadInput') as HTMLInputElement;
const watermarkBtn = document.getElementById('watermarkBtn') as HTMLButtonElement;
const downloadBtn = document.getElementById('downloadBtn') as HTMLButtonElement;
const watermarkPreview = document.getElementById('watermarkPreview') as HTMLDivElement;
const watermarkStatus = document.getElementById('watermarkStatus') as HTMLDivElement;

// Visible watermark controls
const visibleEnabled = document.getElementById('visibleEnabled') as HTMLInputElement;
const visibleOptions = document.getElementById('visibleOptions') as HTMLDivElement;
const visiblePosition = document.getElementById('visiblePosition') as HTMLSelectElement;
const visibleOpacity = document.getElementById('visibleOpacity') as HTMLInputElement;
const opacityValue = document.getElementById('opacityValue') as HTMLSpanElement;
const visibleTwoLines = document.getElementById('visibleTwoLines') as HTMLInputElement;

const verifyImageInput = document.getElementById('verifyImageInput') as HTMLInputElement;
const verifyPayloadInput = document.getElementById('verifyPayloadInput') as HTMLInputElement;
const verifyBtn = document.getElementById('verifyBtn') as HTMLButtonElement;
const verifyPreview = document.getElementById('verifyPreview') as HTMLDivElement;
const verifyResult = document.getElementById('verifyResult') as HTMLDivElement;
const verifyStatus = document.getElementById('verifyStatus') as HTMLDivElement;

let watermarkedBlob: Blob | null = null;

function updatePreview(file: File, container: HTMLDivElement) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = document.createElement('img');
    img.src = e.target?.result as string;
    container.innerHTML = '';
    container.appendChild(img);
  };
  reader.readAsDataURL(file);
}

// Toggle visible options panel
visibleEnabled.addEventListener('change', () => {
  visibleOptions.classList.toggle('hidden', !visibleEnabled.checked);
});

// Update opacity display
visibleOpacity.addEventListener('input', () => {
  opacityValue.textContent = `${visibleOpacity.value}%`;
});

imageInput.addEventListener('change', (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (file) {
    updatePreview(file, watermarkPreview);
    watermarkBtn.disabled = false;
    watermarkStatus.textContent = `Loaded: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
  }
});

watermarkBtn.addEventListener('click', async () => {
  const file = imageInput.files?.[0];
  if (!file) return;

  const payload = payloadInput.value.trim();
  if (!payload) {
    watermarkStatus.textContent = 'Please enter a payload';
    return;
  }

  watermarkBtn.disabled = true;
  watermarkStatus.textContent = 'Processing...';

  try {
    const result = await watermark(file, payload, {
      visible: visibleEnabled.checked
        ? {
            enabled: true,
            position: visiblePosition.value as VisibleWatermarkPosition,
            opacity: parseInt(visibleOpacity.value, 10) / 100,
            lineLimit: visibleTwoLines.checked ? 2 : 1,
          }
        : undefined,
    });
    watermarkedBlob = result.blob;

    const url = URL.createObjectURL(result.blob);
    const img = document.createElement('img');
    img.src = url;
    watermarkPreview.innerHTML = '';
    watermarkPreview.appendChild(img);

    downloadBtn.disabled = false;
    watermarkStatus.textContent = `Watermarked! Size: ${(result.blob.size / 1024).toFixed(1)} KB, Format: ${result.mimeType}`;
  } catch (error) {
    watermarkStatus.textContent = `Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
  } finally {
    watermarkBtn.disabled = false;
  }
});

downloadBtn.addEventListener('click', () => {
  if (!watermarkedBlob) return;

  const url = URL.createObjectURL(watermarkedBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `watermarked-${Date.now()}.${watermarkedBlob.type.split('/')[1]}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});

verifyImageInput.addEventListener('change', (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (file) {
    updatePreview(file, verifyPreview);
    verifyBtn.disabled = false;
    verifyStatus.textContent = `Loaded: ${file.name}`;
  }
});

verifyBtn.addEventListener('click', async () => {
  const file = verifyImageInput.files?.[0];
  if (!file) return;

  const payload = verifyPayloadInput.value.trim();
  if (!payload) {
    verifyStatus.textContent = 'Please enter expected payload';
    return;
  }

  verifyBtn.disabled = true;
  verifyStatus.textContent = 'Verifying...';
  verifyResult.style.display = 'none';

  try {
    const result = await verify(file, payload);

    verifyResult.style.display = 'block';
    verifyResult.className = `result ${result.isMatch ? 'success' : 'error'}`;

    const confidenceClass = result.confidence >= 0.85 ? 'high' : result.confidence >= 0.5 ? 'medium' : 'low';
    const confidenceText = (result.confidence * 100).toFixed(1);

    verifyResult.innerHTML = `
      <h3>${result.isMatch ? '✓ Match Found' : '✗ No Match'}</h3>
      <div class="confidence ${confidenceClass}">Confidence: ${confidenceText}%</div>
      <div style="margin-top: 0.5rem; font-size: 0.9rem;">
        Threshold: ${(0.85 * 100).toFixed(0)}%
      </div>
    `;

    verifyStatus.textContent = result.isMatch
      ? 'Watermark verified successfully!'
      : 'Watermark verification failed.';
  } catch (error) {
    verifyStatus.textContent = `Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
    verifyResult.style.display = 'none';
  } finally {
    verifyBtn.disabled = false;
  }
});
