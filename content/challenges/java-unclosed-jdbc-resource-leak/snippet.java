package com.acme.billing.repository;

import java.math.BigDecimal;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;
import javax.sql.DataSource;

public class LedgerAuditRepository {
    private static final String SELECT_ENTRIES_SQL = """
            SELECT entry_id, amount_cents, currency
            FROM ledger_entries
            WHERE account_id = ? AND status = 'POSTED'
            ORDER BY created_at DESC
            LIMIT ?
            """;

    private final DataSource dataSource;

    public LedgerAuditRepository(DataSource dataSource) {
        this.dataSource = dataSource;
    }

    public record LedgerEntry(String entryId, BigDecimal amountCents, String currency) {}

    public List<LedgerEntry> findRecentEntries(String accountId, int limit) throws SQLException {
        if (limit <= 0 || limit > 500) {
            throw new IllegalArgumentException("limit must be between 1 and 500");
        }

        Connection conn = dataSource.getConnection();
        PreparedStatement stmt = conn.prepareStatement(SELECT_ENTRIES_SQL);
        stmt.setString(1, accountId);
        stmt.setInt(2, limit);

        ResultSet rs = stmt.executeQuery();
        List<LedgerEntry> entries = new ArrayList<>();

        while (rs.next()) {
            BigDecimal amount = rs.getBigDecimal("amount_cents");
            if (amount == null || amount.signum() == 0) {
                continue;
            }
            entries.add(new LedgerEntry(
                    rs.getString("entry_id"),
                    amount,
                    rs.getString("currency")));
        }

        rs.close();
        stmt.close();
        conn.close();
        return entries;
    }
}
