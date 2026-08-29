import type { DiagnosticReport } from "../library/client";

interface LibraryDiagnosticsDialogProps {
  open: boolean;
  loading: boolean;
  report: DiagnosticReport | null;
  notice: string | null;
  onClose: () => void;
  onCancel: () => void;
  onRetry: () => void;
}

function statusLabel(status: DiagnosticReport["findings"][number]["status"]): string {
  switch (status) {
    case "added": return "追加";
    case "changed": return "変更";
    case "missing": return "欠落";
    case "duplicate": return "重複";
    case "corrupt": return "破損書庫";
  }
}

function severityLabel(severity: DiagnosticReport["findings"][number]["severity"]): string {
  switch (severity) {
    case "info": return "情報";
    case "warning": return "警告";
    case "error": return "エラー";
  }
}

export function LibraryDiagnosticsDialog({
  open,
  loading,
  report,
  notice,
  onClose,
  onCancel,
  onRetry,
}: LibraryDiagnosticsDialogProps) {
  if (!open && !loading && notice === null) return null;
  return (
    <div className="dialog-backdrop">
      <section className="diagnostic-panel" role="dialog" aria-modal="true" aria-label="ライブラリ診断" aria-busy={loading}>
        <div className="diagnostic-panel-heading">
          <h2>ライブラリ診断</h2>
          <button type="button" onClick={onClose}>閉じる</button>
        </div>
        <section className="diagnostic-explanation" aria-labelledby="diagnostic-purpose-title">
          <h3 id="diagnostic-purpose-title">何をする機能ですか？</h3>
          <p>ライブラリ内を読み取り専用で確認し、前回の診断結果からの追加・変更・欠落、重複した項目、開けない対応書庫を一覧します。</p>
          <p>作品ファイルは変更・削除せず、外部へ送信しません。初回は比較用の基準を作るため、項目が「追加」と表示されることがあります。</p>
        </section>
        {loading && (
          <div className="diagnostic-progress" role="status" aria-live="polite" data-diagnostic-loading="true">
            <span className="diagnostic-activity-indicator" data-diagnostic-activity="indeterminate" aria-hidden="true" />
            <div className="diagnostic-progress-copy">
              <strong>診断を実行中です</strong>
              <span>ライブラリの構成と対応書庫を確認しています。完了までこの表示が動き続けます。</span>
            </div>
            <button type="button" onClick={onCancel}>診断をキャンセル</button>
          </div>
        )}
        {notice !== null && <p role="alert" data-diagnostic-notice="true">{notice}</p>}
        {report !== null && (
          <>
            <p data-diagnostic-summary data-scanned-count={report.summary.scanned} data-finding-count={report.summary.findings}>
              検査 {report.summary.scanned}項目、問題 {report.summary.findings}件
              （追加 {report.summary.added} / 変更 {report.summary.changed} / 欠落 {report.summary.missing} /
              重複 {report.summary.duplicates} / 破損 {report.summary.corrupt}）
            </p>
            {report.findings.length === 0 ? <p role="status">問題は見つかりませんでした。</p> : (
              <ul aria-label="診断結果">
                {report.findings.map((finding, index) => (
                  <li
                    key={`${finding.itemIdentity}-${finding.status}-${index}`}
                    data-diagnostic-status={finding.status}
                    data-diagnostic-severity={finding.severity}
                    data-diagnostic-path={finding.relativePath ?? finding.itemIdentity}
                  >
                    <span>{finding.relativePath ?? finding.itemIdentity}</span>
                    <span>{statusLabel(finding.status)}</span>
                    <span>{severityLabel(finding.severity)}</span>
                    <span>{finding.message}</span>
                  </li>
                ))}
              </ul>
            )}
            <button type="button" onClick={onRetry}>診断を再実行</button>
          </>
        )}
        {report === null && !loading && notice === null && <p role="status">診断結果はまだありません。</p>}
      </section>
    </div>
  );
}
