# Online sealed bids: deployment notes

**For:** whoever runs a copy of the product that takes bids online (SR-13, ADR 0036). **Status:** wave 3b, build plan step 6.

Online sealed bids protect bids at rest and from people, not from the running server (ADR 0036 D13). These notes are what the deployment must do so that the
protection holds. The portal cannot check most of them. Two of them, the public copy's database role (threat model §G must-have 4) and the hardening below
(must-have 5), are recorded on the bid sealing policy as attestations, each with who and when. The screen shows each as "attested, not checked by the portal". An
attestation is never a verification.

## The settings

Every one is a deployment setting, not the customer's policy, and every one is absent by default. Each is read when a request is made: restart the server after
changing one so that every process agrees. `.env.example` describes each in turn.

| Setting | What it does | Absent |
| --- | --- | --- |
| `SEALED_BIDS_DEMONSTRATION_ALLOWED` | Allows online bids that are a demonstration ("Demonstration — not for real tenders"). It is read at publication and at every submission. | No demonstration exercise is published or takes bids. |
| `SEALED_BIDS_LIVE_ALLOWED` | Allows LIVE to be issued, and a LIVE exercise to be published. A LIVE exercise already published keeps taking bids when the flag is cleared (ruling 20i). | LIVE cannot be issued, and no LIVE exercise is published. |
| `BID_UPLOAD_MAX_CONCURRENT` | How many bid parts one process takes at once (a memory guard; each company may also have only one upload in flight). | 3. |
| `SEALING_PEPPER`, `SEALING_PEPPER_ID` | The scrypt pepper: base64 of at least 32 random bytes, and the name it is known by. Both, or neither. | LIVE cannot be issued. A demonstration exercise wraps its officers' keys without a pepper. |

Only the word `true` (or `1`) turns a flag on: `yes`, an empty value or anything else leaves it off.

## The pepper

The pepper is mixed into every opening officer's passphrase before scrypt (ADR 0036 D4). It defends against someone holding a copy of the database, who could otherwise
guess passphrases offline. LIVE requires it.

- **It is kept outside the database**, in the deployment's secret store. The database never holds it.
- **It is backed up apart from the database, and losing it loses every exercise wrapped under it.** Without it, no officer can unlock their key, and the exercise's
  bids cannot be opened: the exercise must be re-tendered. Treat its custody and its backup like the custody of a key to the tender box.
- **The pepper is kept, unchanged, until no opening of any exercise wrapped under it can still follow (ruling 20y, which corrects 20v's "finalised or
  cancelled").** No opening can still follow an exercise when either:
  1. the exercise is cancelled; or
  2. its main opening is finalised, **and** every late online bid in its roll that is not withdrawn is either not admitted (its committee decided not to carry
     it) or admitted and opened at a supplementary opening that is itself finalised.

  An admission not yet tabled, pending or deferred keeps the pepper. The main opening's finalise is not the end: a late bid admitted after it is opened at a
  supplementary opening, which needs every named officer's passphrase, and its finalise needs one, so both need the pepper. Rotating it early, or removing it,
  makes those exercises unopenable exactly as losing it would, and leaves the award blocked. This covers every exercise with any officer wrap under that pepper's
  name, a demonstration exercise included; an exercise wrapped with no pepper is not affected.
- **One pepper at a time.** The deployment holds one `SEALING_PEPPER`, so a new pepper (a new name and new bytes) replaces the old one. It may replace it only once
  no exercise wrapped under the old one can still be opened, by the rule above. An exercise with no submission can be re-keyed under a new pepper: that is the
  remedy if a pepper is lost early, not a reason to rotate early. The bid sealing screen lists, read only, the exercises that still need the pepper this
  deployment holds, so the rule can be checked before a rotation. The list covers one organisation, so a deployment serving several organisations checks each one's list
  before a rotation. Where this copy holds no pepper, or one that is not usable, the list says so and cannot say that nothing needs it: check the copy that holds the pepper.
- **The name binds the bytes.** The product stores, in each wrap, the pepper's name and a short check value derived from its bytes. A copy that holds the right name with
  the wrong bytes (a restore from the wrong backup, a slip in typing) is told so: the act is refused because this copy does not hold that exercise's pepper, and the
  officer's passphrase is never counted as wrong for it.

To make one: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`, and choose a name such as `pepper-2026-10`.

## The host

These answer threat S5 and must-have 5. They are attested on the bid sealing policy, and not checked by the portal.

- **Core dumps are off, and swap is off.** A bid's bytes, an officer's passphrase and the exercise key are in the server's memory for the length of one request
  (ADR 0036 D3). A core dump or a swap file would write them to disk.
- **HTTPS only.** No page or post of the product is served over plain HTTP.
- **No reverse proxy, load balancer or web server in front of the product logs request bodies.** A bid part, a declaration or a passphrase is in a request body.
  Logging headers and the request line is fine; logging a body is not.

## The malware scanner

Each bid part is scanned before it is sealed (ruling 12a), so the scanner reads every bid as it arrives.

- **The scanner runs on the same host** as the product, and is reached **over a local socket**, never across a network.
- **Its temporary directory is a tmpfs**, held in memory, so nothing it reads is written to disk.
- **There is no quarantine and no copy**: a file found to be a threat is refused and discarded, never kept by the scanner.
- Under LIVE a scanner is required, and a file it cannot scan is refused. Only a demonstration without a scanner stores files as not scanned.

## What is logged, and what is left to the edge

The product's sealed access log records every attempt by a signed-in person; where the rate limit refuses repeated attempts, the first in each window is logged
(ruling 20w). A request refused before anyone is signed in (no session, a request from another site, no form token) reached nothing sealed and names nobody, so the
product does not write it to that log: an anonymous flood could otherwise fill it.

Such anonymous refusals are left to the edge access log, if the deployment keeps one: the method, path and status of each request, and never a body.

## The upload routes and the proxy

The multipart upload routes (`/supplier/bids/part`, the registration upload and the two company uploads) are left out of Next's proxy by the matcher in `src/proxy.ts`. Next buffers
a proxied body whole in memory before the route runs and cuts it at 10 MB (`proxyClientMaxBodySize`), which would defeat the route's own guards (answered before a byte of the body
is read, a deadline, a minimum rate) and refuse an honest part between 10 MB and the part's own limit. Those routes now run their own guards first. The product's read deadline and
minimum rate apply to the body as it arrives, but they cannot see a connection that sends nothing at all: **the reverse proxy in front of the public copy must enforce its own
header and body read timeout** (and a maximum body size no larger than the largest part rule), so a stalled connection is cut at the edge. This is the deployment's, not the product's.
