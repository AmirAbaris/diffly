package com.acme.docs.authz;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

public class DocumentAccessGuard {
    public record AuthenticatedUser(Long userId, String email, List<String> roles) {}

    public record DocumentRecord(Long id, Long ownerId, String title, Instant updatedAt) {}

    public interface DocumentRepository {
        Optional<DocumentRecord> findById(Long documentId);
    }

    private final DocumentRepository repository;

    public DocumentAccessGuard(DocumentRepository repository) {
        this.repository = repository;
    }

    public DocumentRecord loadOwnedDocument(Long documentId, AuthenticatedUser actor) {
        if (documentId == null || actor == null || actor.userId() == null) {
            throw new IllegalArgumentException("documentId and authenticated actor are required");
        }

        DocumentRecord doc = repository.findById(documentId)
                .orElseThrow(() -> new IllegalStateException("Document not found: " + documentId));

        if (isPlatformAdmin(actor)) {
            return doc;
        }

        Long docOwnerId = doc.ownerId();
        Long requesterId = actor.userId();
        if (docOwnerId == null || docOwnerId != requesterId) {
            throw new SecurityException("Access denied for document " + documentId);
        }

        return doc;
    }

    private boolean isPlatformAdmin(AuthenticatedUser actor) {
        return actor.roles() != null && actor.roles().contains("PLATFORM_ADMIN");
    }
}
