export const ANALYSIS_NONE      = -1; // no analysis record; never requested
export const ANALYSIS_PENDING   =  0; // queued, waiting for worker
export const ANALYSIS_ANALYZING =  1; // stockfish currently running
export const ANALYSIS_DONE      =  2; // completed successfully
export const ANALYSIS_FAILED    =  3; // failed; errorMessage has details
