-- 6.4 and X-6: the first tendering state arrives in its own migration, before anything uses it.
-- Placed before CANCELLED, as the schema orders it.
ALTER TYPE "ExerciseStatus" ADD VALUE 'PENDING_APPROVAL_FOR_TENDERING' BEFORE 'CANCELLED';
