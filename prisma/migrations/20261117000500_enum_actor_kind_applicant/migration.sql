-- ADR 0041 D3: the sender of an online application, not signed in. Never SYSTEM, which would say a machine acted. Each new enum value is its own migration (BD-613-112).

ALTER TYPE "ActorKind" ADD VALUE 'APPLICANT';
