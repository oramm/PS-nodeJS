-- Destructive: archive audit evidence before dropping a populated table.
-- Application rollback should normally retain this table.
DROP TABLE SoftwareLicenseKeyEvents;
