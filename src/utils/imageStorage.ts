import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../firebase';

/**
 * Utility to compress an image (dataURL, base64, or image blob) using HTMLCanvas
 * before uploading to Firebase Storage.
 */
export async function compressImage(
  imageSource: string,
  maxWidth = 1600,
  maxHeight = 2200,
  quality = 0.8
): Promise<Blob> {
  // If it's an SVG data URL, we can convert directly to PNG/JPEG or upload directly
  if (imageSource.startsWith('data:image/svg+xml')) {
    return new Blob([imageSource], { type: 'image/svg+xml' });
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      let width = img.width;
      let height = img.height;

      // Maintain aspect ratio while scaling down if exceeding bounds
      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }
      if (height > maxHeight) {
        width = Math.round((width * maxHeight) / height);
        height = maxHeight;
      }

      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, width);
      canvas.height = Math.max(1, height);

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        // Fallback to fetch blob
        fetch(imageSource)
          .then((res) => res.blob())
          .then(resolve)
          .catch(reject);
        return;
      }

      // Draw white background in case image has transparency
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            // Fallback
            fetch(imageSource)
              .then((res) => res.blob())
              .then(resolve)
              .catch(reject);
          }
        },
        'image/jpeg',
        quality
      );
    };

    img.onerror = () => {
      // If image element fails (e.g. raw blob or data), attempt direct fetch
      fetch(imageSource)
        .then((res) => res.blob())
        .then(resolve)
        .catch((err) => reject(new Error('Failed to load image for compression: ' + err)));
    };

    img.src = imageSource;
  });
}

/**
 * Upload a single page image to Firebase Storage and return its public download URL.
 * Skips upload if the image is already a remote HTTP/HTTPS URL.
 */
export async function uploadPaperPageImage(
  paperId: string,
  pageIndex: number,
  imageSource: string
): Promise<string> {
  if (!imageSource || typeof imageSource !== 'string') {
    return '';
  }

  // Already a remote Firebase Storage or CDN URL
  if (imageSource.startsWith('http://') || imageSource.startsWith('https://')) {
    return imageSource;
  }

  try {
    const compressedBlob = await compressImage(imageSource);
    const filename = `page_${pageIndex + 1}_${Date.now()}.jpg`;
    const storagePath = `papers/${paperId}/${filename}`;
    const storageRef = ref(storage, storagePath);

    const snapshot = await uploadBytes(storageRef, compressedBlob, {
      contentType: compressedBlob.type || 'image/jpeg',
      customMetadata: {
        paperId,
        pageIndex: String(pageIndex),
        uploadedAt: new Date().toISOString(),
      },
    });

    const downloadUrl = await getDownloadURL(snapshot.ref);
    return downloadUrl;
  } catch (err) {
    console.warn(`[Storage] Failed to upload image for paper ${paperId} page ${pageIndex}:`, err);
    // If upload fails, return original so user work is never lost
    return imageSource;
  }
}

/**
 * Upload all page images of a paper to Firebase Storage, returning an array of download URLs.
 */
export async function uploadPaperImages(
  paperId: string,
  images: string[]
): Promise<string[]> {
  if (!images || images.length === 0) return [];

  const uploadPromises = images.map((img, index) =>
    uploadPaperPageImage(paperId, index, img)
  );

  return Promise.all(uploadPromises);
}
