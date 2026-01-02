import path from "path";

export const LOCAL_SAVE_DIR = path.join(
  process.cwd(),
  "src",
  "admin",
  "local-save"
);

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
// Words that are already present in the database
export const PATH_EXISTING_WORDS = path.join(
  LOCAL_SAVE_DIR,
  "words_existing.json"
);

// Raw list of words harvested from external sources that need processing. This list differs from 'pending' as it has not yet been checked against existing words to remove duplicates.
export const PATH_UNFILTERED_WORDS = path.join(
  LOCAL_SAVE_DIR,
  "words_unfiltered.json"
);

// Words that are confirmed to be new (filtered). These are the words ready to be added to the database.
export const PATH_FILTERED_WORDS = path.join(
  LOCAL_SAVE_DIR,
  "words_filtered.json"
);

export const PATH_WORDS = path.join(LOCAL_SAVE_DIR, "words.json");
export const PATH_WORD_FORMS = path.join(LOCAL_SAVE_DIR, "word_forms.json");
