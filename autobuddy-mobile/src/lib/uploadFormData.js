import { Platform } from 'react-native';

const DEFAULT_MIME_TYPE = 'application/octet-stream';

function getAssetName(asset, fallbackName) {
  return String(asset?.name || asset?.fileName || fallbackName || `upload-${Date.now()}`).trim();
}

function getAssetType(asset, fallbackType) {
  return String(asset?.mimeType || asset?.type || asset?.file?.type || fallbackType || DEFAULT_MIME_TYPE).trim();
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
