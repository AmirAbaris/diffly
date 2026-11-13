# Unbounded Channel Buffer and Memory Exhaustion

## Description
A Rust telemetry ingestion daemon receives high-frequency sensor readings from edge IoT devices and passes them across async tasks to a storage batcher that writes records to disk. Communication between the ingestion front-end and the storage worker is orchestrated using a Tokio `mpsc::unbounded_channel`.

## Threat Model
In an asynchronous pipeline where producer ingestion throughput exceeds consumer storage throughput, an unbounded channel allows queued events to accumulate indefinitely in process heap memory. When network packet spikes occur or downstream disk I/O degrades, the unconstrained channel buffer continues allocating RAM until the operating system experiences severe memory pressure and triggers the Linux kernel OOM (Out Of Memory) killer, crashing the entire service without warning.
