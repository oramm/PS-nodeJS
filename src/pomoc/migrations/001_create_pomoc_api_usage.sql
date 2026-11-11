CREATE TABLE IF NOT EXISTS PomocApiUsage (
    Id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    Time DATETIME(3) NOT NULL,
    Kind VARCHAR(32) NOT NULL,
    UserEmail VARCHAR(254) NOT NULL,
    Model VARCHAR(160) NOT NULL,
    Bucket VARCHAR(16) NOT NULL,
    Tokens JSON NOT NULL,
    CostUsd DECIMAL(18, 10) NOT NULL,
    INDEX idx_pomoc_usage_time (Time),
    INDEX idx_pomoc_usage_user_time (UserEmail, Time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
