import { rejectLocalApiInCloudMode } from "../../../lib/server/local-data-api.ts";
import { resolveDataRootDir } from "../../../lib/server/prompt-database.ts";
import {
  getRuntimeConfigurationError,
  isSupabaseDataMode,
} from "../../../lib/server/runtime-config.ts";
import { uploadSourcePackageToCloud } from "../../../lib/source-package-cloud.ts";
import {
  createSourcePackageUploadId,
  readSourcePackageUpload,
  removeSourcePackageUpload,
  saveSourcePackageUpload,
} from "../../../lib/server/source-package-storage.ts";
import {
  SOURCE_PACKAGE_UPLOAD_LIMITS,
  validateSourcePackageFile,
} from "../../../lib/source-package-upload.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 请求体上限：给 ZIP 的 20 MB 留一点 multipart 头的余量
const MAX_REQUEST_BYTES = SOURCE_PACKAGE_UPLOAD_LIMITS.zipBytes + 1024 * 1024;

function createErrorResponse(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

function isUploadId(value: string) {
  return /^upload-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}

// 本地和云端共用同一套「读文件 + 校验」：两边只是存原文的地方不同。
type UploadRequestResult =
  | {
      filename: string;
      kind: string;
      bytes: Uint8Array;
      contentType: string;
    }
  | { error: Response };

async function readUploadRequest(
  request: Request,
): Promise<UploadRequestResult> {
  const declaredLength = Number(request.headers.get("content-length") ?? "0");

  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
    return {
      error: createErrorResponse("ZIP 包超过 20 MB 上限，请拆分后再上传。", 413),
    };
  }

  let form: FormData;

  try {
    form = await request.formData();
  } catch {
    return {
      error: createErrorResponse("请求内容不是有效的文件上传。", 400),
    };
  }

  const file = form.get("file");

  if (!(file instanceof File)) {
    return { error: createErrorResponse("没有收到文件。", 400) };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const validation = validateSourcePackageFile({
    filename: file.name,
    byteSize: bytes.byteLength,
    head: bytes.slice(0, 4),
  });

  if (!validation.ok) {
    return { error: createErrorResponse(validation.message, 400) };
  }

  return {
    filename: validation.filename,
    kind: validation.kind,
    bytes,
    contentType: file.type,
  };
}

// 上传只把原文落到来源目录，不写资产。
// 资产和项目要等用户在草稿预览里确认之后才创建。
export async function POST(request: Request) {
  if (isSupabaseDataMode()) {
    const configurationError = getRuntimeConfigurationError();

    if (configurationError) {
      return createErrorResponse(configurationError, 503);
    }

    const upload = await readUploadRequest(request);

    if ("error" in upload) {
      return upload.error;
    }

    const { getSupabaseServerClient } = await import(
      "../../../lib/supabase/server.ts"
    );
    const client = await getSupabaseServerClient();
    const {
      data: { user },
    } = await client.auth.getUser();

    if (!user) {
      return createErrorResponse("请先登录再导入文档包。", 401);
    }

    try {
      const uploadId = createSourcePackageUploadId();
      const uploaded = await uploadSourcePackageToCloud(client, {
        userId: user.id,
        uploadId,
        filename: upload.filename,
        bytes: upload.bytes,
        ...(upload.contentType ? { contentType: upload.contentType } : {}),
      });

      return Response.json(
        {
          upload: {
            uploadId,
            filename: upload.filename,
            kind: upload.kind,
            storedPath: uploaded.storedPath,
            byteSize: uploaded.byteSize,
            uploadedAt: new Date().toISOString(),
          },
        },
        { status: 201 },
      );
    } catch (error) {
      console.error("上传来源包原文到云端失败", error);
      return createErrorResponse(
        error instanceof Error ? error.message : "上传原文失败。",
        500,
      );
    }
  }

  const cloudModeError = rejectLocalApiInCloudMode();

  if (cloudModeError) {
    return cloudModeError;
  }

  const upload = await readUploadRequest(request);

  if ("error" in upload) {
    return upload.error;
  }

  try {
    const uploadId = createSourcePackageUploadId();
    const saved = await saveSourcePackageUpload({
      dataRootDir: resolveDataRootDir(),
      uploadId,
      filename: upload.filename,
      bytes: upload.bytes,
    });

    return Response.json(
      {
        upload: {
          uploadId,
          filename: upload.filename,
          kind: upload.kind,
          storedPath: saved.relativePath,
          byteSize: saved.byteSize,
          uploadedAt: new Date().toISOString(),
        },
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("保存来源包原文失败", error);
    return createErrorResponse("保存原文失败。", 500);
  }
}

// 按先前的相对路径把原文取回来，供「可下载查看」使用
export async function GET(request: Request) {
  const cloudModeError = rejectLocalApiInCloudMode();

  if (cloudModeError) {
    return cloudModeError;
  }

  const storedPath = new URL(request.url).searchParams.get("path");

  if (!storedPath) {
    return createErrorResponse("缺少原文路径。", 400);
  }

  try {
    const bytes = await readSourcePackageUpload(resolveDataRootDir(), storedPath);
    const filename = storedPath.split("/").pop() ?? "来源包";

    return new Response(bytes, {
      headers: {
        "content-type": "application/octet-stream",
        "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      },
    });
  } catch {
    return createErrorResponse("找不到这份原文。", 404);
  }
}

// 放弃一次上传：确认创建之前用户取消，就把暂存的原文删掉
export async function DELETE(request: Request) {
  const cloudModeError = rejectLocalApiInCloudMode();

  if (cloudModeError) {
    return cloudModeError;
  }

  const uploadId = new URL(request.url).searchParams.get("uploadId");

  if (!uploadId || !isUploadId(uploadId)) {
    return createErrorResponse("上传编号无效。", 400);
  }

  try {
    await removeSourcePackageUpload(resolveDataRootDir(), uploadId);

    return Response.json({ removed: true });
  } catch (error) {
    console.error("删除来源包原文失败", error);
    return createErrorResponse("删除原文失败。", 500);
  }
}
