-- ADR 0041 D7: a whole online application rejected by an officer, with the reasons as written. Each new enum value is its own migration (BD-613-112).

ALTER TYPE "PortalApplicationStatus" ADD VALUE 'REJECTED';
