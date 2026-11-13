"use client";

import React, { useState, useEffect } from "react";

interface ChallengeData {
  id: string;
  title: string;
  codeSnippet: string;
}

export function ChallengeViewer(
  { challengeId }: { challengeId: string }
) {
  const [challenge, setChallenge] =
    useState<ChallengeData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    // Defect: Missing AbortController or active flag cleanup
    fetch(`/api/challenges/${challengeId}`)
      .then((res) => {
        if (!res.ok) {
          throw new Error(`Failed to load: ${res.statusText}`);
        }
        return res.json();
      })
      .then((data: ChallengeData) => {
        // Stale response can overwrite newer challenge selection
        setChallenge(data);
        setLoading(false);
      })
      .catch((err: Error) => {
        setError(err.message);
        setLoading(false);
      });
  }, [challengeId]);

  if (loading) return <div className="spinner">Loading...</div>;
  if (error) return <div className="error">{error}</div>;
  if (!challenge) return <div>No challenge selected.</div>;

  return (
    <div className="challenge-card">
      <h2>{challenge.title}</h2>
      <pre><code>{challenge.codeSnippet}</code></pre>
    </div>
  );
}
