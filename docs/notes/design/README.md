# Design notes

One file per problem: `0001-short-topic.md`.

For interaction and flow decisions that need reasoning rather than a component — how a
user gets through a multi-step task, what happens when they are interrupted, what the
screen shows when the thing it describes has not been configured yet.

Each file states:

- **Who** is doing this, how often, and under what conditions
- **The task**, start to finish, including the way it usually goes wrong
- **What was chosen**, and what was rejected
- **The states that are easy to forget** — empty, partial, too much data, no permission,
  offline, and the one where a rule exists but nobody has configured it

Screens are described in terms of the classes already in the design system. If a note
calls for something the design system has no way to draw, that is itself the finding.
