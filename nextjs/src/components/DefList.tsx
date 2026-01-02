"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { Copy, Volume2, Pause } from "lucide-react";
import { toast } from "sonner";

import { getAudioUrlFromKey, LOCAL_API_URL } from "@/lib";
import { GetWordDetailsResponse } from "@shared/types";

export type DefListProps = {
  word: GetWordDetailsResponse["word"];
  definitions: {
    definition: GetWordDetailsResponse["definitions"][number]["definition"];
    partOfSpeech: GetWordDetailsResponse["definitions"][number]["partOfSpeech"];
    builtDefinition: React.ReactNode;
    sentences: (GetWordDetailsResponse["definitions"][number]["sentences"][number] & {
      builtSentence: React.ReactNode;
    })[];
  }[];
};

const MAX_CACHE = 30;

export default function DefList({
  defList,
  wordForms,
}: {
  defList: DefListProps;
  wordForms?: React.ReactElement;
}) {
  // UI state
  const [playingKey, setPlayingKey] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<Record<string, boolean>>({});

  // caches + refs
  const blobUrlCache = useRef<Map<string, string>>(new Map());
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const handlersRef = useRef<{
    onEnded?: () => void;
    onCanPlay?: () => void;
    onError?: () => void;
  }>({});

  // ended handler (stable)
  const handleEnded = useCallback(() => {
    setPlayingKey(null);
  }, []);

  // fetch or return cached blob URL
  const getCachedSrc = useCallback(async (key: string, rawUrl: string) => {
    const cached = blobUrlCache.current.get(key);
    if (cached) return cached;

    setIsLoading((prev) => ({ ...prev, [key]: true }));
    const res = await fetch(rawUrl, { cache: "force-cache" });
    if (!res.ok) throw new Error("Failed to fetch audio");
    const blob = await res.blob();
    const objUrl = URL.createObjectURL(blob);

    if (blobUrlCache.current.size >= MAX_CACHE) {
      const oldestKey = blobUrlCache.current.keys().next().value as
        | string
        | undefined;
      if (oldestKey) {
        URL.revokeObjectURL(blobUrlCache.current.get(oldestKey)!);
        blobUrlCache.current.delete(oldestKey);
      }
    }
    blobUrlCache.current.set(key, objUrl);
    return objUrl;
  }, []);

  // detach listeners and stop current audio (without touching cache)
  const teardownCurrentAudio = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;

    const { onEnded, onCanPlay, onError } = handlersRef.current;

    if (onEnded) a.removeEventListener("ended", onEnded);
    if (onCanPlay) a.removeEventListener("canplaythrough", onCanPlay);
    if (onError) a.removeEventListener("error", onError);

    a.pause();
    // fully release the element’s reference to any src
    a.src = "";
    a.load();

    audioRef.current = null;
    handlersRef.current = {};
  }, []);

  // main play/pause handler
  const handlePlay = useCallback(
    async (clickedSentence: any) => {
      const { audio: audioKey } = clickedSentence;

      // toggle pause if same key
      if (audioKey === playingKey) {
        teardownCurrentAudio();
        setPlayingKey(null);
        return;
      }

      // stop any current audio element
      teardownCurrentAudio();

      const audioURL = getAudioUrlFromKey(audioKey);
      // construct URL
      const rawUrl =
        process.env.NODE_ENV === "development"
          ? `${LOCAL_API_URL}proxy?url=${encodeURIComponent(`${audioURL}`)}`
          : `${audioURL}`;

      try {
        const src = await getCachedSrc(audioKey, rawUrl);

        // create a fresh element and handlers
        const a = new Audio(src);
        a.preload = "auto";

        const onEnded = () => {
          handleEnded();
        };
        const onCanPlay = () => {
          setIsLoading((prev) => ({ ...prev, [audioKey]: false }));
        };
        const onError = () => {
          setIsLoading((prev) => ({ ...prev, [audioKey]: false }));
          toast.error("Failed to load audio. Please try again.");
        };

        a.addEventListener("ended", onEnded);
        a.addEventListener("canplaythrough", onCanPlay);
        a.addEventListener("error", onError);

        // store element + handlers so we can cleanly detach later
        audioRef.current = a;
        handlersRef.current = { onEnded, onCanPlay, onError };

        // kick off playback
        try {
          await a.play();
        } catch {
          setIsLoading((prev) => ({ ...prev, [audioKey]: false }));
        }

        setPlayingKey(audioKey);
      } catch (e) {
        setIsLoading((prev) => ({ ...prev, [audioKey]: false }));
        toast.error("Failed to load audio. Please try again.");
      }
    },
    [getCachedSrc, handleEnded, playingKey, teardownCurrentAudio]
  );

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  // unmount-only cleanup
  useEffect(() => {
    return () => {
      teardownCurrentAudio();

      // revoke all cached object URLs
      for (const url of blobUrlCache.current.values()) {
        URL.revokeObjectURL(url);
      }
      blobUrlCache.current.clear();
    };
  }, [teardownCurrentAudio]);

  return (
    <>
      <div className="wrd">
        <h1>{defList.word}</h1>
        {wordForms}
      </div>

      <ul className="defList">
        {defList.definitions.map((def, i) => (
          <li key={i}>
            <div className="def__header">
              <div>
                <span className="mark" />
              </div>
              <p className="def__text">
                <span>{`${def.partOfSpeech}:`}</span>
                <i>{def.builtDefinition}</i>
              </p>
            </div>

            <ul className="sentList">
              {def.sentences.map((sentenceItem, index) => (
                <li key={index}>
                  <p>{sentenceItem.builtSentence}</p>
                  <div>
                    <button
                      className="btn__ghst cpy"
                      onClick={() => handleCopy(sentenceItem.sentence)}
                      aria-label="Copy"
                    >
                      <Copy className="h-4 w-4" />
                    </button>

                    <button
                      className={`btn__ghst lstn ${
                        playingKey === sentenceItem.audio
                          ? "text-primary!"
                          : "text-muted-foreground"
                      }`}
                      onClick={() => handlePlay(sentenceItem)}
                      disabled={isLoading[sentenceItem.audio]}
                      aria-label="Listen"
                    >
                      {isLoading[sentenceItem.audio] ? (
                        <svg className="spin" />
                      ) : playingKey === sentenceItem.audio ? (
                        <Pause className="h-4 w-4" />
                      ) : (
                        <Volume2 className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </>
  );
}
