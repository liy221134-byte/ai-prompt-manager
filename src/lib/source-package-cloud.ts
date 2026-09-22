// 来源包原文在云端的存放：私有桶 source-packages，
// 路径第一段固定是用户 id，配合桶策略实现账号之间的隔离。

import type { SupabaseClient } from "@supabase/supabase-js";

export const SOURCE_PACKAGE_BUCKET = "source-packages";

export type SourcePackageUploadTarget = {
  userId: string;
  uploadId: string;
  filename: string;
};

export function createCloudSourcePackagePath(input: SourcePackageUploadTarget) {
  return `${input.userId}/${input.uploadId}/${input.filename}`;
}

function sourcePackageFolder(userId: string, uploadId: string) {
  return `${userId}/${uploadId}`;
}

export async function uploadSourcePackageToCloud(
  client: SupabaseClient,
  input: SourcePackageUploadTarget & {
    bytes: Uint8Array;
    contentType?: string;
  },
) {
  const storedPath = createCloudSourcePackagePath(input);
  const { error } = await client.storage
    .from(SOURCE_PACKAGE_BUCKET)
    .upload(storedPath, input.bytes, {
      contentType: input.contentType,
      // 同一路径不覆盖：上传编号是新的，覆盖只会发生在异常情况
      upsert: false,
    });

  if (error) {
    throw new Error("上传原文到云端失败。");
  }

  return { storedPath, byteSize: input.bytes.byteLength };
}

// 私有桶不能直链下载，给一个短时效的签名地址
export async function createSourcePackageDownloadUrl(
  client: SupabaseClient,
  storedPath: string,
  expiresInSeconds = 300,
) {
  const { data, error } = await client.storage
    .from(SOURCE_PACKAGE_BUCKET)
    .createSignedUrl(storedPath, expiresInSeconds);

  if (error || !data?.signedUrl) {
    throw new Error("获取原文下载地址失败。");
  }

  return data.signedUrl;
}

// 放弃一次未确认的上传：先列出该上传目录，再整批删除
export async function removeCloudSourcePackageUpload(
  client: SupabaseClient,
  input: { userId: string; uploadId: string },
) {
  const folder = sourcePackageFolder(input.userId, input.uploadId);
  const { data, error } = await client.storage
    .from(SOURCE_PACKAGE_BUCKET)
    .list(folder);

  if (error) {
    throw new Error("读取云端原文列表失败。");
  }

  const paths = (data ?? []).map((item) => `${folder}/${item.name}`);

  if (paths.length === 0) {
    return { removed: 0 };
  }

  const { error: removeError } = await client.storage
    .from(SOURCE_PACKAGE_BUCKET)
    .remove(paths);

  if (removeError) {
    throw new Error("删除云端原文失败。");
  }

  return { removed: paths.length };
}
