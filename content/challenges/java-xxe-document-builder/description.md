# XML External Entity (XXE) Injection in DocumentBuilderFactory

## Description

An ingestion service parses incoming partner invoice XML payloads with Java's `DocumentBuilderFactory` to extract `invoiceNumber`, `vendorCode`, and `totalAmount`. Before parsing, it verifies that the payload is non-blank and within a 256 KB size limit.

## Threat Model

External partners or compromised webhook senders control `rawXmlPayload`. Because `DocumentBuilderFactory.newInstance()` enables DTD processing and external entity resolution by default, an attacker can submit a small XML document containing a `<!DOCTYPE>` block with `SYSTEM` or `PARAMETER` entities to read sensitive server files, perform Server-Side Request Forgery (SSRF) against internal services and cloud metadata endpoints, or trigger entity-expansion denial of service (CWE-611).
