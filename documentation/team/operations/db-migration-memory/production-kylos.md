# Production Kylos DB Migration Memory

Live schema is the source of truth; this is a dated verification record.

- Target: remote-kylos, NODE_ENV=production, envi-konsulting.kylos.pl/envikons_myEnvi.
- Verified 2026-10-11 by Codex, release source c5692c4; global runner verify85 migrations/pending0/drift0 PASS.
- Scoped live information_schema pre/post checks: SigningJobs and DocumentSignatures OfferId/ContractId, nullable LetterId, signing graphic columns, index/FK and CHECK definitions; OFFER_DOCUMENT enum.
- Applied in order at09:17:46UTC: signing004 then005; execution605ms and369ms.
- Raw file SHA256 (runner normalizes CRLF):004 7abb83ece25cc5fb148328d7f679fe1ec1482ddd28ab5ab2d80e36aaaf943e93;005 321e05622047450334ac63927fe1d0a3598259513bd22a982e77b0c1f233f8f8. SchemaMigrations runner receipts match normalized hashes (verify PASS).
- Backup: C:/Users/oram/.envi/release-backups/sig-20261011/signing-pre004005.sql. Rows before: SigningJobs1, SigningJobFiles1, PersonSigningCertificates1, DocumentSignatures1, SchemaMigrations83.
- Rollback: revert code first; retain additive schema. Down removes offer/contract signature register data, so fresh backup required after use. No other migration applied in this run.

- 2026-10-11 (SPR-P, Claude): pending was exactly one: `src/projects/migrations/001_add_project_funding_fields.sql`. Applied by runner at 18:20:10 UTC; `verify` PASS, ledger 86 rows. Live information_schema: `Projects.FundingAgreementNumber` and `Projects.Program`, both `varchar(50)` NULL; Projects 84 rows, both columns empty. Raw file SHA256 1cd7c6b0ac89bef40466864affcd80b6c1659fc19e760906dceb3cc5fcbbf9b0.
- Backup: C:/systems-dev/ps-envi/backups/pre-spr-p_20261011-2019.sql (Projects, SchemaMigrations). Rollback: revert code first; keep the nullable columns (dropping them loses entered values).
