-- ADR 0041 D4 (REG-4): the terms and conditions of registration, agreed by one tick with the Personal Data Notice. Each new enum value is its own migration (BD-613-112).

ALTER TYPE "DeclarationKind" ADD VALUE 'TERMS_AND_CONDITIONS';
