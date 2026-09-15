-- Apply before deploying the invoice series endpoint. Keep receipts across restarts/retries.
CREATE TABLE IF NOT EXISTS InvoiceSeriesRequests (
    RequestId CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    UserId INT NOT NULL,
    RequestPayload TEXT NOT NULL,
    InvoiceIds TEXT NULL,
    CreatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (RequestId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
