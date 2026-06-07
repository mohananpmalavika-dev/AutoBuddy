import { Platform } from 'react-native';

const DEFAULT_MIME_TYPE = 'application/octet-stream';
const DEFAULT_IMAGE_UPLOAD_MIME_TYPE = 'image/jpeg';
const DEFAULT_IMAGE_UPLOAD_MAX_DIMENSION = 720;
const DEFAULT_IMAGE_UPLOAD_QUALITY = 0.72;

function getAssetName(asset, fallbackName) {
  return String(asset?.name || asset?.fileName || fallbackName || `upload-${Date.now()}`).trim();
}

function getAssetType(asset, fallbackType) {
  return String(asset?.mimeType || asset?.type || asset?.file?.type || fallbackType || DEFAULT_MIME_TYPE).trim();
}

export function getPickerAssetSize(asset) {
  const size = Number(asset?.size || asset?.fileSize || asset?.file?.size || 0);
  return Number.isFinite(size) && size > 0 ? size : 0;
}

function isImageMimeType(mimeType) {
  return String(mimeType || '').toLowerCase().startsWith('image/');
}

function getJpegFileName(fileName) {
  const normalized = String(fileName || `upload-${Date.now()}.jpg`).trim() || `upload-${Date.now()}.jpg`;
  return normalized.replace(/\.[^./\\]+$/, '') + '.jpg';
}

async function readWebAssetBlob(asset) {
  const BlobCtor = globalThis.Blob;
  if (BlobCtor && asset?.file instanceof BlobCtor) {
    return asset.file;
  }

  if (!asset?.uri || typeof fetch !== 'function') {
    return null;
  }

  const response = await fetch(asset.uri);
  return response.blob();
}

function loadImageFromBlob(blob) {
  return new Promise((resolve, reject) => {
    const ImageCtor = globalThis.Image;
    const URLCtor = globalThis.URL;
    if (!ImageCtor || typeof URLCtor?.createObjectURL !== 'function') {
      reject(new Error('Image resizing is unavailable on this browser.'));
      return;
    }

    const objectUrl = URLCtor.createObjectURL(blob);
    const image = new ImageCtor();
    image.onload = () => {
      URLCtor.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URLCtor.revokeObjectURL(objectUrl);
      reject(new Error('Could not read selected image.'));
    };
    image.src = objectUrl;
  });
}

async function resizeWebImageBlob(blob, options = {}) {
  if (typeof document === 'undefined') {
    return null;
  }

  const image = await loadImageFromBlob(blob);
  const sourceWidth = Number(image.naturalWidth || image.width || 0);
  const sourceHeight = Number(image.naturalHeight || image.height || 0);
  if (!sourceWidth || !sourceHeight) {
    return null;
  }

  const maxDimension = Math.max(1, Number(options.maxDimension || DEFAULT_IMAGE_UPLOAD_MAX_DIMENSION));
  const scale = Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight));
  const targetWidth = Math.max(1, Math.round(sourceWidth * scale));
  const targetHeight = Math.max(1, Math.round(sourceHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const context = canvas.getContext('2d');
  if (!context) {
    return null;
  }
  context.drawImage(image, 0, 0, targetWidth, targetHeight);

  const quality = Math.max(0.1, Math.min(1, Number(options.quality || DEFAULT_IMAGE_UPLOAD_QUALITY)));
  const mimeType = options.mimeType || DEFAULT_IMAGE_UPLOAD_MIME_TYPE;
  return new Promise((resolve) => {
    canvas.toBlob((resizedBlob) => resolve(resizedBlob), mimeType, quality);
  });
}

export async function prepareImageAssetForUpload(asset, options = {}) {
  if (Platform.OS !== 'web') {
    return asset;
  }

  const fallbackName = options.fallbackName || asset?.fileName || asset?.name || `upload-${Date.now()}.jpg`;
  const sourceMimeType = getAssetType(asset, options.fallbackType || DEFAULT_IMAGE_UPLOAD_MIME_TYPE);
  if (!isImageMimeType(sourceMimeType) && !isImageMimeType(asset?.file?.type)) {
    return asset;
  }

  const sourceBlob = await readWebAssetBlob(asset);
  if (!sourceBlob || (!isImageMimeType(sourceBlob.type) && !isImageMimeType(sourceMimeType))) {
    return asset;
  }

  try {
    const resizedBlob = await resizeWebImageBlob(sourceBlob, options);
    if (!resizedBlob || (sourceBlob.size && resizedBlob.size >= sourceBlob.size)) {
      return {
        ...asset,
        file: sourceBlob,
        size: sourceBlob.size || getPickerAssetSize(asset),
        mimeType: sourceBlob.type || sourceMimeType,
        type: sourceBlob.type || sourceMimeType,
      };
    }

    const fileName = getJpegFileName(fallbackName);
    const mimeType = resizedBlob.type || options.mimeType || DEFAULT_IMAGE_UPLOAD_MIME_TYPE;
    const FileCtor = globalThis.File;
    const file = FileCtor ? new FileCtor([resizedBlob], fileName, { type: mimeType }) : resizedBlob;
    return {
      ...asset,
      file,
      fileName,
      name: fileName,
      size: resizedBlob.size,
      mimeType,
      type: mimeType,
    };
  } catch {
    return {
      ...asset,
      file: sourceBlob,
      size: sourceBlob.size || getPickerAssetSize(asset),
      mimeType: sourceBlob.type || sourceMimeType,
      type: sourceBlob.type || sourceMimeType,
    };
  }
}

async function appendWebAsset(formData, fieldName, asset, fileName, mimeType) {
  const BlobCtor = globalThis.Blob;
  const FileCtor = globalThis.File;

  if (BlobCtor && asset?.file instanceof BlobCtor) {
    const uploadFile =
      FileCtor && !(asset.file instanceof FileCtor)
        ? new FileCtor([asset.file], fileName, { type: mimeType || asset.file.type || DEFAULT_MIME_TYPE })
        : asset.file;
    formData.append(fieldName, uploadFile, fileName);
    return;
  }

  if (!asset?.uri || typeof fetch !== 'function') {
    throw new Error('Selected file is unavailable for upload.');
  }

  const response = await fetch(asset.uri);
  const blob = await response.blob();
  const resolvedMimeType =
    mimeType && mimeType !== DEFAULT_MIME_TYPE ? mimeType : blob.type || mimeType || DEFAULT_MIME_TYPE;
  const uploadBlob = FileCtor ? new FileCtor([blob], fileName, { type: resolvedMimeType }) : blob;

  formData.append(fieldName, uploadBlob, fileName);
}

export async function appendPickerAssetToFormData(
  formData,
  fieldName,
  asset,
  fallbackName,
  fallbackType = 'application/octet-stream',
) {
  const fileName = getAssetName(asset, fallbackName);
  const mimeType = getAssetType(asset, fallbackType);

  if (Platform.OS === 'web') {
    await appendWebAsset(formData, fieldName, asset, fileName, mimeType);
    return;
  }

  if (!asset?.uri) {
    throw new Error('Selected file is unavailable for upload.');
  }

  formData.append(fieldName, {
    uri: asset.uri,
    type: mimeType,
    name: fileName,
  });
}
