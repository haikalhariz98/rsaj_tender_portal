-- 6.4 and X-6: the second tendering state, in its own migration before anything uses it.
-- Placed before CANCELLED, after PENDING_APPROVAL_FOR_TENDERING, as the schema orders it.
ALTER TYPE "ExerciseStatus" ADD VALUE 'APPROVED_FOR_TENDERING' BEFORE 'CANCELLED';
