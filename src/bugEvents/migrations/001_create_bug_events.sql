CREATE TABLE IF NOT EXISTS BugEvents (
    id INT AUTO_INCREMENT PRIMARY KEY,
    fingerprint CHAR(64) NOT NULL,
    status ENUM('new', 'triaged', 'in_progress', 'waiting_human', 'fixed', 'ignored') NOT NULL DEFAULT 'new',
    severity ENUM('low', 'medium', 'high', 'critical') NOT NULL DEFAULT 'low',
    source VARCHAR(64) NOT NULL,
    message TEXT NOT NULL,
    stack MEDIUMTEXT NULL,
    request_context JSON NULL,
    user_context JSON NULL,
    env VARCHAR(32) NOT NULL,
    first_seen_at DATETIME NOT NULL,
    last_seen_at DATETIME NOT NULL,
    occurrence_count INT NOT NULL DEFAULT 1,
    github_issue_number INT NULL,
    resolution_notes TEXT NULL,
    fixed_commit_sha VARCHAR(64) NULL,
    resolved_at DATETIME NULL,
    tags JSON NULL,
    priority_score INT NOT NULL DEFAULT 0,
    UNIQUE KEY uniq_bugevents_fingerprint (fingerprint),
    INDEX idx_bugevents_status_priority (status, priority_score, last_seen_at),
    INDEX idx_bugevents_resolved_at (resolved_at)
);

CREATE TABLE IF NOT EXISTS BugEventsArchive (
    id INT AUTO_INCREMENT PRIMARY KEY,
    bug_event_id INT NOT NULL,
    fingerprint CHAR(64) NOT NULL,
    status ENUM('fixed', 'ignored') NOT NULL,
    severity ENUM('low', 'medium', 'high', 'critical') NOT NULL,
    source VARCHAR(64) NOT NULL,
    message TEXT NOT NULL,
    stack MEDIUMTEXT NULL,
    request_context JSON NULL,
    user_context JSON NULL,
    env VARCHAR(32) NOT NULL,
    first_seen_at DATETIME NOT NULL,
    last_seen_at DATETIME NOT NULL,
    occurrence_count INT NOT NULL,
    github_issue_number INT NULL,
    resolution_notes TEXT NULL,
    fixed_commit_sha VARCHAR(64) NULL,
    resolved_at DATETIME NULL,
    tags JSON NULL,
    priority_score INT NOT NULL,
    archived_at DATETIME NOT NULL DEFAULT UTC_TIMESTAMP(),
    UNIQUE KEY uniq_bugeventsarchive_bug_event_id (bug_event_id),
    INDEX idx_bugeventsarchive_status_archived (status, archived_at)
);

CREATE TABLE IF NOT EXISTS BugEventOccurrenceLedger (
    occurrence_key CHAR(36) PRIMARY KEY,
    fingerprint CHAR(64) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT UTC_TIMESTAMP(),
    INDEX idx_bugevent_occurrence_ledger_fingerprint (fingerprint)
);
