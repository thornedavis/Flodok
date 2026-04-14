import type { FirefliesTranscript } from "./types";

const FIREFLIES_API_URL = "https://api.fireflies.ai/graphql";

const TRANSCRIPTS_LIST_QUERY = `
  query RecentTranscripts {
    transcripts {
      id
      title
      date
    }
  }
`;

export interface TranscriptListItem {
  id: string;
  title: string;
  date: string;
}

export async function fetchRecentTranscripts(
  apiKey: string,
): Promise<TranscriptListItem[]> {
  const response = await fetch(FIREFLIES_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ query: TRANSCRIPTS_LIST_QUERY }),
  });

  if (!response.ok) {
    throw new Error(
      `Fireflies API returned ${response.status}: ${await response.text()}`,
    );
  }

  const json = (await response.json()) as {
    data?: { transcripts: TranscriptListItem[] };
    errors?: { message: string }[];
  };

  if (json.errors?.length) {
    throw new Error(`Fireflies GraphQL error: ${json.errors[0].message}`);
  }

  return json.data?.transcripts ?? [];
}

const TRANSCRIPT_QUERY = `
  query Transcript($transcriptId: String!) {
    transcript(id: $transcriptId) {
      title
      date
      duration
      participants
      speakers { id name }
      sentences {
        text
        speaker_name
        speaker_id
        start_time
        end_time
      }
      summary { keywords action_items }
    }
  }
`;

export async function fetchTranscript(
  meetingId: string,
  apiKey: string,
): Promise<FirefliesTranscript> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt - 1)));
    }

    try {
      const response = await fetch(FIREFLIES_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          query: TRANSCRIPT_QUERY,
          variables: { transcriptId: meetingId },
        }),
      });

      if (!response.ok) {
        throw new Error(
          `Fireflies API returned ${response.status}: ${await response.text()}`,
        );
      }

      const json = (await response.json()) as {
        data?: { transcript: FirefliesTranscript };
        errors?: { message: string }[];
      };

      if (json.errors?.length) {
        throw new Error(
          `Fireflies GraphQL error: ${json.errors[0].message}`,
        );
      }

      if (!json.data?.transcript) {
        throw new Error("No transcript data returned from Fireflies");
      }

      return json.data.transcript;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw new Error(
    `Fireflies API failed after 3 attempts: ${lastError?.message}`,
  );
}
