import * as googleTTS from "@google-cloud/text-to-speech";

const { GOOGLE_SPEECH_KEY } = process.env;
console.log("GOOGLE_SPEECH_KEY2", GOOGLE_SPEECH_KEY);

export const speechSynthesis = async ({
  text,
  encoding,
  speakingRate,
  ssml,
}: {
  text?: string;
  encoding?: string;
  speakingRate?: number;
  // google doesn't support ssml for chirphd. you can't select the voice if using ssml
  ssml?: string;
}): Promise<Buffer> => {
  // starting from left to right, quality of voices decreases
  const voices = ["en-US-Chirp3-HD-Leda", "en-US-Chirp3-HD-Aoede"];
  const voiceName = voices[0];

  const encodes = ["LINEAR16", "OGG_OPUS"];
  // ogg_opus is 10x smaller in size compared to LINEAR16

  if (!encoding) {
    encoding = encodes[1];
  }
  if (!speakingRate) {
    speakingRate = 1;
  }

  const client = new googleTTS.TextToSpeechClient({
    apiKey: GOOGLE_SPEECH_KEY,
  });

  let input;

  if (ssml) {
    input = { ssml };
  } else if (text) {
    input = { text };
  } else {
    throw new Error("Either text or ssml must be provided.");
  }

  console.log("input to TTS:", input, encoding, speakingRate, voiceName);

  const [response] = await client.synthesizeSpeech({
    input,
    audioConfig: {
      audioEncoding: encoding as any,
      pitch: 0,
      speakingRate,
    },
    voice: {
      languageCode: "en-US",
      name: voiceName,
      // ssmlGender: "FEMALE",
    },
  });

  if (!response?.audioContent) {
    throw new Error("No audio content found in response.");
  }

  if (response.audioContent instanceof Uint8Array) {
    // Handle the case where audioContent is a Uint8Array
    return Buffer.from(response.audioContent);
  } else {
    throw new Error("Invalid audioContent type");
  }
};
