import type { AppError, ErrorCode } from "../../types/domain";

interface ErrorCopy {
  title: string;
  guidance: string;
}

const COPY: Record<ErrorCode, ErrorCopy> = {
  INVALID_REQUEST: { title: "対応していません", guidance: "対応する画像または対応書庫を選んでください。" },
  INVALID_PATH: { title: "対応していません", guidance: "対応する画像または対応書庫を選んでください。" },
  OUTSIDE_LIBRARY_ROOT: { title: "対応していません", guidance: "ライブラリルート内の対象を選んでください。" },
  NOT_FOUND: { title: "見つかりません", guidance: "対象が移動または削除された可能性があります。" },
  ACCESS_DENIED: { title: "アクセスできません", guidance: "権限または他のアプリによる使用状況を確認してください。" },
  UNSUPPORTED_FORMAT: { title: "対応していません", guidance: "対応する画像または対応書庫を選んでください。" },
  CORRUPT_IMAGE: { title: "データが破損しています", guidance: "ファイルを読み込めません。" },
  CORRUPT_ARCHIVE: { title: "データが破損しています", guidance: "ファイルを読み込めません。" },
  ENCRYPTED_ARCHIVE: { title: "暗号化されています", guidance: "暗号化された書庫は開けません。" },
  RESOURCE_LIMIT: { title: "一時的に使用できません", guidance: "しばらくしてから再試行してください。" },
  CANCELLED: { title: "一時的に使用できません", guidance: "しばらくしてから再試行してください。" },
  INTERNAL: { title: "一時的に使用できません", guidance: "しばらくしてから再試行してください。" },
};

export function presentError(error: Pick<AppError, "code">): string {
  const copy = COPY[error.code];
  return `${copy.title}。${copy.guidance}`;
}

export function presentUnexpectedError(): string {
  return "一時的に使用できません。しばらくしてから再試行してください。";
}
