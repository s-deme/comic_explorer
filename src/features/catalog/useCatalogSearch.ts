import { useRef, useState, type RefObject } from "react";
import { pickSearchSource, searchLibrary, type SearchResultEntry } from "../library/client";
import { presentError, presentUnexpectedError } from "../errors/presentation";
import { windowsDisplayPathKey } from "../navigation/navigation";
import { defaultSearchOptions, toSearchRequestOptions, type SearchOptions } from "./search-options";

type SearchState =
  | { status: "idle" }
  | { status: "loading"; query: string }
  | { status: "ready"; query: string; results: SearchResultEntry[] }
  | { status: "error"; query: string; message: string };

type SearchScope = "current" | "library" | "multiple";

interface CatalogSearchContext {
  generation: RefObject<number>;
  libraryRoot: string | null;
  currentPath: string;
  onSearchStart: () => void;
}

export function useCatalogSearch({
  generation, libraryRoot, currentPath, onSearchStart,
}: CatalogSearchContext) {
  const searchSourceGeneration = useRef(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchPaneOpen, setSearchPaneOpen] = useState(false);
  const [searchScope, setSearchScope] = useState<SearchScope>("current");
  const [searchOptions, setSearchOptions] = useState<SearchOptions>(defaultSearchOptions);
  const [searchState, setSearchState] = useState<SearchState>({ status: "idle" });
  const [searchSourceRoots, setSearchSourceRoots] = useState<string[]>([]);
  const [searchSourceBusy, setSearchSourceBusy] = useState(false);
  const [searchSourceNotice, setSearchSourceNotice] = useState<string | null>(null);

  function clearSearch() {
    generation.current += 1;
    setSearchQuery("");
    setSearchState({ status: "idle" });
  }

  async function runSearch() {
    const query = searchQuery;
    if (query.trim() === "") {
      clearSearch();
      return;
    }
    if (!searchOptions.includeFolders && !searchOptions.includeFiles) {
      setSearchState({
        status: "error",
        query,
        message: "検索結果に含める種類を1つ以上選択してください。",
      });
      return;
    }
    generation.current += 1;
    const requestGeneration = generation.current;
    setSearchState({ status: "loading", query });
    onSearchStart();
    try {
      const requestOptions = toSearchRequestOptions(searchOptions);
      requestOptions.fixedLocation = searchScope === "current" ? currentPath : null;
      requestOptions.sourceRoots = searchScope === "multiple"
        ? [...searchSourceRoots]
        : libraryRoot === null ? [] : [libraryRoot];
      const response = await searchLibrary(
        query,
        requestGeneration,
        requestOptions,
      );
      if (requestGeneration !== generation.current) return;
      if (response.status === "ok") {
        setSearchState({ status: "ready", query, results: response.data });
      } else if (response.status === "error") {
        setSearchState({
          status: "error",
          query,
          message: response.error.code === "INVALID_REQUEST"
            ? "検索式を確認してください。例: (*.cbz OR *.pdf) AND NOT sample*"
            : presentError(response.error),
        });
      }
    } catch {
      if (requestGeneration === generation.current) {
        setSearchState({
          status: "error",
          query,
          message: presentUnexpectedError(),
        });
      }
    }
  }

  async function addSearchSource() {
    if (searchSourceRoots.length >= 8) {
      setSearchSourceNotice("検索場所は最大8件です。不要な場所を外してから追加してください。");
      return;
    }
    const requestGeneration = ++searchSourceGeneration.current;
    setSearchSourceBusy(true);
    setSearchSourceNotice(null);
    try {
      const response = await pickSearchSource(requestGeneration);
      if (requestGeneration !== searchSourceGeneration.current) return;
      if (response.status === "ok" && response.data !== null) {
        const next = response.data.absolutePath;
        setSearchSourceRoots((current) => current.some((source) =>
          windowsDisplayPathKey(source)
            === windowsDisplayPathKey(next)
        ) ? current : [...current, next]);
      } else if (response.status === "error") {
        setSearchSourceNotice(presentError(response.error));
      }
    } catch {
      if (requestGeneration === searchSourceGeneration.current) {
        setSearchSourceNotice(presentUnexpectedError());
      }
    } finally {
      if (requestGeneration === searchSourceGeneration.current) setSearchSourceBusy(false);
    }
  }

  function removeSearchSource(source: string) {
    if (
      libraryRoot !== null
      && windowsDisplayPathKey(source)
        === windowsDisplayPathKey(libraryRoot)
    ) return;
    setSearchSourceRoots((current) => current.filter((candidate) => candidate !== source));
  }

  return {
    searchQuery, setSearchQuery, searchPaneOpen, setSearchPaneOpen,
    searchScope, setSearchScope, searchOptions, setSearchOptions,
    searchState, setSearchState, searchSourceRoots, setSearchSourceRoots,
    searchSourceBusy, searchSourceNotice, setSearchSourceNotice,
    clearSearch, runSearch, addSearchSource, removeSearchSource,
  };
}
