using Microsoft.EntityFrameworkCore;

namespace Acme.Billing.Data.Repositories;

public sealed record InvoiceSummary(Guid Id, string TenantId, string Status, decimal TotalAmount);

public sealed class BillingDbContext(DbContextOptions<BillingDbContext> options) : DbContext(options)
{
    public DbSet<InvoiceSummary> Invoices => Set<InvoiceSummary>();
}

public sealed class InvoiceSearchRepository(BillingDbContext dbContext)
{
    private const int MaxPageSize = 100;

    public async Task<IReadOnlyList<InvoiceSummary>> SearchByStatusAsync(
        string tenantId,
        string statusFilter,
        int pageSize,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(tenantId))
        {
            throw new ArgumentException("Tenant ID is required.", nameof(tenantId));
        }

        int boundedLimit = Math.Clamp(pageSize, 1, MaxPageSize);
        string normalizedStatus = statusFilter?.Trim() ?? string.Empty;

        string query =
            $"SELECT Id, TenantId, Status, TotalAmount " +
            $"FROM Invoices " +
            $"WHERE TenantId = '{tenantId}' AND Status LIKE '%{normalizedStatus}%' " +
            $"ORDER BY TotalAmount DESC";

        return await dbContext.Invoices
            .FromSqlRaw(query)
            .AsNoTracking()
            .Take(boundedLimit)
            .ToListAsync(cancellationToken);
    }
}
