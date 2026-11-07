import { useCallback, useEffect, useState } from "react";

import { fetchStatementReview } from "../api/leak-intelligence.api";
import type { StatementReview } from "../features/leak-intelligence/statement-review.parse";

type State = {
  review: StatementReview | null;
  loading: boolean;
  /** Why the review could not load. Shown, so the screen is never silently the old engine. */
  error: string | null;
};

const IDLE: State = { review: null, loading: false, error: null };

/**
 * The statement review the server builds: findings in their groups, good news, commitments,
 * and the questions that could change a finding. It loads again whenever `refreshKey`
 * changes, which is when the analysis itself reloads, and on `reload`, which a saved answer
 * calls. A reload keeps the review on screen while the next one loads.
 */
export function useStatementReview(enabled: boolean, refreshKey: unknown) {
  const [state, setState] = useState<State>(IDLE);
  const [reloads, setReloads] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setState(IDLE);
      return;
    }
    const controller = new AbortController();
    setState((current) => ({ ...current, loading: true, error: null }));
    fetchStatementReview(controller.signal)
      .then((review) => {
        if (!controller.signal.aborted) setState({ review, loading: false, error: null });
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          review: null,
          loading: false,
          error: caught instanceof Error ? caught.message : "The statement review did not load.",
        });
      });
    return () => controller.abort();
  }, [enabled, refreshKey, reloads]);

  const reload = useCallback(() => setReloads((count) => count + 1), []);
  return { ...state, reload };
}
