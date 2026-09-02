# ADR 0012: Publishing the repository

Status: accepted · Date: 2026-09-02

Value 5 says Haij is open source under AGPL-3.0. Until now that was a
license file in a private repository. This records how the repository
became public, and the one thing that had to happen first.

## One commit held a customer's real books

The onboarding script that carried the first organization's history over
from the previous system read its data from a JSON file next to it, and
that file was committed: a customer's name, CVR number and address, a
named contact, an agreed hourly rate, a year of time entries with notes,
and the invoices with amounts and payment dates. Everything in it is
lawful for Haij to hold and nothing in it belongs in a public repository.

Deleting the file in a new commit would not have been enough. Git keeps
every version of every file, so a deletion is a promise that nobody looks
one commit further back.

## History is rewritten once, and the repository moves

The file is removed from every commit with `git filter-repo`, the
customer's name is replaced in the few comments and fixtures that carried
it, and the result is pushed to a new repository, which is the one made
public. The old private repository stays as a sealed archive and is never
opened.

Why a new repository rather than a force-push: GitHub keeps commits that
no branch points to reachable by hash for as long as it likes, and shows
them in cached views, pull requests and forks. A force-push cleans the
branch, not the server. A repository that never received the commit has
nothing to leak.

Trade-off accepted: every commit hash after the offending one changes,
so a reference to a hash from before this date points nowhere, and the
production deployment has to be pointed at the new repository. Both are
one-time costs. Rewriting history is otherwise something this project
does not do, and this ADR is the record of the exception.

## What keeps it from happening again

Real import data lives outside the repository. `.gitignore` refuses every
JSON file in `scripts/data/` except a made-up example in the same shape,
and the script takes the path to the real file as an argument instead of
finding it next to itself. Test fixtures name invented companies, with
CVR and GLN numbers that pass the checks without belonging to anyone;
the author's own company details are the one deliberate exception,
because they are public registry data about the person publishing the
code. Secrets were never in the history: `.env` has been ignored since
the initial commit, the secret scan in CI has run since the first day,
and a sweep of every commit before publishing found only the localhost
development credentials from the compose file.

## What going public does not change

Registration on the hosted instance stays closed. The software is public;
the installation is not. Anyone can run Haij; nobody can make themselves
an organization inside someone else's.
