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

- 2026-10-19 (SBD, Claude, GO wlasciciela w czacie): pending bylo dokladnie 4, wszystkie `sbAccess`: 003 (Levels), 004 (klucz publiczny, token urzadzenia, SbAccessSecrets), 005 (raport zdrowia), 006 (UNIQUE DeviceTokenHash). Runner apply 14:20:54-55 UTC, `verify` PASS (repo 90, pending 0, drift 0). Live information_schema: 6 nowych kolumn SbAccess, SbAccessSecrets 0 wierszy, `uq_sbaccess_devicetokenhash` unikalny, akcje SET_LEVELS/SET_KEY/GIVE_SECRET/TAKE_SECRET/ISSUE_TOKEN/REQUEST_HEALTH. Release source 73d673c.
- Raw SHA256: 003 ac5a88b42b545c3ad31bb76da75bfcff60e8a64e6ab6424b3b38ab8c1f3fe087; 004 18d2687a77b1beed64e98f544dc60b46003ee371827e5a27312c2ed7740c845e; 005 67b856d30be4dc8c2e9dc9890e33996888c70ceef4e346d4003087f7a9db011a; 006 a75c3e94d6e2fd536d285b8727aa0a99631c7cfad2575aaa2a004bc7495ef3af.
- Backup: C:/systems-dev/ps-envi/backups/pre-sbd_20261019-1620.sql (SbAccess*, StaffMembers, SchemaMigrations). Rollback: revert code first; kolumny i tabela sa addytywne - zostawic; SbAccessSecrets mozna skasowac bez utraty niczego poza szyfrogramami (admin udostepnia ponownie).
