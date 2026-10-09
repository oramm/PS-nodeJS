-- Rollback dla 001_create_signing_jobs.sql
--
-- UWAGA: kasuje slad audytowy zlecen podpisu i zapamietane certyfikaty osob. Wczesniej wycofaj
-- 003 i 002 (tabele zalezne), a przed uruchomieniem zrob kopie:
--   SELECT * FROM SigningJobs;
--   SELECT * FROM PersonSigningCertificates;
-- Cofniecie schematu bez cofniecia kodu serwera konczy sie bledem zapytan o SigningJobs.

DROP TABLE IF EXISTS PersonSigningCertificates;
DROP TABLE IF EXISTS SigningJobs;
