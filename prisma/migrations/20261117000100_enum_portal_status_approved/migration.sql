-- ADR 0041 D6: a whole online application approved on its route. Each new enum value is its own migration (BD-613-112).

ALTER TYPE "PortalApplicationStatus" ADD VALUE 'APPROVED';
