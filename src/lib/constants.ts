import path from "path";

export const LOCAL_SAVE_DIR = path.join(process.cwd(), "local-save");

// D:\assets\dictionary\words
export const LOCAL_MNT_DICTIONARY = path.join("D:\\assets\\dictionary\\words");

export const PATH_ALL_SENTENCES = path.join(
  LOCAL_SAVE_DIR,
  "all_sentences.json"
);
export const PATH_SORTED_SENTENCES = path.join(
  LOCAL_SAVE_DIR,
  "sorted_sentences.json"
);

// words
// all words already exist in db
export const PATH_ALL_WORDS = path.join(LOCAL_SAVE_DIR, "all_words.json");
// new words extracted from various sources to be added to all words
export const PATH_NEW_WORDS = path.join(LOCAL_SAVE_DIR, "new_words.json");
// pending words is the difference between new words and all words
export const PATH_PENDING_WORDS = path.join(
  LOCAL_SAVE_DIR,
  "pending_words.json"
);
export const PATH_WORDS_FOR_PROMPT = path.join(
  LOCAL_SAVE_DIR,
  "words_for_prompt.json"
);
