
# DynamoDB Single-Table Design (V4 with Search)

## Core ideas

* One DynamoDB table with `PK` and `SK`
* Words are aggregates under `PK = WORD#{word}`
* Sentences are aggregates under `PK = SENT#{sentId}`
* Word→Sentence edges are stored once (forward direction); reverse lookups use a sparse GSI (only items with SentenceWordsPK/SentenceWordsSK set appear in the index).
* A single search GSI (`PrefixSearch`) supports both prefix search and A–Z browsing

---

## Item structures

### Word head

* `PK = WORD#{word}`
* `SK = WORD#`
* Attributes: `word`, `createdAt`
* `PrefixSearch` GSI: for given prefix string, find all words starting with that prefix

  * `PrefixSearchPK = LETTER#{bucket}` (bucket = first letter uppercase, else `#`)
  * `PrefixSearchSK = word`

### Word definition

* `PK = WORD#{word}`
* `SK = DEF#{defId}`
* Attributes: `definition`, `partOfSpeech`, `createdAt`

### Word to Sentence edge

* `PK = WORD#{word}`
* `SK = SENT#{sentId}`
* Attributes: `sentId`, `definitionId`, `createdAt`
* `SentenceWords` GSI: for given sentence, find all words that reference it

  * `SentenceWordsPK = SENT#{sentId}`
  * `SentenceWordsSK = WORD#{word}`

### Sentence head

* `PK = SENT#{sentId}`
* `SK = SENT#`
* Attributes: `sentence`, `audioS3Key`, `createdAt`


---

## Example items

Word 

```json
{
  "PK": "WORD#about",
  "SK": "WORD#",
  "word": "about",
  "createdAt": 1696000000000,
  "PrefixSearchPK": "LETTER#A",
  "PrefixSearchSK": "about"
}
```

Definition

```json
{
  "PK": "WORD#about",
  "SK": "DEF#0",
  "partOfSpeech": "noun",
  "definition": "A preposition used to indicate a relationship of proximity or direction.",
  "createdAt": 1696000100000
}

Sentence

```json
{
  "PK": "SENT#s123",
  "SK": "SENT#",
  "sentence": "The about is on the table.",
  "audioS3Key": "s3://bucket/s123.mp3",
  "createdAt": 1696000300000
}
```

Edge

```json
{
  "PK": "WORD#about",
  "SK": "SENT#s123",
  "sentId": "s123",
  "definitionId": "0",
  "createdAt": 1696000200000,
  "SentenceWordsPK": "SENT#s123",
  "SentenceWordsSK": "WORD#about"
}
```

## Query patterns

Browse or prefix search:
```ts
// search words starting with letter "A"
PrefixSearchPK=LETTER#A

// search words with prefix "ab"
PrefixSearchPK=LETTER#A AND begins_with(PrefixSearchSK, 'ab')
```

Get a word, its definitions, and sentences:
```ts
// Get a word, definition and word-to-sentence edges
Query PK=WORD#{word}
// then get sentences for each edge using sentId from the edge
BatchGet PK=SENT#{sentId}, SK=SENT#
```

Get only definitions for a word:
```ts
Query PK=WORD#{word} begins_with(SK, 'DEF#')
```

Get only word-to-sentence edges for a word which includes sentId and definitionId:
```ts
Query PK=WORD#{word} begins_with(SK, 'SENT#') 
```

Get words for a given sentId:
```ts
Query SentenceWordsGSI with SentenceWordsPK=SENT#{sentId}
```

## TypeScript types
See [here](../shared/types/index.ts).


## Cost and performance notes

### Avoiding hot partitions with bucketing
A hot partition occurs when a disproportionate amount of read or write traffic is directed to a single partition in a distributed database system like DynamoDB. 
For example, if all words were stored under a single partition key like `PK = "#WORD"` or `PK = "#SENTENCE"`, then every read and write operation for any word would target that same partition.
This can lead to performance bottlenecks, increased latency, and throttling of requests, as the overloaded partition struggles to handle the excessive load. 
With the bucketing (LETTER#{bucket}) for PrefixSearchPK:
* Spreads load across 27 partitions (A-Z + # for non-alphabetic) to avoid hot partitions
* Queries like "PrefixSearchPK=LETTER#A AND begins_with(PrefixSearchSK, 'ab')" only hit the A bucket, not the entire table which improves performance and scalability

### Sparse GSIs
The `SentenceWords` GSI is sparse, meaning it only contains items that represent Word→Sentence edges. 
Definitions, word heads, and sentence heads do not enter this index.
