use crate::domain::RelativePath;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ReadingPosition {
    pub page_key: RelativePath,
    pub natural_ordinal: usize,
}

pub fn resolve_reading_position(
    saved: Option<&ReadingPosition>,
    available_pages: &[RelativePath],
) -> Option<usize> {
    if available_pages.is_empty() {
        return None;
    }
    let Some(saved) = saved else {
        return Some(0);
    };
    if let Some(index) = available_pages
        .iter()
        .position(|page| page == &saved.page_key)
    {
        return Some(index);
    }

    let last = available_pages.len() - 1;
    let distance = 0..=last;
    distance.min_by_key(|index| (index.abs_diff(saved.natural_ordinal), usize::MAX - index))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn pages(names: &[&str]) -> Vec<RelativePath> {
        names
            .iter()
            .map(|name| RelativePath::parse(name).unwrap())
            .collect()
    }

    #[test]
    fn keeps_the_relative_page_when_pages_are_inserted() {
        let saved = ReadingPosition {
            page_key: RelativePath::parse("7.png").unwrap(),
            natural_ordinal: 6,
        };
        assert_eq!(
            resolve_reading_position(Some(&saved), &pages(&["0.png", "1.png", "7.png"])),
            Some(2)
        );
    }

    #[test]
    fn removed_page_uses_nearest_ordinal_preferring_the_later_page() {
        let saved = ReadingPosition {
            page_key: RelativePath::parse("removed.png").unwrap(),
            natural_ordinal: 2,
        };
        assert_eq!(
            resolve_reading_position(Some(&saved), &pages(&["1.png", "2.png", "4.png", "5.png"])),
            Some(2)
        );
    }
}
