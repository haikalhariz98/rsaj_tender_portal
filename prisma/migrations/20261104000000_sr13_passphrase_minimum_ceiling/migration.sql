-- The shortest unseal passphrase has a ceiling as well as a floor, the one the Configuration editor and the policy range hold (12 to 256), so no write reaches a value the editor would refuse.
ALTER TABLE "SecurityPolicy" ADD CONSTRAINT "SecurityPolicy_sealing_passphrase_ceiling" CHECK ("sealingPassphraseMinLength" IS NULL OR "sealingPassphraseMinLength" <= 256);
