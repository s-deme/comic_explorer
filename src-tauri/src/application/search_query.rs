const MAX_QUERY_CHARS: usize = 1_024;
const MAX_TOKENS: usize = 128;
const MAX_NESTING: usize = 16;

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) enum SearchExpression {
    Term(SearchTerm),
    Not(Box<SearchExpression>),
    And(Box<SearchExpression>, Box<SearchExpression>),
    Or(Box<SearchExpression>, Box<SearchExpression>),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct SearchQueryError(pub(super) &'static str);

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct SearchTerm {
    pattern: Vec<PatternUnit>,
    whole_name: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum PatternUnit {
    Literal(char),
    AnyOne,
    AnyMany,
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum Token {
    Term(SearchTerm),
    And,
    Or,
    Not,
    LeftParen,
    RightParen,
}

pub(super) fn parse_search_query(input: &str) -> Result<SearchExpression, SearchQueryError> {
    if input.chars().count() > MAX_QUERY_CHARS {
        return Err(SearchQueryError(
            "Search expression is longer than 1024 characters.",
        ));
    }
    let normalized = normalize_search_text(input);
    if normalized.trim().is_empty() {
        return Err(SearchQueryError("Search expression is empty."));
    }
    if !looks_like_expression(&normalized) {
        return Ok(SearchExpression::Term(SearchTerm {
            pattern: normalized
                .trim()
                .chars()
                .map(PatternUnit::Literal)
                .collect(),
            whole_name: false,
        }));
    }
    let tokens = tokenize(&normalized)?;
    let mut parser = Parser { tokens, index: 0 };
    let expression = parser.parse_or(0)?;
    if parser.index != parser.tokens.len() {
        return Err(SearchQueryError(
            "Search expression contains an unexpected token.",
        ));
    }
    Ok(expression)
}

pub(super) fn matches_search_query(expression: &SearchExpression, name: &str) -> bool {
    let normalized = normalize_search_text(name);
    let candidate: Vec<char> = normalized.chars().collect();
    evaluate(expression, &candidate)
}

pub(super) fn normalize_search_text(value: &str) -> String {
    value
        .trim()
        .chars()
        .flat_map(|character| {
            let folded = match character {
                '\u{3000}' => ' ',
                '\u{ff01}'..='\u{ff5e}' => {
                    char::from_u32(character as u32 - 0xfee0).unwrap_or(character)
                }
                _ => character,
            };
            folded.to_lowercase()
        })
        .collect()
}

fn looks_like_expression(value: &str) -> bool {
    value
        .chars()
        .any(|character| matches!(character, '*' | '?' | '(' | ')' | '"' | '\\'))
        || value.split_whitespace().any(|word| {
            word.eq_ignore_ascii_case("and")
                || word.eq_ignore_ascii_case("or")
                || word.eq_ignore_ascii_case("not")
        })
}

fn tokenize(value: &str) -> Result<Vec<Token>, SearchQueryError> {
    let chars: Vec<char> = value.chars().collect();
    let mut index = 0;
    let mut tokens = Vec::new();
    while index < chars.len() {
        if chars[index].is_whitespace() {
            index += 1;
            continue;
        }
        let token = match chars[index] {
            '(' => {
                index += 1;
                Token::LeftParen
            }
            ')' => {
                index += 1;
                Token::RightParen
            }
            '"' => quoted_term(&chars, &mut index)?,
            _ => unquoted_token(&chars, &mut index)?,
        };
        tokens.push(token);
        if tokens.len() > MAX_TOKENS {
            return Err(SearchQueryError(
                "Search expression contains more than 128 tokens.",
            ));
        }
    }
    Ok(tokens)
}

fn quoted_term(chars: &[char], index: &mut usize) -> Result<Token, SearchQueryError> {
    *index += 1;
    let mut pattern = Vec::new();
    let mut closed = false;
    while *index < chars.len() {
        match chars[*index] {
            '"' => {
                *index += 1;
                closed = true;
                break;
            }
            '\\' => {
                *index += 1;
                if *index >= chars.len() {
                    return Err(SearchQueryError("Search expression ends with an escape."));
                }
                pattern.push(PatternUnit::Literal(chars[*index]));
                *index += 1;
            }
            character => {
                pattern.push(PatternUnit::Literal(character));
                *index += 1;
            }
        }
    }
    if !closed {
        return Err(SearchQueryError("Search expression has an unclosed quote."));
    }
    if pattern.is_empty() {
        return Err(SearchQueryError("Quoted search term is empty."));
    }
    if *index < chars.len() && !chars[*index].is_whitespace() && chars[*index] != ')' {
        return Err(SearchQueryError(
            "Quoted search term must end at a token boundary.",
        ));
    }
    Ok(Token::Term(SearchTerm {
        pattern,
        whole_name: false,
    }))
}

fn unquoted_token(chars: &[char], index: &mut usize) -> Result<Token, SearchQueryError> {
    let mut pattern = Vec::new();
    let mut operator = String::new();
    let mut operator_eligible = true;
    let mut whole_name = false;
    while *index < chars.len()
        && !chars[*index].is_whitespace()
        && chars[*index] != '('
        && chars[*index] != ')'
    {
        match chars[*index] {
            '"' => return Err(SearchQueryError("Quote must start a search term.")),
            '\\' => {
                operator_eligible = false;
                *index += 1;
                if *index >= chars.len() {
                    return Err(SearchQueryError("Search expression ends with an escape."));
                }
                pattern.push(PatternUnit::Literal(chars[*index]));
                operator.push(chars[*index]);
                *index += 1;
            }
            '*' => {
                operator_eligible = false;
                whole_name = true;
                if pattern.last() != Some(&PatternUnit::AnyMany) {
                    pattern.push(PatternUnit::AnyMany);
                }
                *index += 1;
            }
            '?' => {
                operator_eligible = false;
                whole_name = true;
                pattern.push(PatternUnit::AnyOne);
                *index += 1;
            }
            character => {
                pattern.push(PatternUnit::Literal(character));
                operator.push(character);
                *index += 1;
            }
        }
    }
    if pattern.is_empty() {
        return Err(SearchQueryError(
            "Search expression contains an empty term.",
        ));
    }
    if operator_eligible {
        if operator.eq_ignore_ascii_case("and") {
            return Ok(Token::And);
        }
        if operator.eq_ignore_ascii_case("or") {
            return Ok(Token::Or);
        }
        if operator.eq_ignore_ascii_case("not") {
            return Ok(Token::Not);
        }
    }
    Ok(Token::Term(SearchTerm {
        pattern,
        whole_name,
    }))
}

struct Parser {
    tokens: Vec<Token>,
    index: usize,
}

impl Parser {
    fn parse_or(&mut self, nesting: usize) -> Result<SearchExpression, SearchQueryError> {
        let mut expression = self.parse_and(nesting)?;
        while self.consume(&Token::Or) {
            let right = self.parse_and(nesting)?;
            expression = SearchExpression::Or(Box::new(expression), Box::new(right));
        }
        Ok(expression)
    }

    fn parse_and(&mut self, nesting: usize) -> Result<SearchExpression, SearchQueryError> {
        let mut expression = self.parse_not(nesting)?;
        while self.consume(&Token::And) {
            let right = self.parse_not(nesting)?;
            expression = SearchExpression::And(Box::new(expression), Box::new(right));
        }
        Ok(expression)
    }

    fn parse_not(&mut self, nesting: usize) -> Result<SearchExpression, SearchQueryError> {
        if self.consume(&Token::Not) {
            return Ok(SearchExpression::Not(Box::new(self.parse_not(nesting)?)));
        }
        self.parse_primary(nesting)
    }

    fn parse_primary(&mut self, nesting: usize) -> Result<SearchExpression, SearchQueryError> {
        match self.tokens.get(self.index).cloned() {
            Some(Token::Term(term)) => {
                self.index += 1;
                Ok(SearchExpression::Term(term))
            }
            Some(Token::LeftParen) => {
                if nesting >= MAX_NESTING {
                    return Err(SearchQueryError(
                        "Search expression nesting exceeds 16 levels.",
                    ));
                }
                self.index += 1;
                let expression = self.parse_or(nesting + 1)?;
                if !self.consume(&Token::RightParen) {
                    return Err(SearchQueryError(
                        "Search expression has an unclosed parenthesis.",
                    ));
                }
                Ok(expression)
            }
            Some(Token::RightParen) => Err(SearchQueryError(
                "Search expression has an unexpected closing parenthesis.",
            )),
            Some(Token::And | Token::Or) => Err(SearchQueryError(
                "Search expression has a dangling binary operator.",
            )),
            Some(Token::Not) => unreachable!("NOT is consumed before primary parsing"),
            None => Err(SearchQueryError("Search expression ends before a term.")),
        }
    }

    fn consume(&mut self, expected: &Token) -> bool {
        if self.tokens.get(self.index) == Some(expected) {
            self.index += 1;
            true
        } else {
            false
        }
    }
}

fn evaluate(expression: &SearchExpression, candidate: &[char]) -> bool {
    match expression {
        SearchExpression::Term(term) => match_term(term, candidate),
        SearchExpression::Not(inner) => !evaluate(inner, candidate),
        SearchExpression::And(left, right) => {
            evaluate(left, candidate) && evaluate(right, candidate)
        }
        SearchExpression::Or(left, right) => {
            evaluate(left, candidate) || evaluate(right, candidate)
        }
    }
}

fn match_term(term: &SearchTerm, candidate: &[char]) -> bool {
    if term.whole_name {
        return glob_matches(&term.pattern, candidate);
    }
    let literal: Vec<char> = term
        .pattern
        .iter()
        .filter_map(|unit| match unit {
            PatternUnit::Literal(character) => Some(*character),
            PatternUnit::AnyOne | PatternUnit::AnyMany => None,
        })
        .collect();
    !literal.is_empty()
        && candidate
            .windows(literal.len())
            .any(|window| window == literal)
}

fn glob_matches(pattern: &[PatternUnit], candidate: &[char]) -> bool {
    let (mut pattern_index, mut candidate_index) = (0, 0);
    let mut star_index = None;
    let mut star_candidate_index = 0;
    while candidate_index < candidate.len() {
        match pattern.get(pattern_index) {
            Some(PatternUnit::Literal(character)) if *character == candidate[candidate_index] => {
                pattern_index += 1;
                candidate_index += 1;
            }
            Some(PatternUnit::AnyOne) => {
                pattern_index += 1;
                candidate_index += 1;
            }
            Some(PatternUnit::AnyMany) => {
                star_index = Some(pattern_index);
                pattern_index += 1;
                star_candidate_index = candidate_index;
            }
            _ if star_index.is_some() => {
                pattern_index = star_index.unwrap() + 1;
                star_candidate_index += 1;
                candidate_index = star_candidate_index;
            }
            _ => return false,
        }
    }
    while pattern.get(pattern_index) == Some(&PatternUnit::AnyMany) {
        pattern_index += 1;
    }
    pattern_index == pattern.len()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn matches(query: &str, value: &str) -> bool {
        matches_search_query(&parse_search_query(query).unwrap(), value)
    }

    #[test]
    fn req_ley_p3_001_keeps_plain_substring_matching_and_adds_bounded_wildcards() {
        assert!(matches("  Ｖｏｌｕｍｅ 01  ", "My Volume 01.cbz"));
        assert!(matches("volume*.cbz", "VOLUME 01.CBZ"));
        assert!(!matches("volume*.cbz", "old-volume 01.cbz"));
        assert!(matches(r"volume\ \*.cbz", "volume *.cbz"));
        assert!(!matches(r"volume\ \*.cbz", "volume 01.cbz"));
    }

    #[test]
    fn req_ley_p3_001_applies_parentheses_and_not_and_or_precedence() {
        let query = "(*.cbz OR *.pdf) AND NOT (sample* OR \"draft copy\")";
        assert!(matches(query, "final.cbz"));
        assert!(!matches(query, "sample-final.cbz"));
        assert!(!matches(query, "draft copy.pdf"));
        assert!(!matches(query, "final.png"));
        assert!(matches("notebook", "My Notebook.cbz"));
        assert!(matches("\"rock and roll\"", "Rock AND Roll.cbz"));
    }

    #[test]
    fn req_ley_p3_001_rejects_invalid_and_resource_exhausting_expressions() {
        for invalid in ["", "foo AND", "OR foo", "(foo OR bar", "\"foo", "foo bar*"] {
            assert!(
                parse_search_query(invalid).is_err(),
                "{invalid:?} must fail"
            );
        }
        let nested = "(".repeat(17) + "x" + &")".repeat(17);
        assert!(parse_search_query(&nested).is_err());
        assert!(parse_search_query(&"x OR ".repeat(65)).is_err());
        assert!(parse_search_query(&"x".repeat(1_025)).is_err());
    }

    #[test]
    fn req_ley_p3_001_evaluates_10000_basenames_within_the_search_budget() {
        let expression = parse_search_query("report-????-*.cbz AND NOT *draft*").unwrap();
        let started = std::time::Instant::now();
        let matches = (0..10_000)
            .filter(|index| {
                let suffix = if index % 2 == 0 { "draft" } else { "final" };
                matches_search_query(&expression, &format!("report-{index:04}-{suffix}.cbz"))
            })
            .count();
        let elapsed = started.elapsed();
        eprintln!("REQ-LEY-P3-001 synthetic 10,000 basename evaluation: {elapsed:?}");
        assert_eq!(matches, 5_000);
        assert!(
            elapsed < std::time::Duration::from_secs(2),
            "elapsed: {elapsed:?}"
        );
    }
}
