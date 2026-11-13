# Time-of-Check to Time-of-Use Race in File Lock

## Description
A daemon process synchronizes singleton execution across system tasks using a filesystem lockfile (`ProcessLock`). Before running the background daemon, `Acquire()` calls `os.Stat(l.path)` to check whether the lockfile already exists. If the file does not exist, it proceeds to invoke `os.Create(l.path)` and writes its process ID.

## Threat Model
Separating the existence check (`os.Stat`) and the file creation (`os.Create`) into two non-atomic system calls creates a classic Time-of-Check to Time-of-Use (TOCTOU / CWE-367) race condition. If two daemon processes start concurrently, both can execute `os.Stat()` simultaneously, observe that the lock does not exist, and both invoke `os.Create()`. This results in two daemon instances running concurrently, causing duplicate job execution, race conditions on shared database tables, and data corruption.
