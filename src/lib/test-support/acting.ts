/**
 * Who is signed in, for the database tests that stand in for the request and nothing else. One object, shared by the test file's `vi.mock` factories
 * (which import it dynamically, so no mocked module is imported while a factory runs) and by the fixtures that act as an officer (wave 3c step 4).
 */
export const who: { actor: unknown } = { actor: null };
