import type { FirefliesSentence } from "./types";

const MAX_WORDS_PER_CHUNK = 20000;

export interface TranscriptChunk {
  text: string;
  startTime: number;
  endTime: number;
  wordCount: number;
}

function formatSentences(sentences: FirefliesSentence[]): string {
  return sentences
    .map((s) => `[${s.speaker_name}]: ${s.text}`)
    .join("\n");
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

export function formatTranscriptText(
  sentences: FirefliesSentence[],
): string {
  return formatSentences(sentences);
}

export function chunkTranscript(
  sentences: FirefliesSentence[],
): TranscriptChunk[] {
  const fullText = formatSentences(sentences);
  const totalWords = countWords(fullText);

  if (totalWords <= MAX_WORDS_PER_CHUNK) {
    return [
      {
        text: fullText,
        startTime: sentences[0]?.start_time ?? 0,
        endTime: sentences[sentences.length - 1]?.end_time ?? 0,
        wordCount: totalWords,
      },
    ];
  }

  // Split into chunks by accumulating sentences until word limit
  const chunks: TranscriptChunk[] = [];
  let currentSentences: FirefliesSentence[] = [];
  let currentWordCount = 0;

  for (const sentence of sentences) {
    const sentenceWords = countWords(sentence.text);

    if (
      currentWordCount + sentenceWords > MAX_WORDS_PER_CHUNK &&
      currentSentences.length > 0
    ) {
      chunks.push({
        text: formatSentences(currentSentences),
        startTime: currentSentences[0].start_time,
        endTime: currentSentences[currentSentences.length - 1].end_time,
        wordCount: currentWordCount,
      });
      currentSentences = [];
      currentWordCount = 0;
    }

    currentSentences.push(sentence);
    currentWordCount += sentenceWords;
  }

  if (currentSentences.length > 0) {
    chunks.push({
      text: formatSentences(currentSentences),
      startTime: currentSentences[0].start_time,
      endTime: currentSentences[currentSentences.length - 1].end_time,
      wordCount: currentWordCount,
    });
  }

  return chunks;
}

export function needsChunking(sentences: FirefliesSentence[]): boolean {
  const totalWords = sentences.reduce(
    (sum, s) => sum + countWords(s.text),
    0,
  );
  return totalWords > MAX_WORDS_PER_CHUNK;
}
