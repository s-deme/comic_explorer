use std::cmp::Ordering;

#[derive(Debug)]
enum Token<'a> {
    Text(&'a str),
    Digits(&'a str),
}

fn tokens(value: &str) -> impl Iterator<Item = Token<'_>> {
    let mut start = 0;
    std::iter::from_fn(move || {
        if start == value.len() {
            return None;
        }
        let is_digit = value[start..]
            .chars()
            .next()
            .is_some_and(|character| character.is_ascii_digit());
        let end = value[start..]
            .char_indices()
            .skip(1)
            .find_map(|(offset, character)| {
                (character.is_ascii_digit() != is_digit).then_some(start + offset)
            })
            .unwrap_or(value.len());
        let part = &value[start..end];
        start = end;
        Some(if is_digit {
            Token::Digits(part)
        } else {
            Token::Text(part)
        })
    })
}

fn utf16_cmp(left: &str, right: &str) -> Ordering {
    left.encode_utf16().cmp(right.encode_utf16())
}

fn numeric_cmp(left: &str, right: &str) -> Ordering {
    let left_value = left.trim_start_matches('0');
    let right_value = right.trim_start_matches('0');
    let left_value = if left_value.is_empty() {
        "0"
    } else {
        left_value
    };
    let right_value = if right_value.is_empty() {
        "0"
    } else {
        right_value
    };
    left_value
        .len()
        .cmp(&right_value.len())
        .then_with(|| left_value.cmp(right_value))
}

/// Locale-independent natural order. Numeric equality and all remaining ties
/// are resolved by the original, non-normalized UTF-16 code-unit sequence.
pub fn natural_cmp(left: &str, right: &str) -> Ordering {
    let mut left_tokens = tokens(left);
    let mut right_tokens = tokens(right);
    loop {
        match (left_tokens.next(), right_tokens.next()) {
            (Some(Token::Digits(left)), Some(Token::Digits(right))) => {
                let order = numeric_cmp(left, right);
                if order != Ordering::Equal {
                    return order;
                }
            }
            (Some(Token::Text(left)), Some(Token::Text(right))) => {
                let order = left.to_lowercase().cmp(&right.to_lowercase());
                if order != Ordering::Equal {
                    return order;
                }
            }
            (Some(Token::Digits(_)), Some(Token::Text(_))) => return Ordering::Less,
            (Some(Token::Text(_)), Some(Token::Digits(_))) => return Ordering::Greater,
            (Some(_), None) => return Ordering::Greater,
            (None, Some(_)) => return Ordering::Less,
            (None, None) => return utf16_cmp(left, right),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sorted(values: &[&str]) -> Vec<String> {
        let mut values = values.iter().map(ToString::to_string).collect::<Vec<_>>();
        values.sort_by(|left, right| natural_cmp(left, right));
        values
    }

    #[test]
    fn compares_digit_runs_by_numeric_value() {
        assert_eq!(
            sorted(&["10.jpg", "2.jpg", "1.jpg"]),
            ["1.jpg", "2.jpg", "10.jpg"]
        );
    }

    #[test]
    fn numeric_ties_use_original_utf16_ordinal_order() {
        assert_eq!(
            sorted(&["1.png", "01.png", "001.png"]),
            ["001.png", "01.png", "1.png"]
        );
    }

    #[test]
    fn does_not_normalize_unicode() {
        let nfc = "é.png";
        let nfd = "e\u{301}.png";
        assert_ne!(natural_cmp(nfc, nfd), Ordering::Equal);
        assert_eq!(sorted(&[nfc, nfd]), [nfd, nfc]);
    }
}
