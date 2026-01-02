import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { SearchIcon } from "lucide-react";
import { searchWords } from "@/lib";

function useDebouncedValue<T>(value: T, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

type Cache = Map<string, string[]>;

// Simple LRU trim
function setCache(cache: Cache, key: string, value: string[], max = 100) {
  if (cache.has(key)) cache.delete(key);
  cache.set(key, value);
  if (cache.size > max) {
    const firstKey = cache.keys().next().value;
    if (firstKey) {
      cache.delete(firstKey);
    }
  }
}

export const Search = () => {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [searchResults, setSearchResults] = useState<string[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number>(-1);

  const searchRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);
  const cacheRef = useRef<Cache>(new Map());

  const debouncedQuery = useDebouncedValue(query, 600);

  useEffect(() => {
    // Close results if query cleared
    if (!debouncedQuery) {
      setSearchResults([]);
      setIsSearching(false);
      setActiveIndex(-1);
      return;
    }

    setIsOpen(true);

    // Cache hit?
    const cached = cacheRef.current.get(debouncedQuery);
    if (cached) {
      setSearchResults(cached);
      setIsSearching(false);
      setActiveIndex(-1);
      return;
    }

    // Abort any in-flight
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    const reqId = ++requestIdRef.current;
    setIsSearching(true);

    (async () => {
      try {
        const words = await searchWords({
          prefix: debouncedQuery,
          includeAuthToken: false,
          signal: controller.signal,
        });

        // bulletproofing against stale responses. Abortcontroller is not enough for some cases
        if (reqId !== requestIdRef.current) return;

        setCache(cacheRef.current, debouncedQuery, words);
        setSearchResults(words);
      } catch (err: any) {
        // Ignore AbortError noise
        if (err?.name !== "AbortError") {
          console.error("search error:", err);
        }
      } finally {
        if (reqId === requestIdRef.current) {
          setIsSearching(false);
        }
      }
    })();

    return () => {
      controller.abort();
    };
  }, [debouncedQuery]);

  // Close on outside click/touch
  useEffect(() => {
    const handleOutside = (e: Event) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("pointerdown", handleOutside);
    return () => document.removeEventListener("pointerdown", handleOutside);
  }, []);

  // Keyboard navigation
  const onKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
    if (!isOpen || (!isSearching && searchResults.length === 0)) {
      if (e.key === "Escape") setIsOpen(false);
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) =>
        Math.min((i < 0 ? -1 : i) + 1, searchResults.length - 1)
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      if (activeIndex >= 0 && activeIndex < searchResults.length) {
        // Let Link handle navigation by simulating a click
        const slug = searchResults[activeIndex];
        window.location.href = `/word/${slug}`;
      }
    } else if (e.key === "Escape") {
      setIsOpen(false);
    }
  };

  const listboxId = "search-listbox";
  const hasResults = searchResults.length > 0;

  return (
    <div ref={searchRef} className="search-wrapper">
      <div className="input-wrapper">
        <div className="input-icon">
          <SearchIcon className="search-icon" />
        </div>

        <input
          type="text"
          placeholder="Search"
          value={query}
          onChange={(e) => setQuery(e.target.value.trim().toLowerCase())}
          onFocus={() => setIsOpen(true)}
          onKeyDown={onKeyDown}
          autoComplete="off"
          enterKeyHint="search"
          role="combobox"
          aria-expanded={isOpen}
          aria-controls={listboxId}
          aria-autocomplete="list"
          className="input-field"
          maxLength={30}
        />
      </div>

      {isOpen && (
        <div
          className="search-results"
          role="listbox"
          id={listboxId}
          aria-label="Search suggestions"
        >
          {isSearching && (
            <div className="loading-wrapper" aria-live="polite">
              <LoadingSpinner
                size={23}
                aria-label="Loading Spinner"
                data-testid="loader"
              />
            </div>
          )}

          {!isSearching && hasResults && (
            <div className="results-list">
              {searchResults.map((result, i) => (
                <Link
                  key={result + i}
                  href={`/word/${result}`}
                  className={`result-item ${i === activeIndex ? "active" : ""}`}
                  prefetch={false}
                  role="option"
                  aria-selected={i === activeIndex}
                  onClick={() => setIsOpen(false)}
                >
                  {result}
                </Link>
              ))}
            </div>
          )}

          {!isSearching && !hasResults && debouncedQuery.length >= 1 && (
            <div className="no-results">No results for “{debouncedQuery}”.</div>
          )}
        </div>
      )}
    </div>
  );
};
