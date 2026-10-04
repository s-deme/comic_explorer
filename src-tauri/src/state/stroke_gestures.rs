use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StrokeBinding {
    pub pattern: String,
    pub action: String,
    pub enabled: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StrokeGestures {
    pub enabled: bool,
    pub threshold: u16,
    pub show_trail: bool,
    pub bindings: Vec<StrokeBinding>,
}

impl Default for StrokeGestures {
    fn default() -> Self {
        Self {
            enabled: true,
            threshold: 24,
            show_trail: true,
            bindings: [
                ("L", "nextPage"),
                ("R", "previousPage"),
                ("UR", "firstPage"),
                ("UL", "lastPage"),
                ("LD", "nextItem"),
                ("RD", "previousItem"),
                ("LR", "singlePage"),
                ("RL", "spreadPage"),
                ("DR", "closeViewer"),
                ("U", "zoomIn"),
                ("D", "zoomOut"),
                ("UD", "fit"),
                ("DU", "toggleFullscreen"),
            ]
            .into_iter()
            .map(|(pattern, action)| StrokeBinding {
                pattern: pattern.into(),
                action: action.into(),
                enabled: true,
            })
            .collect(),
        }
    }
}

impl StrokeGestures {
    pub fn is_valid(&self) -> bool {
        let mut seen = BTreeSet::new();
        (8..=96).contains(&self.threshold)
            && self.bindings.len() <= 64
            && self.bindings.iter().all(|b| {
                (1..=8).contains(&b.pattern.len())
                    && b.pattern.bytes().all(|d| b"UDLR".contains(&d))
                    && b.pattern
                        .as_bytes()
                        .windows(2)
                        .all(|pair| pair[0] != pair[1])
                    && seen.insert(&b.pattern)
                    && matches!(
                        b.action.as_str(),
                        "none"
                            | "nextPage"
                            | "previousPage"
                            | "closeViewer"
                            | "singlePage"
                            | "spreadPage"
                            | "toggleDirection"
                            | "zoomIn"
                            | "zoomOut"
                            | "toggleLoupe"
                            | "toggleFullscreen"
                            | "firstPage"
                            | "lastPage"
                            | "nextItem"
                            | "previousItem"
                            | "fit"
                            | "width"
                            | "original"
                            | "autoSpread"
                            | "pageList"
                            | "addBookmark"
                            | "bookmarkList"
                            | "nextBookmark"
                            | "toggleSlideshow"
                    )
            })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn stroke_gestures_validate_defaults_and_reject_ambiguous_or_invalid_profiles() {
        let defaults = StrokeGestures::default();
        assert!(defaults.is_valid());
        assert_eq!(defaults.bindings.len(), 13);
        let mut changed = defaults.clone();
        changed.bindings.push(changed.bindings[0].clone());
        assert!(!changed.is_valid());
        for pattern in ["", "LL", "X", "UDLRUDLRU"] {
            changed = defaults.clone();
            changed.bindings[0].pattern = pattern.into();
            assert!(!changed.is_valid());
        }
        changed = defaults.clone();
        changed.bindings[0].action = "deleteFile".into();
        assert!(!changed.is_valid());
        changed = defaults.clone();
        changed.threshold = 0;
        assert!(!changed.is_valid());
        let encoded = serde_json::to_string(&defaults).unwrap();
        assert_eq!(
            serde_json::from_str::<StrokeGestures>(&encoded).unwrap(),
            defaults
        );
    }
}
