# PHASE 5 admin Edge wrapper audit

- Base main: `b142958e78b4db6fbe77c36f424f797747505f3c`
- Existing `admin-control` v49 is intentionally left untouched.
- New `admin-phase5` handles only PHASE 5 KYC/private-preview/withdrawal-reveal additions and proxies all other admin actions to the existing `admin-control` with the caller JWT.
- `verify_jwt=true` is required on `admin-phase5`.
- KYC list reads `private.kyc_documents.created_at`; it does not reference nonexistent `updated_at`.
- KYC/private preview signed URLs are short-lived and preview access is role/path-gated.
- Withdrawal reveal verifies `withdrawal_requests.destination_id` ownership before decrypting.
- Audit payload for reveal contains only destination id/type/masked value, never account-holder/account-number/USDT plaintext.
- No member deposit/withdrawal/KYC review mutation is performed by deployment or smoke verification.
