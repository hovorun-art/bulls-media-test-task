-- Runs are stored from their start: a status, and no category or action until they are done.
-- Runs stored before are done; their documents get the status and the deadlineReached flag.
CREATE TABLE runs_with_status (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  subject TEXT NOT NULL,
  status TEXT NOT NULL,
  category TEXT,
  action TEXT,
  document TEXT NOT NULL
);

INSERT INTO runs_with_status (id, created_at, subject, status, category, action, document)
SELECT id, created_at, subject, 'done', category, action,
       json_set(document, '$.status', 'done', '$.result.flags.deadlineReached', json('false'))
FROM runs
ORDER BY rowid;

DROP TABLE runs;
ALTER TABLE runs_with_status RENAME TO runs;

CREATE INDEX runs_created_at ON runs (created_at DESC);
CREATE INDEX runs_status ON runs (status);
