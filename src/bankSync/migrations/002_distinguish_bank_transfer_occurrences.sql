-- The old unique hash retained one row per group. Keep that row as occurrence 1.
-- Use the stored hash in the new key. The old-format check makes retries safe.
UPDATE BankTransfers AS bt
JOIN BankStatements AS bs ON bs.Id = bt.BankStatementId
SET bt.OperationHash = SHA2(CONCAT_WS('|',
    1, bs.OurAccountNumber, bt.Direction, bt.OperationHash,
    COALESCE(bt.OrderDate, ''), bt.OperationType
), 256)
WHERE bt.OperationHash = SHA2(CONCAT_WS('|',
    bt.ExecDate, TRIM(TRAILING '.' FROM TRIM(TRAILING '0' FROM bt.Amount)),
    bt.Currency, COALESCE(bt.Description, '')
), 256);
