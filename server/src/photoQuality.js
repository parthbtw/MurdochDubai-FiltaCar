import sharp from 'sharp'
import { SHARPNESS_THRESHOLD } from './config.js'

// Feature 9: photo quality check. Greyscale, resize to max 1000 px wide,
// then Laplacian variance as the sharpness score. Below the threshold the
// photo is marked blurry. The Laplacian is computed on the raw pixels
// because sharp clamps negative convolution results to zero.
export async function checkPhotoQuality(filePath) {
  const { data, info } = await sharp(filePath)
    .greyscale()
    .resize({ width: 1000, withoutEnlargement: true })
    .raw()
    .toBuffer({ resolveWithObject: true })

  const { width, height } = info
  let sum = 0
  let count = 0
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x
      const laplacian =
        -4 * data[i] +
        data[i - 1] +
        data[i + 1] +
        data[i - width] +
        data[i + width]
      sum += laplacian
      count++
    }
  }
  const mean = count > 0 ? sum / count : 0
  let squaredDiffSum = 0
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x
      const laplacian =
        -4 * data[i] +
        data[i - 1] +
        data[i + 1] +
        data[i - width] +
        data[i + width]
      const diff = laplacian - mean
      squaredDiffSum += diff * diff
    }
  }
  const variance = count > 0 ? squaredDiffSum / count : 0

  return {
    sharpness: Math.round(variance * 100) / 100,
    blurry: variance < SHARPNESS_THRESHOLD,
  }
}
