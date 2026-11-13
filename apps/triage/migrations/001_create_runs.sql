CREATE TABLE runs (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  subject TEXT NOT NULL,
  category TEXT NOT NULL,
  action TEXT NOT NULL,
  -- The whole run (ticket, result, trace, model) as JSON, validated by the contract schema on read.
  document TEXT NOT NULL
);

CREATE INDEX runs_created_at ON runs (created_at DESC);
