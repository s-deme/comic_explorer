use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

#[test]
fn product_process_flushes_cancels_closes_and_exits() {
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let local_app_data = std::env::temp_dir().join(format!(
        "comic-explorer-process-shutdown-{}-{nonce}",
        std::process::id()
    ));
    std::fs::create_dir_all(&local_app_data).unwrap();
    let output = Command::new(env!("CARGO_BIN_EXE_comic-explorer"))
        .arg("--shutdown-process-harness")
        .env("LOCALAPPDATA", &local_app_data)
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "stderr: {}",
        String::from_utf8_lossy(&output.stderr)
    );
    let evidence: serde_json::Value = serde_json::from_slice(&output.stdout).unwrap();
    assert_eq!(evidence["status"], "ok");
    assert_eq!(evidence["position"], "page-7.png");
    for field in [
        "navigationCancelled",
        "viewerCancelled",
        "mediaRevoked",
        "queueRejected",
        "handlesClosed",
    ] {
        assert_eq!(evidence[field], true, "{field}");
    }
    std::fs::remove_dir_all(local_app_data).unwrap();
}
