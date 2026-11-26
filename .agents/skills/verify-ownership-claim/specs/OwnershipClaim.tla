--------------------------- MODULE OwnershipClaim ---------------------------
EXTENDS Integers, FiniteSets

CONSTANTS
    Users,          \* Set of authenticated user IDs (e.g., {u1, u2})
    Guests,         \* Set of verified guest session IDs (e.g., {g1})
    Quota,          \* backend/services/ownership.py:24 (CUSTOM_CHALLENGE_QUOTA = 5; bounded for TLC)
    MaxChallenges   \* Finite bound on concurrent private custom Challenge rows in the model

ChallengeIds == 1..MaxChallenges
Null == "NULL"

VARIABLES
    challenges,     \* [ChallengeIds -> [ownerType: {"none", "guest", "user"}, user: Users \cup {Null}, guest: Guests \cup {Null}]]
    userLock,       \* [Users -> BOOLEAN] -- SELECT User.id FOR UPDATE (backend/services/ownership.py:150-154)
    guestLock,      \* [Guests -> BOOLEAN] -- pg_advisory_xact_lock(hashtext(guest_id)) (backend/services/ownership.py:156-164)
    userTx,         \* [Users -> {"idle", "gen", "claim"}]
    guestTx,        \* [Guests -> {"idle", "gen"}]
    claimGuest,     \* [Users -> Guests \cup {Null}]
    claimSnapshot   \* [Users -> SUBSET ChallengeIds]

vars == <<challenges, userLock, guestLock, userTx, guestTx, claimGuest, claimSnapshot>>

\* Matches Challenge.user_id == actor.user_id in backend/services/ownership.py:95-96, 181-186.
UserOwned(u) ==
    {c \in ChallengeIds : challenges[c].ownerType /= "none" /\ challenges[c].user = u}

\* Matches Challenge.session_id == guest_id AND Challenge.user_id IS NULL in backend/services/ownership.py:97-103, 205-211.
GuestUnclaimed(g) ==
    {c \in ChallengeIds :
        challenges[c].ownerType /= "none" /\ challenges[c].guest = g /\ challenges[c].user = Null}

FreeSlots ==
    {c \in ChallengeIds : challenges[c].ownerType = "none"}

\* Domain invariant for challenge ownership fields, actor lock maps, and claim transaction state.
\* Maps to Actor.resolve / _lock_actor_scope in backend/services/ownership.py:61-72, 149-164.
TypeOK ==
    /\ challenges \in [ChallengeIds -> [ownerType: {"none", "guest", "user"},
                                        user: Users \cup {Null},
                                        guest: Guests \cup {Null}]]
    /\ userLock \in [Users -> BOOLEAN]
    /\ guestLock \in [Guests -> BOOLEAN]
    /\ userTx \in [Users -> {"idle", "gen", "claim"}]
    /\ guestTx \in [Guests -> {"idle", "gen"}]
    /\ claimGuest \in [Users -> Guests \cup {Null}]
    /\ claimSnapshot \in [Users -> SUBSET ChallengeIds]

\* Claimed or generated private challenges must never hold both user_id and session_id.
\* backend/services/ownership.py:4-5, 61-72, 232-235; api/routes/challenges.py:398-399.
NoSplitOwnership ==
    \A c \in ChallengeIds :
        ~(challenges[c].user /= Null /\ challenges[c].guest /= Null)

\* Every authenticated user owns at most Quota private custom challenges.
\* backend/services/ownership.py:24, 95-96, 167-193, 213-219; api/routes/challenges.py:365.
UserQuotaNeverExceeded ==
    \A u \in Users : Cardinality(UserOwned(u)) <= Quota

\* Every guest session holds at most Quota unclaimed private custom challenges.
\* backend/services/ownership.py:24, 97-103, 167-193; api/routes/challenges.py:365.
GuestQuotaNeverExceeded ==
    \A g \in Guests : Cardinality(GuestUnclaimed(g)) <= Quota

Init ==
    /\ challenges = [c \in ChallengeIds |-> [ownerType |-> "none", user |-> Null, guest |-> Null]]
    /\ userLock = [u \in Users |-> FALSE]
    /\ guestLock = [g \in Guests |-> FALSE]
    /\ userTx = [u \in Users |-> "idle"]
    /\ guestTx = [g \in Guests |-> "idle"]
    /\ claimGuest = [u \in Users |-> Null]
    /\ claimSnapshot = [u \in Users |-> {}]

\* Acquire User.id FOR UPDATE lock and verify ensure_custom_quota(lock=True) for user u
\* in _persist_custom_challenge (shared by generate_custom_challenge_endpoint and create_custom_challenge_endpoint).
\* api/routes/challenges.py:364-371, 504, 532; backend/services/ownership.py:150-154, 175-193.
BeginGenerateUser(u) ==
    /\ ~userLock[u]
    /\ userTx[u] = "idle"
    /\ Cardinality(UserOwned(u)) + 1 <= Quota
    /\ userLock' = [userLock EXCEPT ![u] = TRUE]
    /\ userTx' = [userTx EXCEPT ![u] = "gen"]
    /\ UNCHANGED <<challenges, guestLock, guestTx, claimGuest, claimSnapshot>>

\* Insert private custom challenge for user u, commit, and release User.id lock.
\* api/routes/challenges.py:382-406; backend/services/ownership.py:68-69.
CommitGenerateUser(u) ==
    /\ userLock[u]
    /\ userTx[u] = "gen"
    /\ IF FreeSlots /= {}
       THEN \E c \in FreeSlots :
                challenges' = [challenges EXCEPT ![c] = [ownerType |-> "user", user |-> u, guest |-> Null]]
       ELSE UNCHANGED challenges
    /\ userLock' = [userLock EXCEPT ![u] = FALSE]
    /\ userTx' = [userTx EXCEPT ![u] = "idle"]
    /\ UNCHANGED <<guestLock, guestTx, claimGuest, claimSnapshot>>

\* Acquire pg_advisory_xact_lock for guest g and verify ensure_custom_quota(lock=True)
\* in _persist_custom_challenge (shared by generate_custom_challenge_endpoint and create_custom_challenge_endpoint).
\* api/routes/challenges.py:364-371, 504, 532; backend/services/ownership.py:156-164, 175-193.
BeginGenerateGuest(g) ==
    /\ ~guestLock[g]
    /\ guestTx[g] = "idle"
    /\ Cardinality(GuestUnclaimed(g)) + 1 <= Quota
    /\ guestLock' = [guestLock EXCEPT ![g] = TRUE]
    /\ guestTx' = [guestTx EXCEPT ![g] = "gen"]
    /\ UNCHANGED <<challenges, userLock, userTx, claimGuest, claimSnapshot>>

\* Insert private custom challenge for guest g, commit, and release guest advisory lock.
\* api/routes/challenges.py:382-406; backend/services/ownership.py:70-71.
CommitGenerateGuest(g) ==
    /\ guestLock[g]
    /\ guestTx[g] = "gen"
    /\ IF FreeSlots /= {}
       THEN \E c \in FreeSlots :
                challenges' = [challenges EXCEPT ![c] = [ownerType |-> "guest", user |-> Null, guest |-> g]]
       ELSE UNCHANGED challenges
    /\ guestLock' = [guestLock EXCEPT ![g] = FALSE]
    /\ guestTx' = [guestTx EXCEPT ![g] = "idle"]
    /\ UNCHANGED <<userLock, userTx, claimGuest, claimSnapshot>>

\* Acquire User.id FOR UPDATE lock ONLY (not guestLock[g]) and snapshot unclaimed rows for g.
\* backend/services/ownership.py:202-211; api/routes/auth.py:99-115, 190, 241, 502-507; api/routes/user.py:486-491.
BeginClaim(u, g) ==
    /\ ~userLock[u]
    /\ userTx[u] = "idle"
    /\ userLock' = [userLock EXCEPT ![u] = TRUE]
    /\ userTx' = [userTx EXCEPT ![u] = "claim"]
    /\ claimGuest' = [claimGuest EXCEPT ![u] = g]
    /\ claimSnapshot' = [claimSnapshot EXCEPT ![u] = GuestUnclaimed(g)]
    /\ UNCHANGED <<challenges, guestLock, guestTx>>

\* Check user quota against snapshot; transfer rows with session_id=NULL or abort on CustomQuotaExceeded; release User.id lock.
\* backend/services/ownership.py:188-193, 213-219, 232-239; api/routes/auth.py:110-113; api/routes/user.py:492-496.
CommitClaim(u, g) ==
    /\ userLock[u]
    /\ userTx[u] = "claim"
    /\ claimGuest[u] = g
    /\ LET snap == claimSnapshot[u]
           cnt == Cardinality(snap)
       IN IF cnt > 0 /\ Cardinality(UserOwned(u)) + cnt > Quota
          THEN UNCHANGED challenges
          ELSE IF \E c \in snap : challenges[c].ownerType = "none"
               THEN UNCHANGED challenges
               ELSE challenges' = [c \in ChallengeIds |->
                        IF c \in snap
                        THEN [ownerType |-> "user", user |-> u, guest |-> Null]
                        ELSE challenges[c]]
    /\ userLock' = [userLock EXCEPT ![u] = FALSE]
    /\ userTx' = [userTx EXCEPT ![u] = "idle"]
    /\ claimGuest' = [claimGuest EXCEPT ![u] = Null]
    /\ claimSnapshot' = [claimSnapshot EXCEPT ![u] = {}]
    /\ UNCHANGED <<guestLock, guestTx>>

\* Delete an allocated private custom challenge without acquiring _lock_actor_scope.
\* api/routes/challenges.py:607-647.
DeleteChallenge(c) ==
    /\ challenges[c].ownerType /= "none"
    /\ challenges' = [challenges EXCEPT ![c] = [ownerType |-> "none", user |-> Null, guest |-> Null]]
    /\ UNCHANGED <<userLock, guestLock, userTx, guestTx, claimGuest, claimSnapshot>>

Next ==
    \/ \E u \in Users : BeginGenerateUser(u) \/ CommitGenerateUser(u)
    \/ \E g \in Guests : BeginGenerateGuest(g) \/ CommitGenerateGuest(g)
    \/ \E u \in Users, g \in Guests : BeginClaim(u, g) \/ CommitClaim(u, g)
    \/ \E c \in ChallengeIds : DeleteChallenge(c)

Spec == Init /\ [][Next]_vars

=============================================================================
