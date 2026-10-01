-- 6.5 and X-6: the advertised state arrives in its own migration, before anything uses it.
-- Placed before CANCELLED, as the schema orders it.
ALTER TYPE "ExerciseStatus" ADD VALUE 'ADVERTISED' BEFORE 'CANCELLED';
